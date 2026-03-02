/**
 * Agent Contract Types
 *
 * Defines the structure for agent input/output contracts
 * based on the Contract-First design principle.
 */

export interface ContractField {
  field_name: string;
  description: string;
  type?: string;
  validation?: string[];
}

export interface ContractSource {
  location: string;
  description?: string;
}

export interface InputContract {
  required: ContractField[];
  optional?: ContractField[];
  source: ContractSource[];
}

export interface OutputContract {
  required: ContractField[];
  optional?: ContractField[];
  destination: string[];
}

export interface AgentMethod {
  name: string;
  description: string;
  steps?: string[];
}

export interface AgentContract {
  agent: string;
  description: string;
  method: AgentMethod;
  input_contract: InputContract;
  output_contract: OutputContract;
  validation?: string[];
  complexity_range?: [number, number];
}

/**
 * Validation Result Types
 */

export interface FieldValidationResult {
  field: string;
  status: 'valid' | 'invalid' | 'missing';
  message?: string;
  actualValue?: unknown;
}

export interface ContractValidationResult {
  valid: boolean;
  errors: FieldValidationResult[];
  warnings: FieldValidationResult[];
  timestamp: string;
}

export interface AgentExecutionContext {
  agent: string;
  task_id: string;
  phase: string;
  input_data: Record<string, unknown>;
  output_data?: Record<string, unknown>;
}

/**
 * Workflow State Types
 *
 * Unified state schema replacing the split StateManager/HiveStateManager.
 */

export type WorkflowPhase =
  | 'init'
  | 'pm'
  | 'arch'
  | 'consensus'
  | 'execution'
  | 'completed'
  | 'aborted'
  | 'escalated';

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentEntry {
  status: AgentStatus;
  output: string | null;
}

export interface ExecutionTask {
  id: string;
  description: string;
  status: string;
  dev_report: string;
  review_report: string;
  started_at?: string;
  completed_at?: string;
}

export interface EventLogEntry {
  timestamp: string;
  agent: string;
  type: 'check_in' | 'check_out' | 'status_change' | 'error' | 'milestone';
  stage_id?: string;
  detail?: string;
}

export interface WorkflowState {
  phase: WorkflowPhase | null;
  goal?: string;
  started_at?: string;
  updated_at?: string;
  agents: {
    pm: AgentEntry;
    arch: AgentEntry;
    dev: AgentEntry[];
    reviewer: AgentEntry[];
  };
  consensus: {
    status: 'pending' | 'approved' | 'modified' | 'aborted';
    decision_points: unknown[];
    user_decisions: unknown | null;
  };
  execution: {
    tasks_total: number;
    tasks_completed: number;
    current_task: number;
    failure_count: number;
    max_failures: number;
    tasks: ExecutionTask[];
  };
  event_log: EventLogEntry[];
}
