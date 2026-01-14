/**
 * OMT Plugin - Contract Validation & Observation Library
 *
 * Main export for contract validation, state management, and observation utilities.
 */

export * from './types.js';
export * from './contract-validator.js';
export * from './state-manager.js';
export * from './observation-logger.js';

// Re-export commonly used classes
export { ContractValidator } from './contract-validator.js';
export { StateManager } from './state-manager.js';
export { ObservationLogger } from './observation-logger.js';
