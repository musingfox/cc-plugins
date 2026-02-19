/**
 * State Manager
 *
 * Manages state.json for agent workflow coordination.
 * Handles reading, writing, and updating agent execution state.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ContractValidationResult } from './types.js';

export interface AgentOutputRecord {
  agent: string;
  output_file: string;
  contract_validated: boolean;
  validation_results?: Record<string, string>;
  timestamp?: string;
}

export interface PlanningState {
  agents_executed: string[];
  outputs: Record<string, AgentOutputRecord>;
}

export interface ExecutionState {
  current_agent?: string;
  input_provided?: Record<string, unknown>;
  expected_output?: Record<string, unknown>;
  agents_completed: string[];
}

export interface ReviewState {
  code_quality?: {
    status: string;
    issues: number;
  };
  security?: {
    status: string;
    vulnerabilities: number;
  };
}

export interface TaskState {
  task_id: string;
  title: string;
  current_phase: 'planning' | 'execution' | 'review' | 'complete';
  planning?: PlanningState;
  execution?: ExecutionState;
  review?: ReviewState;
  context: {
    complexity_estimate?: number;
    files_involved?: number;
    scope_overflow?: boolean;
  };
}

export class StateManager {
  private workspaceRoot: string;
  private statePath: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.statePath = path.join(workspaceRoot, '.agents', '.state', 'state.json');
  }

  /**
   * Initialize new task state
   */
  async initTask(taskId: string, title: string): Promise<TaskState> {
    const state: TaskState = {
      task_id: taskId,
      title,
      current_phase: 'planning',
      context: {},
    };

    await this.saveState(state);
    return state;
  }

  /**
   * Read current state
   */
  async readState(): Promise<TaskState | null> {
    try {
      const data = await fs.promises.readFile(this.statePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Save state
   */
  async saveState(state: TaskState): Promise<void> {
    const dir = path.dirname(this.statePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.statePath,
      JSON.stringify(state, null, 2),
      'utf-8'
    );
  }

  /**
   * Update planning phase
   */
  async recordPlanningAgent(
    agentName: string,
    outputFile: string,
    validationResult: ContractValidationResult
  ): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No active task state found');
    }

    if (!state.planning) {
      state.planning = {
        agents_executed: [],
        outputs: {},
      };
    }

    state.planning.agents_executed.push(agentName);
    state.planning.outputs[agentName] = {
      agent: agentName,
      output_file: outputFile,
      contract_validated: validationResult.valid,
      validation_results: this.formatValidationForState(validationResult),
      timestamp: validationResult.timestamp,
    };

    await this.saveState(state);
  }

  /**
   * Update execution phase
   */
  async recordExecutionAgent(
    agentName: string,
    validationResult: ContractValidationResult
  ): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No active task state found');
    }

    if (!state.execution) {
      state.execution = {
        agents_completed: [],
      };
    }

    state.execution.agents_completed.push(agentName);
    state.execution.current_agent = undefined;

    await this.saveState(state);
  }

  /**
   * Set current phase
   */
  async setPhase(phase: TaskState['current_phase']): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No active task state found');
    }

    state.current_phase = phase;
    await this.saveState(state);
  }

  /**
   * Update context
   */
  async updateContext(updates: Partial<TaskState['context']>): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No active task state found');
    }

    state.context = {
      ...state.context,
      ...updates,
    };

    await this.saveState(state);
  }

  /**
   * Format validation results for state.json
   */
  private formatValidationForState(
    result: ContractValidationResult
  ): Record<string, string> {
    const formatted: Record<string, string> = {};

    for (const error of result.errors) {
      formatted[error.field] = `✗ ${error.message || error.status}`;
    }

    for (const warning of result.warnings) {
      formatted[warning.field] = `⚠ ${warning.message || warning.status}`;
    }

    if (result.valid) {
      formatted['__status__'] = '✓ all valid';
    }

    return formatted;
  }

  /**
   * Get outputs directory path
   */
  getOutputsDir(): string {
    return path.join(this.workspaceRoot, '.agents', 'outputs');
  }

  /**
   * Ensure outputs directory exists
   */
  async ensureOutputsDir(): Promise<string> {
    const outputsDir = this.getOutputsDir();
    await fs.promises.mkdir(outputsDir, { recursive: true });
    return outputsDir;
  }
}

// ---------------------------------------------------------------------------
// Hive State Manager
//
// Manages hive-state.json for @hive lifecycle coordination.
// Tracks phase progression, agent statuses, and execution state.
// Used by CLI tooling — agents interact via Read/Write tools directly.
// ---------------------------------------------------------------------------

export type HivePhase =
  | 'init'
  | 'pm'
  | 'arch'
  | 'consensus'
  | 'execution'
  | 'completed'
  | 'aborted'
  | 'escalated';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface HiveAgentEntry {
  status: AgentStatus;
  output: string | null;
}

export interface HiveState {
  phase: HivePhase | null;
  goal?: string;
  started_at?: string;
  updated_at?: string;
  agents?: {
    pm: HiveAgentEntry;
    arch: HiveAgentEntry;
  };
  consensus?: {
    status: 'pending' | 'approved' | 'modified' | 'aborted';
    decision_points: unknown[];
    user_decisions: unknown | null;
  };
  execution?: {
    tasks_total: number;
    tasks_completed: number;
    current_task: number;
    failure_count: number;
    max_failures: number;
  };
}

const TERMINAL_PHASES: ReadonlySet<HivePhase | null> = new Set([
  'completed',
  'aborted',
  null,
]);

export class HiveStateManager {
  private hiveStatePath: string;

  constructor(workspaceRoot: string) {
    this.hiveStatePath = path.join(
      workspaceRoot,
      '.agents',
      '.state',
      'hive-state.json',
    );
  }

  async readState(): Promise<HiveState | null> {
    try {
      const data = await fs.promises.readFile(this.hiveStatePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async saveState(state: HiveState): Promise<void> {
    state.updated_at = new Date().toISOString();
    const dir = path.dirname(this.hiveStatePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.hiveStatePath,
      JSON.stringify(state, null, 2),
      'utf-8',
    );
  }

  async setPhase(phase: HivePhase): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No hive state found');
    }
    state.phase = phase;
    await this.saveState(state);
  }

  async updateAgentStatus(
    agent: 'pm' | 'arch',
    status: AgentStatus,
    output?: string,
  ): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No hive state found');
    }
    if (!state.agents) {
      state.agents = {
        pm: { status: 'pending', output: null },
        arch: { status: 'pending', output: null },
      };
    }
    state.agents[agent].status = status;
    if (output !== undefined) {
      state.agents[agent].output = output;
    }
    await this.saveState(state);
  }

  async updateExecution(
    updates: Partial<NonNullable<HiveState['execution']>>,
  ): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No hive state found');
    }
    if (!state.execution) {
      state.execution = {
        tasks_total: 0,
        tasks_completed: 0,
        current_task: 0,
        failure_count: 0,
        max_failures: 3,
      };
    }
    Object.assign(state.execution, updates);
    await this.saveState(state);
  }

  async isResumable(): Promise<boolean> {
    const state = await this.readState();
    if (!state) return false;
    return !TERMINAL_PHASES.has(state.phase);
  }

  static createInitialState(goal: string): HiveState {
    return {
      phase: 'init',
      goal,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
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
      },
    };
  }
}
