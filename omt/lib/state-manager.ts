/**
 * Workflow State Manager
 *
 * Unified state manager replacing the split StateManager/HiveStateManager.
 * Manages workflow-state.json for agent workflow coordination.
 * Tracks phase progression, agent statuses, execution tasks, and event log.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  WorkflowState,
  WorkflowPhase,
  AgentStatus,
  AgentEntry,
  ExecutionTask,
  EventLogEntry,
} from './types.js';

const TERMINAL_PHASES: ReadonlySet<WorkflowPhase | null> = new Set([
  'completed',
  'aborted',
  null,
]);

export class WorkflowStateManager {
  private statePath: string;

  constructor(workspaceRoot: string) {
    this.statePath = path.join(
      workspaceRoot,
      '.agents',
      '.state',
      'workflow-state.json',
    );
  }

  async readState(): Promise<WorkflowState | null> {
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

  async saveState(state: WorkflowState): Promise<void> {
    state.updated_at = new Date().toISOString();
    const dir = path.dirname(this.statePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(
      this.statePath,
      JSON.stringify(state, null, 2),
      'utf-8',
    );
  }

  async setPhase(phase: WorkflowPhase): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No workflow state found');
    }
    state.phase = phase;
    await this.saveState(state);
  }

  /**
   * Update agent status. Supports both single agents (pm, arch)
   * and array agents (dev, reviewer) via optional stageId.
   */
  async updateAgentStatus(
    agent: string,
    status: AgentStatus,
    output?: string,
    stageId?: string,
  ): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No workflow state found');
    }

    if (agent === 'pm' || agent === 'arch') {
      state.agents[agent].status = status;
      if (output !== undefined) {
        state.agents[agent].output = output;
      }
    } else if (agent === 'dev' || agent === 'reviewer') {
      const entry: AgentEntry = {
        status,
        output: output ?? null,
      };
      // Find existing entry for this stage or append
      if (stageId) {
        const existing = state.agents[agent].findIndex(
          (e) => e.output?.includes(stageId) ||
            (e.status === 'running' && e.output === null),
        );
        if (existing >= 0) {
          state.agents[agent][existing] = entry;
        } else {
          state.agents[agent].push(entry);
        }
      } else {
        state.agents[agent].push(entry);
      }
    }

    await this.saveState(state);
  }

  /**
   * Update execution fields individually, avoiding Object.assign
   * shallow merge that overwrites nested arrays.
   */
  async updateExecution(
    updates: Partial<Omit<WorkflowState['execution'], 'tasks'>>,
  ): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No workflow state found');
    }

    if (updates.tasks_total !== undefined) {
      state.execution.tasks_total = updates.tasks_total;
    }
    if (updates.tasks_completed !== undefined) {
      state.execution.tasks_completed = updates.tasks_completed;
    }
    if (updates.current_task !== undefined) {
      state.execution.current_task = updates.current_task;
    }
    if (updates.failure_count !== undefined) {
      state.execution.failure_count = updates.failure_count;
    }
    if (updates.max_failures !== undefined) {
      state.execution.max_failures = updates.max_failures;
    }

    await this.saveState(state);
  }

  /**
   * Append a task to execution.tasks without overwriting existing entries.
   */
  async appendTask(task: ExecutionTask): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No workflow state found');
    }
    state.execution.tasks.push(task);
    await this.saveState(state);
  }

  /**
   * Append an event to the event_log (append-only audit trail).
   */
  async reportEvent(event: Omit<EventLogEntry, 'timestamp'>): Promise<void> {
    const state = await this.readState();
    if (!state) {
      throw new Error('No workflow state found');
    }
    state.event_log.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
    await this.saveState(state);
  }

  async isResumable(): Promise<boolean> {
    const state = await this.readState();
    if (!state) return false;
    return !TERMINAL_PHASES.has(state.phase);
  }

  static createInitialState(goal: string): WorkflowState {
    const now = new Date().toISOString();
    return {
      phase: 'init',
      goal,
      started_at: now,
      updated_at: now,
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
  }
}
