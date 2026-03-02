#!/usr/bin/env bun
/**
 * OMT CLI — Manages the .agents/ workspace infrastructure.
 *
 * Subcommands:
 *   init [--task-mgmt <system>]   Create .agents/ directory structure
 *   validate --agent <name> --phase <input|output> --data '<json>'
 *   status                        Show current workspace state
 *   state-check                   Cross-check state consistency
 *   state-sync                    Infer state from output files
 */

import * as fs from 'fs';
import * as path from 'path';
import { ContractValidator } from '../lib/contract-validator.js';
import { WorkflowStateManager } from '../lib/state-manager.js';
import type {
  WorkflowState,
  AgentStatus,
  AgentContract,
  AgentExecutionContext,
} from '../lib/types.js';

// ---------------------------------------------------------------------------
// Constants (replaces states.yml + config.yml)
// ---------------------------------------------------------------------------

const COMPLEXITY_SCALE = {
  values: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89],
  token_estimates: {
    1: 1000, 2: 2000, 3: 3000, 5: 5000, 8: 8000,
    13: 13000, 21: 21000, 34: 34000, 55: 55000, 89: 89000,
  },
} as const;

const TASK_STATES = {
  pending:     { description: 'Task created, waiting to start',       next: ['in_progress', 'blocked', 'cancelled'] },
  in_progress: { description: 'Task in progress',                     next: ['completed', 'blocked', 'failed'] },
  blocked:     { description: 'Task blocked, requires intervention',  next: ['in_progress', 'cancelled'] },
  completed:   { description: 'Task completed',                       next: [] },
  failed:      { description: 'Task failed',                          next: ['pending', 'cancelled'] },
  cancelled:   { description: 'Task cancelled',                       next: [] },
} as const;

const AGENT_STATES = {
  idle:      'Agent idle, waiting for tasks',
  working:   'Agent working',
  completed: 'Agent completed its part',
  blocked:   'Agent encountered issues',
  skipped:   'Agent skipped',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function flag(name: string): string | undefined {
  const idx = Bun.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= Bun.argv.length) return undefined;
  return Bun.argv[idx + 1];
}

function resolveWorkspaceRoot(): string {
  return process.cwd();
}

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------

async function cmdInit() {
  const taskMgmt = flag('--task-mgmt') ?? 'local';
  const root = resolveWorkspaceRoot();
  const agentsDir = path.join(root, '.agents');

  // Create directory structure
  const dirs = [
    agentsDir,
    path.join(agentsDir, 'outputs'),
    path.join(agentsDir, '.state'),
    path.join(agentsDir, '.state', 'tasks'),
  ];
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }

  // .agents/.gitignore — ignore .state/
  fs.writeFileSync(path.join(agentsDir, '.gitignore'), '.state/\n');

  // .agents/.state/config.json
  const config = {
    workspace: {
      version: '3.0.0',
      initialized_at: new Date().toISOString(),
    },
    task_management: {
      system: taskMgmt,
    },
    complexity_scale: COMPLEXITY_SCALE,
    task_states: Object.fromEntries(
      Object.entries(TASK_STATES).map(([k, v]) => [k, v.description]),
    ),
    agent_states: AGENT_STATES,
  };
  fs.writeFileSync(
    path.join(agentsDir, '.state', 'config.json'),
    JSON.stringify(config, null, 2) + '\n',
  );

  // .agents/.state/workflow-state.json (unified state)
  if (!fs.existsSync(path.join(agentsDir, '.state', 'workflow-state.json'))) {
    const initialState: WorkflowState = {
      phase: null,
      goal: undefined,
      started_at: undefined,
      updated_at: undefined,
      agents: {
        pm: { status: 'pending', output: null },
        arch: { status: 'pending', output: null },
        dev: [],
        reviewer: [],
      },
      consensus: {
        status: 'pending',
        decision_points: [],
        user_decisions: null,
      },
      execution: {
        tasks_total: 0,
        tasks_completed: 0,
        current_task: 0,
        failure_count: 0,
        max_failures: 3,
        tasks: [],
      },
      event_log: [],
    };
    fs.writeFileSync(
      path.join(agentsDir, '.state', 'workflow-state.json'),
      JSON.stringify(initialState, null, 2) + '\n',
    );
  }

  console.log('Workspace initialized:');
  console.log(`  .agents/`);
  console.log(`  .agents/outputs/`);
  console.log(`  .agents/.state/`);
  console.log(`  .agents/.state/tasks/`);
  console.log(`  .agents/.gitignore`);
  console.log(`  .agents/.state/config.json`);
  console.log(`  .agents/.state/workflow-state.json`);
  console.log(`  task_management: ${taskMgmt}`);
}

// ---------------------------------------------------------------------------
// validate
// ---------------------------------------------------------------------------

async function cmdValidate() {
  const agentName = flag('--agent');
  const phase = flag('--phase') as 'input' | 'output' | undefined;
  const dataRaw = flag('--data');

  if (!agentName) die('--agent is required');
  if (!phase || !['input', 'output'].includes(phase)) die('--phase must be "input" or "output"');
  if (!dataRaw) die('--data is required (JSON string)');

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataRaw);
  } catch {
    die('--data must be valid JSON');
  }

  // Resolve contract file relative to this CLI's location (inside omt/)
  const pluginRoot = path.resolve(import.meta.dir, '..');
  const contractPath = path.join(pluginRoot, 'contracts', `${agentName}.json`);

  if (!fs.existsSync(contractPath)) {
    die(`Contract not found: ${contractPath}`);
  }

  const contract: AgentContract = JSON.parse(fs.readFileSync(contractPath, 'utf-8'));

  const context: AgentExecutionContext = {
    agent: agentName,
    task_id: 'cli-validate',
    phase,
    input_data: phase === 'input' ? data : {},
    output_data: phase === 'output' ? data : undefined,
  };

  const result = phase === 'input'
    ? ContractValidator.validateInput(contract, context)
    : ContractValidator.validateOutput(contract, context);

  console.log(ContractValidator.formatValidationResult(result, phase));
  process.exit(result.valid ? 0 : 1);
}

// ---------------------------------------------------------------------------
// status
// ---------------------------------------------------------------------------

async function cmdStatus() {
  const root = resolveWorkspaceRoot();
  const stateDir = path.join(root, '.agents', '.state');

  if (!fs.existsSync(stateDir)) {
    die('.agents/.state/ not found — run `bun run omt/bin/cli.ts init` first');
  }

  const readJson = (file: string) => {
    const p = path.join(stateDir, file);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  };

  const state: WorkflowState | null = readJson('workflow-state.json');
  const config = readJson('config.json');

  console.log('=== OMT Workspace Status ===\n');

  if (config) {
    console.log(`Version: ${config.workspace?.version ?? 'unknown'}`);
    console.log(`Initialized: ${config.workspace?.initialized_at ?? 'unknown'}`);
    console.log(`Task Management: ${config.task_management?.system ?? 'unknown'}`);
    console.log();
  }

  if (state) {
    console.log(`Phase: ${state.phase ?? '(none)'}`);
    if (state.goal) console.log(`Goal: ${state.goal}`);
    if (state.updated_at) console.log(`Last Updated: ${state.updated_at}`);

    // Agent statuses — single agents
    const singleAgents = ['pm', 'arch'] as const;
    const agentLines: string[] = [];
    for (const name of singleAgents) {
      agentLines.push(`${name}: ${state.agents[name].status}`);
    }
    // Array agents
    for (const name of ['dev', 'reviewer'] as const) {
      const entries = state.agents[name];
      if (entries.length > 0) {
        const completed = entries.filter(e => e.status === 'completed').length;
        agentLines.push(`${name}: ${completed}/${entries.length} completed`);
      }
    }
    console.log(`Agents: ${agentLines.join(', ')}`);

    // Consensus
    if (state.consensus) {
      console.log(`Consensus: ${state.consensus.status ?? '(none)'}`);
    }

    if (state.execution) {
      console.log(`Execution: ${state.execution.tasks_completed}/${state.execution.tasks_total} tasks (failures: ${state.execution.failure_count})`);
    }

    // Resumable indicator
    const phase = state.phase;
    const isTerminal = phase === null || phase === 'completed' || phase === 'aborted';
    if (!isTerminal && phase) {
      console.log(`Resumable: YES (interrupted at phase '${phase}')`);
    }

    // Event log (last 5 entries)
    if (state.event_log && state.event_log.length > 0) {
      console.log();
      console.log(`Event Log (last ${Math.min(5, state.event_log.length)} of ${state.event_log.length}):`);
      const recentEvents = state.event_log.slice(-5);
      for (const event of recentEvents) {
        const stageInfo = event.stage_id ? ` [${event.stage_id}]` : '';
        const detail = event.detail ? ` — ${event.detail}` : '';
        console.log(`  ${event.timestamp} ${event.agent} ${event.type}${stageInfo}${detail}`);
      }
    }

    console.log();
  } else {
    console.log('No workflow state found. Run `bun run omt/bin/cli.ts init` first.');
  }
}

// ---------------------------------------------------------------------------
// state-check
// ---------------------------------------------------------------------------

async function cmdStateCheck() {
  const root = resolveWorkspaceRoot();
  const stateDir = path.join(root, '.agents', '.state');
  const outputsDir = path.join(root, '.agents', 'outputs');

  if (!fs.existsSync(stateDir)) {
    die('.agents/.state/ not found — run `bun run omt/bin/cli.ts init` first');
  }

  const statePath = path.join(stateDir, 'workflow-state.json');
  if (!fs.existsSync(statePath)) {
    console.log('No workflow-state.json found — nothing to check.');
    return;
  }

  const state: WorkflowState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  const issues: string[] = [];

  // Cross-check output file existence vs agent status claims
  const agentOutputMap: Record<string, string> = {
    pm: path.join(outputsDir, 'pm.md'),
    arch: path.join(outputsDir, 'arch.md'),
  };

  for (const [agent, expectedPath] of Object.entries(agentOutputMap)) {
    const agentEntry = state.agents[agent as 'pm' | 'arch'];
    if (!agentEntry) continue;

    const fileExists = fs.existsSync(expectedPath);

    if (agentEntry.status === 'completed' && !fileExists) {
      issues.push(`Agent '${agent}' claims completed but output file missing: ${expectedPath}`);
    }
    if (agentEntry.status === 'pending' && fileExists) {
      issues.push(`Agent '${agent}' status is 'pending' but output file exists: ${expectedPath}`);
    }
  }

  // Check dev output (supports both per-stage dev/ directory and standalone dev.md)
  const devOutput = path.join(outputsDir, 'dev.md');
  const devDir = path.join(outputsDir, 'dev');
  if (state.execution && state.execution.tasks_completed > 0) {
    const hasDevOutput = fs.existsSync(devOutput) || fs.existsSync(devDir);
    if (!hasDevOutput) {
      issues.push(`Execution claims ${state.execution.tasks_completed} tasks completed but neither dev.md nor dev/ directory found`);
    }
  }

  // Check staleness: updated_at > 24h with non-terminal phase
  const TERMINAL = new Set(['completed', 'aborted', null]);
  if (state.updated_at && !TERMINAL.has(state.phase)) {
    const updatedAt = new Date(state.updated_at).getTime();
    const now = Date.now();
    const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 24) {
      issues.push(`Stale session: phase '${state.phase}' has not been updated for ${Math.round(hoursSinceUpdate)}h`);
    }
  }

  // Phase vs consensus consistency
  if (state.phase === 'execution' && state.consensus?.status !== 'approved') {
    issues.push(`Phase is 'execution' but consensus status is '${state.consensus?.status ?? 'missing'}' (expected 'approved')`);
  }

  // Dev/reviewer array vs execution tasks consistency
  if (state.execution.tasks.length !== state.agents.dev.length && state.agents.dev.length > 0) {
    issues.push(`Execution has ${state.execution.tasks.length} task records but dev has ${state.agents.dev.length} entries`);
  }

  console.log('=== OMT State Consistency Check ===\n');

  if (issues.length === 0) {
    console.log('PASS — No issues found.');
  } else {
    console.log(`ISSUES FOUND (${issues.length}):\n`);
    for (const issue of issues) {
      console.log(`  - ${issue}`);
    }
  }

  process.exit(issues.length > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// state-sync — Infer state from output files
// ---------------------------------------------------------------------------

async function cmdStateSync() {
  const root = resolveWorkspaceRoot();
  const stateDir = path.join(root, '.agents', '.state');
  const outputsDir = path.join(root, '.agents', 'outputs');

  if (!fs.existsSync(stateDir)) {
    die('.agents/.state/ not found — run `bun run omt/bin/cli.ts init` first');
  }

  const statePath = path.join(stateDir, 'workflow-state.json');
  if (!fs.existsSync(statePath)) {
    die('No workflow-state.json found — run `bun run omt/bin/cli.ts init` first');
  }

  const state: WorkflowState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  let changes = 0;

  // Infer PM status from output file
  const pmOutput = path.join(outputsDir, 'pm.md');
  if (fs.existsSync(pmOutput) && state.agents.pm.status !== 'completed') {
    state.agents.pm.status = 'completed';
    state.agents.pm.output = '.agents/outputs/pm.md';
    changes++;
    console.log('  Synced: pm → completed (output file exists)');
  }

  // Infer Arch status from output file
  const archOutput = path.join(outputsDir, 'arch.md');
  if (fs.existsSync(archOutput) && state.agents.arch.status !== 'completed') {
    state.agents.arch.status = 'completed';
    state.agents.arch.output = '.agents/outputs/arch.md';
    changes++;
    console.log('  Synced: arch → completed (output file exists)');
  }

  // Infer dev stages from dev/ directory
  const devDir = path.join(outputsDir, 'dev');
  if (fs.existsSync(devDir)) {
    const devFiles = fs.readdirSync(devDir).filter(f => f.endsWith('.md'));
    for (const file of devFiles) {
      const stageId = file.replace('.md', '');
      const alreadyTracked = state.execution.tasks.some(t => t.id === stageId);
      if (!alreadyTracked) {
        state.execution.tasks.push({
          id: stageId,
          description: `(synced from ${file})`,
          status: 'completed',
          dev_report: `.agents/outputs/dev/${file}`,
          review_report: '',
          completed_at: new Date().toISOString(),
        });
        changes++;
        console.log(`  Synced: execution task '${stageId}' (dev report exists)`);
      }
    }
    // Update tasks_completed count
    const completedCount = state.execution.tasks.filter(t => t.status === 'completed').length;
    if (state.execution.tasks_completed !== completedCount) {
      state.execution.tasks_completed = completedCount;
      changes++;
    }
  }

  // Infer review stages from reviews/ directory
  const reviewsDir = path.join(outputsDir, 'reviews');
  if (fs.existsSync(reviewsDir)) {
    const reviewFiles = fs.readdirSync(reviewsDir).filter(f => f.endsWith('.md'));
    for (const file of reviewFiles) {
      const stageId = file.replace('.md', '');
      const task = state.execution.tasks.find(t => t.id === stageId);
      if (task && !task.review_report) {
        task.review_report = `.agents/outputs/reviews/${file}`;
        changes++;
        console.log(`  Synced: review report for '${stageId}'`);
      }
    }
  }

  // Infer phase from overall state
  if (state.phase === 'init' || state.phase === null) {
    if (state.execution.tasks_completed > 0) {
      state.phase = 'execution';
      changes++;
      console.log(`  Synced: phase → execution (tasks completed)`);
    } else if (state.consensus?.status === 'approved') {
      state.phase = 'execution';
      changes++;
      console.log(`  Synced: phase → execution (consensus approved)`);
    } else if (state.agents.arch.status === 'completed') {
      state.phase = 'consensus';
      changes++;
      console.log(`  Synced: phase → consensus (arch completed)`);
    } else if (state.agents.pm.status === 'completed') {
      state.phase = 'arch';
      changes++;
      console.log(`  Synced: phase → arch (pm completed)`);
    }
  }

  if (changes > 0) {
    state.updated_at = new Date().toISOString();
    state.event_log.push({
      timestamp: new Date().toISOString(),
      agent: 'cli',
      type: 'milestone',
      detail: `state-sync: ${changes} corrections applied`,
    });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
    console.log(`\nState synced: ${changes} corrections applied.`);
  } else {
    console.log('State is already in sync — no corrections needed.');
  }
}

// ---------------------------------------------------------------------------
// Main routing
// ---------------------------------------------------------------------------

const subcommand = Bun.argv[2];

switch (subcommand) {
  case 'init':
    await cmdInit();
    break;
  case 'validate':
    await cmdValidate();
    break;
  case 'status':
    await cmdStatus();
    break;
  case 'state-check':
    await cmdStateCheck();
    break;
  case 'state-sync':
    await cmdStateSync();
    break;
  default:
    console.log(`Usage: bun run omt/bin/cli.ts <command>

Commands:
  init [--task-mgmt <system>]    Initialize .agents/ workspace
  validate --agent <name> --phase <input|output> --data '<json>'
  status                         Show workspace state
  state-check                    Cross-check state consistency
  state-sync                     Infer state from output files`);
    process.exit(subcommand ? 1 : 0);
}
