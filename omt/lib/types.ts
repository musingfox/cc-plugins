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
