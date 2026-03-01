#!/usr/bin/env bun
/**
 * OMT CLI — Manages the .agents/ workspace infrastructure.
 *
 * Subcommands:
 *   init [--task-mgmt <system>]   Create .agents/ directory structure
 *   validate --agent <name> --phase <input|output> --data '<json>'
 *   status                        Show current workspace state
 */

import * as fs from 'fs';
import * as path from 'path';
import { ContractValidator } from '../lib/contract-validator.js';
import { HiveStateManager } from '../lib/state-manager.js';
import type { HiveState, AgentStatus } from '../lib/state-manager.js';
import type { AgentContract, AgentExecutionContext } from '../lib/types.js';

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
      version: '2.0.0',
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

  // .agents/.state/state.json (empty initial state)
  if (!fs.existsSync(path.join(agentsDir, '.state', 'state.json'))) {
    fs.writeFileSync(
      path.join(agentsDir, '.state', 'state.json'),
      JSON.stringify({ task_id: null, current_phase: null, context: {} }, null, 2) + '\n',
    );
  }

  // .agents/.state/hive-state.json (full initial state matching HiveState schema)
  if (!fs.existsSync(path.join(agentsDir, '.state', 'hive-state.json'))) {
    const initialHiveState: HiveState = {
      phase: null,
      goal: undefined,
      started_at: undefined,
      updated_at: undefined,
      agents: {
        pm: { status: 'pending', output: null },
        arch: { status: 'pending', output: null },
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
    };
    fs.writeFileSync(
      path.join(agentsDir, '.state', 'hive-state.json'),
      JSON.stringify(initialHiveState, null, 2) + '\n',
    );
  }

  console.log('Workspace initialized:');
  console.log(`  .agents/`);
  console.log(`  .agents/outputs/`);
  console.log(`  .agents/.state/`);
  console.log(`  .agents/.state/tasks/`);
  console.log(`  .agents/.gitignore`);
  console.log(`  .agents/.state/config.json`);
  console.log(`  .agents/.state/state.json`);
  console.log(`  .agents/.state/hive-state.json`);
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

  const hiveState = readJson('hive-state.json');
  const state = readJson('state.json');
  const config = readJson('config.json');

  console.log('=== OMT Workspace Status ===\n');

  if (config) {
    console.log(`Version: ${config.workspace?.version ?? 'unknown'}`);
    console.log(`Initialized: ${config.workspace?.initialized_at ?? 'unknown'}`);
    console.log(`Task Management: ${config.task_management?.system ?? 'unknown'}`);
    console.log();
  }

  if (hiveState) {
    console.log(`Hive Phase: ${hiveState.phase ?? '(none)'}`);
    if (hiveState.goal) console.log(`Goal: ${hiveState.goal}`);
    if (hiveState.updated_at) console.log(`Last Updated: ${hiveState.updated_at}`);

    // Agent statuses
    if (hiveState.agents) {
      const agents = hiveState.agents as Record<string, { status: string; output: string | null }>;
      const agentLines = Object.entries(agents)
        .map(([name, info]) => `${name}: ${info.status}`)
        .join(', ');
      console.log(`Agents: ${agentLines}`);
    }

    // Consensus
    if (hiveState.consensus) {
      console.log(`Consensus: ${hiveState.consensus.status ?? '(none)'}`);
    }

    if (hiveState.execution) {
      console.log(`Execution: ${hiveState.execution.tasks_completed ?? 0}/${hiveState.execution.tasks_total ?? 0} tasks (failures: ${hiveState.execution.failure_count ?? 0})`);
    }

    // Resumable indicator
    const phase = hiveState.phase as string | null;
    const isTerminal = phase === null || phase === 'completed' || phase === 'aborted';
    if (!isTerminal && phase) {
      console.log(`Resumable: YES (interrupted at phase '${phase}')`);
    }

    console.log();
  }

  if (state) {
    console.log(`Task: ${state.task_id ?? '(none)'}`);
    console.log(`Phase: ${state.current_phase ?? '(none)'}`);
    if (state.planning?.agents_executed) {
      console.log(`Planning agents: ${state.planning.agents_executed.join(', ')}`);
    }
    if (state.execution?.agents_completed) {
      console.log(`Execution agents: ${state.execution.agents_completed.join(', ')}`);
    }
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

  const hiveStatePath = path.join(stateDir, 'hive-state.json');
  if (!fs.existsSync(hiveStatePath)) {
    console.log('No hive-state.json found — nothing to check.');
    return;
  }

  const hiveState: HiveState = JSON.parse(fs.readFileSync(hiveStatePath, 'utf-8'));
  const issues: string[] = [];

  // Cross-check output file existence vs agent status claims
  const agentOutputMap: Record<string, string> = {
    pm: path.join(outputsDir, 'pm.md'),
    arch: path.join(outputsDir, 'arch.md'),
  };

  if (hiveState.agents) {
    for (const [agent, expectedPath] of Object.entries(agentOutputMap)) {
      const agentEntry = (hiveState.agents as Record<string, { status: AgentStatus; output: string | null }>)[agent];
      if (!agentEntry) continue;

      const fileExists = fs.existsSync(expectedPath);

      if (agentEntry.status === 'completed' && !fileExists) {
        issues.push(`Agent '${agent}' claims completed but output file missing: ${expectedPath}`);
      }
      if (agentEntry.status === 'pending' && fileExists) {
        issues.push(`Agent '${agent}' status is 'pending' but output file exists: ${expectedPath}`);
      }
    }
  }

  // Check dev output (supports both per-stage dev/ directory and standalone dev.md)
  const devOutput = path.join(outputsDir, 'dev.md');
  const devDir = path.join(outputsDir, 'dev');
  if (hiveState.execution && hiveState.execution.tasks_completed > 0) {
    const hasDevOutput = fs.existsSync(devOutput) || fs.existsSync(devDir);
    if (!hasDevOutput) {
      issues.push(`Execution claims ${hiveState.execution.tasks_completed} tasks completed but neither dev.md nor dev/ directory found`);
    }
  }

  // Check staleness: updated_at > 24h with non-terminal phase
  const TERMINAL_PHASES = new Set(['completed', 'aborted', null]);
  if (hiveState.updated_at && !TERMINAL_PHASES.has(hiveState.phase)) {
    const updatedAt = new Date(hiveState.updated_at).getTime();
    const now = Date.now();
    const hoursSinceUpdate = (now - updatedAt) / (1000 * 60 * 60);
    if (hoursSinceUpdate > 24) {
      issues.push(`Stale session: phase '${hiveState.phase}' has not been updated for ${Math.round(hoursSinceUpdate)}h`);
    }
  }

  // Phase vs consensus consistency
  if (hiveState.phase === 'execution' && hiveState.consensus?.status !== 'approved') {
    issues.push(`Phase is 'execution' but consensus status is '${hiveState.consensus?.status ?? 'missing'}' (expected 'approved')`);
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
  default:
    console.log(`Usage: bun run omt/bin/cli.ts <command>

Commands:
  init [--task-mgmt <system>]    Initialize .agents/ workspace
  validate --agent <name> --phase <input|output> --data '<json>'
  status                         Show workspace state
  state-check                    Cross-check state consistency`);
    process.exit(subcommand ? 1 : 0);
}
