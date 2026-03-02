import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkflowStateManager } from '../state-manager.js';
import type { WorkflowState } from '../types.js';

describe('WorkflowStateManager', () => {
  let tmpDir: string;
  let mgr: WorkflowStateManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omt-test-'));
    mgr = new WorkflowStateManager(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeInitialState(overrides?: Partial<WorkflowState>): WorkflowState {
    const state = { ...WorkflowStateManager.createInitialState('test goal'), ...overrides };
    const stateDir = path.join(tmpDir, '.agents', '.state');
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(
      path.join(stateDir, 'workflow-state.json'),
      JSON.stringify(state, null, 2),
    );
    return state;
  }

  describe('createInitialState', () => {
    it('should create state with all required fields', () => {
      const state = WorkflowStateManager.createInitialState('Build auth system');
      expect(state.phase).toBe('init');
      expect(state.goal).toBe('Build auth system');
      expect(state.agents.pm.status).toBe('pending');
      expect(state.agents.arch.status).toBe('pending');
      expect(state.agents.dev).toEqual([]);
      expect(state.agents.reviewer).toEqual([]);
      expect(state.execution.tasks).toEqual([]);
      expect(state.event_log).toEqual([]);
      expect(state.started_at).toBeDefined();
      expect(state.updated_at).toBeDefined();
    });
  });

  describe('readState / saveState', () => {
    it('should return null when no state file exists', async () => {
      const state = await mgr.readState();
      expect(state).toBeNull();
    });

    it('should read previously saved state', async () => {
      writeInitialState();
      const state = await mgr.readState();
      expect(state).not.toBeNull();
      expect(state!.goal).toBe('test goal');
    });

    it('should update updated_at on save', async () => {
      const initial = writeInitialState();
      const originalUpdatedAt = initial.updated_at;
      // Wait a tick to ensure timestamp changes
      await new Promise(r => setTimeout(r, 10));
      await mgr.saveState(initial);
      const reread = await mgr.readState();
      expect(reread!.updated_at).not.toBe(originalUpdatedAt);
    });
  });

  describe('setPhase', () => {
    it('should update the phase', async () => {
      writeInitialState();
      await mgr.setPhase('pm');
      const state = await mgr.readState();
      expect(state!.phase).toBe('pm');
    });

    it('should throw when no state exists', async () => {
      expect(mgr.setPhase('pm')).rejects.toThrow('No workflow state found');
    });
  });

  describe('updateAgentStatus', () => {
    it('should update pm status', async () => {
      writeInitialState();
      await mgr.updateAgentStatus('pm', 'running');
      const state = await mgr.readState();
      expect(state!.agents.pm.status).toBe('running');
    });

    it('should update arch status with output', async () => {
      writeInitialState();
      await mgr.updateAgentStatus('arch', 'completed', '.agents/outputs/arch.md');
      const state = await mgr.readState();
      expect(state!.agents.arch.status).toBe('completed');
      expect(state!.agents.arch.output).toBe('.agents/outputs/arch.md');
    });

    it('should append dev entries', async () => {
      writeInitialState();
      await mgr.updateAgentStatus('dev', 'running', undefined, 'stage-1');
      await mgr.updateAgentStatus('dev', 'completed', '.agents/outputs/dev/stage-1.md', 'stage-1');
      const state = await mgr.readState();
      expect(state!.agents.dev.length).toBe(1);
      expect(state!.agents.dev[0].status).toBe('completed');
    });

    it('should append reviewer entries', async () => {
      writeInitialState();
      await mgr.updateAgentStatus('reviewer', 'completed', '.agents/outputs/reviews/stage-1.md', 'stage-1');
      const state = await mgr.readState();
      expect(state!.agents.reviewer.length).toBe(1);
    });
  });

  describe('updateExecution', () => {
    it('should update individual execution fields without overwriting tasks', async () => {
      const initial = writeInitialState();
      // Pre-populate a task
      initial.execution.tasks.push({
        id: 'stage-1',
        description: 'existing task',
        status: 'completed',
        dev_report: 'report.md',
        review_report: 'review.md',
      });
      await mgr.saveState(initial);

      await mgr.updateExecution({ tasks_completed: 1, current_task: 2 });
      const state = await mgr.readState();
      expect(state!.execution.tasks_completed).toBe(1);
      expect(state!.execution.current_task).toBe(2);
      // Tasks array must be preserved
      expect(state!.execution.tasks.length).toBe(1);
      expect(state!.execution.tasks[0].id).toBe('stage-1');
    });
  });

  describe('appendTask', () => {
    it('should append a task to the tasks array', async () => {
      writeInitialState();
      await mgr.appendTask({
        id: 'stage-1',
        description: 'Core auth',
        status: 'completed',
        dev_report: '.agents/outputs/dev/stage-1.md',
        review_report: '.agents/outputs/reviews/stage-1.md',
        completed_at: new Date().toISOString(),
      });
      const state = await mgr.readState();
      expect(state!.execution.tasks.length).toBe(1);
      expect(state!.execution.tasks[0].id).toBe('stage-1');
    });

    it('should not overwrite existing tasks', async () => {
      writeInitialState();
      await mgr.appendTask({
        id: 'stage-1',
        description: 'First',
        status: 'completed',
        dev_report: 'a.md',
        review_report: 'b.md',
      });
      await mgr.appendTask({
        id: 'stage-2',
        description: 'Second',
        status: 'completed',
        dev_report: 'c.md',
        review_report: 'd.md',
      });
      const state = await mgr.readState();
      expect(state!.execution.tasks.length).toBe(2);
      expect(state!.execution.tasks[0].id).toBe('stage-1');
      expect(state!.execution.tasks[1].id).toBe('stage-2');
    });
  });

  describe('reportEvent', () => {
    it('should append an event with timestamp', async () => {
      writeInitialState();
      await mgr.reportEvent({
        agent: 'dev',
        type: 'check_in',
        stage_id: 'stage-1',
      });
      const state = await mgr.readState();
      expect(state!.event_log.length).toBe(1);
      expect(state!.event_log[0].agent).toBe('dev');
      expect(state!.event_log[0].type).toBe('check_in');
      expect(state!.event_log[0].timestamp).toBeDefined();
    });

    it('should preserve existing events (append-only)', async () => {
      writeInitialState();
      await mgr.reportEvent({ agent: 'pm', type: 'check_in' });
      await mgr.reportEvent({ agent: 'pm', type: 'check_out', detail: 'status: completed' });
      await mgr.reportEvent({ agent: 'arch', type: 'check_in' });
      const state = await mgr.readState();
      expect(state!.event_log.length).toBe(3);
      expect(state!.event_log[0].agent).toBe('pm');
      expect(state!.event_log[2].agent).toBe('arch');
    });
  });

  describe('isResumable', () => {
    it('should return false when no state exists', async () => {
      expect(await mgr.isResumable()).toBe(false);
    });

    it('should return true for non-terminal phases', async () => {
      writeInitialState({ phase: 'execution' });
      expect(await mgr.isResumable()).toBe(true);
    });

    it('should return false for completed phase', async () => {
      writeInitialState({ phase: 'completed' });
      expect(await mgr.isResumable()).toBe(false);
    });

    it('should return false for null phase', async () => {
      writeInitialState({ phase: null });
      expect(await mgr.isResumable()).toBe(false);
    });

    it('should return true for escalated phase', async () => {
      writeInitialState({ phase: 'escalated' });
      expect(await mgr.isResumable()).toBe(true);
    });
  });
});
