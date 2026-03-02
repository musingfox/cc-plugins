/**
 * OMT Plugin - Contract Validation & State Management Library
 *
 * Main export for contract validation and state management utilities.
 */

export * from './types.js';
export * from './contract-validator.js';
export * from './state-manager.js';
export * from './state-reporter.js';

// Re-export commonly used classes
export { ContractValidator } from './contract-validator.js';
export { WorkflowStateManager } from './state-manager.js';
export { reportAgentEvent, agentCheckIn, agentCheckOut } from './state-reporter.js';
