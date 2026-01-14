/**
 * OMT Plugin - Contract Validation Library
 *
 * Main export for contract validation and state management utilities.
 */

export * from './types.js';
export * from './contract-validator.js';
export * from './state-manager.js';

// Re-export commonly used classes
export { ContractValidator } from './contract-validator.js';
export { StateManager } from './state-manager.js';
