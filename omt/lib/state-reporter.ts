/**
 * Agent State Reporter
 *
 * Lightweight utility for agents to report events to workflow-state.json.
 * Used by agent prompts for check-in/check-out protocol.
 *
 * Usage in agent prompts (pseudocode):
 *   import { reportAgentEvent } from '${CLAUDE_PLUGIN_ROOT}/lib/state-reporter.js';
 *   await reportAgentEvent(process.cwd(), { agent: 'dev', type: 'check_in', stage_id: 'stage-1' });
 */

import { WorkflowStateManager } from './state-manager.js';
import type { EventLogEntry, AgentStatus } from './types.js';

export interface AgentEventReport {
  agent: string;
  type: EventLogEntry['type'];
  stage_id?: string;
  detail?: string;
}

/**
 * Report an agent event to the workflow state event log.
 * Best-effort: silently returns false if state file doesn't exist.
 */
export async function reportAgentEvent(
  workspaceRoot: string,
  event: AgentEventReport,
): Promise<boolean> {
  const mgr = new WorkflowStateManager(workspaceRoot);
  const state = await mgr.readState();
  if (!state) return false;

  try {
    await mgr.reportEvent(event);
    return true;
  } catch {
    return false;
  }
}

/**
 * Agent check-in: report start and optionally set agent status to 'running'.
 * Best-effort: silently returns false if state file doesn't exist.
 */
export async function agentCheckIn(
  workspaceRoot: string,
  agent: string,
  stageId?: string,
): Promise<boolean> {
  const mgr = new WorkflowStateManager(workspaceRoot);
  const state = await mgr.readState();
  if (!state) return false;

  try {
    await mgr.reportEvent({
      agent,
      type: 'check_in',
      stage_id: stageId,
    });

    // Update agent status to running
    if (agent === 'pm' || agent === 'arch') {
      await mgr.updateAgentStatus(agent, 'running');
    } else if (agent === 'dev' || agent === 'reviewer') {
      await mgr.updateAgentStatus(agent, 'running', undefined, stageId);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Agent check-out: report completion and optionally set agent status.
 * Best-effort: silently returns false if state file doesn't exist.
 */
export async function agentCheckOut(
  workspaceRoot: string,
  agent: string,
  status: AgentStatus = 'completed',
  output?: string,
  stageId?: string,
): Promise<boolean> {
  const mgr = new WorkflowStateManager(workspaceRoot);
  const state = await mgr.readState();
  if (!state) return false;

  try {
    await mgr.reportEvent({
      agent,
      type: 'check_out',
      stage_id: stageId,
      detail: `status: ${status}`,
    });

    await mgr.updateAgentStatus(agent, status, output, stageId);
    return true;
  } catch {
    return false;
  }
}
