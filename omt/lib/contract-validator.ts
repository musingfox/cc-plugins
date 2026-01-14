/**
 * Contract Validator
 *
 * Validates agent input/output contracts to ensure agents receive
 * correct inputs and produce expected outputs.
 */

import {
  AgentContract,
  ContractValidationResult,
  FieldValidationResult,
  AgentExecutionContext,
  ContractField,
} from './types.js';

export class ContractValidator {
  /**
   * Validate input contract before agent execution
   */
  static validateInput(
    contract: AgentContract,
    context: AgentExecutionContext
  ): ContractValidationResult {
    const errors: FieldValidationResult[] = [];
    const warnings: FieldValidationResult[] = [];

    // Validate required fields
    for (const field of contract.input_contract.required) {
      const result = this.validateField(
        field,
        context.input_data,
        true
      );

      if (result.status === 'missing' || result.status === 'invalid') {
        errors.push(result);
      }
    }

    // Validate optional fields (only if present)
    if (contract.input_contract.optional) {
      for (const field of contract.input_contract.optional) {
        const result = this.validateField(
          field,
          context.input_data,
          false
        );

        if (result.status === 'invalid') {
          warnings.push(result);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate output contract after agent execution
   */
  static validateOutput(
    contract: AgentContract,
    context: AgentExecutionContext
  ): ContractValidationResult {
    const errors: FieldValidationResult[] = [];
    const warnings: FieldValidationResult[] = [];

    if (!context.output_data) {
      errors.push({
        field: '__root__',
        status: 'missing',
        message: 'No output data provided',
      });

      return {
        valid: false,
        errors,
        warnings,
        timestamp: new Date().toISOString(),
      };
    }

    // Validate required output fields
    for (const field of contract.output_contract.required) {
      const result = this.validateField(
        field,
        context.output_data,
        true
      );

      if (result.status === 'missing' || result.status === 'invalid') {
        errors.push(result);
      }
    }

    // Validate optional output fields
    if (contract.output_contract.optional) {
      for (const field of contract.output_contract.optional) {
        const result = this.validateField(
          field,
          context.output_data,
          false
        );

        if (result.status === 'invalid') {
          warnings.push(result);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Validate a single field
   */
  private static validateField(
    field: ContractField,
    data: Record<string, unknown>,
    required: boolean
  ): FieldValidationResult {
    const value = data[field.field_name];

    // Check if field exists
    if (value === undefined || value === null) {
      return {
        field: field.field_name,
        status: required ? 'missing' : 'valid',
        message: required
          ? `Required field "${field.field_name}" is missing`
          : undefined,
      };
    }

    // Type validation
    if (field.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== field.type && field.type !== 'any') {
        return {
          field: field.field_name,
          status: 'invalid',
          message: `Field "${field.field_name}" expected type "${field.type}", got "${actualType}"`,
          actualValue: value,
        };
      }
    }

    // Custom validation rules
    if (field.validation) {
      for (const rule of field.validation) {
        const validationResult = this.applyValidationRule(
          field.field_name,
          value,
          rule
        );

        if (!validationResult.valid) {
          return {
            field: field.field_name,
            status: 'invalid',
            message: validationResult.message,
            actualValue: value,
          };
        }
      }
    }

    return {
      field: field.field_name,
      status: 'valid',
      actualValue: value,
    };
  }

  /**
   * Apply a validation rule
   */
  private static applyValidationRule(
    fieldName: string,
    value: unknown,
    rule: string
  ): { valid: boolean; message?: string } {
    // Parse rule format: "operator value" or "pattern"

    // String length validation
    if (rule.startsWith('minLength:')) {
      const minLength = parseInt(rule.split(':')[1]);
      if (typeof value === 'string' && value.length < minLength) {
        return {
          valid: false,
          message: `"${fieldName}" must be at least ${minLength} characters`,
        };
      }
    }

    if (rule.startsWith('maxLength:')) {
      const maxLength = parseInt(rule.split(':')[1]);
      if (typeof value === 'string' && value.length > maxLength) {
        return {
          valid: false,
          message: `"${fieldName}" must be at most ${maxLength} characters`,
        };
      }
    }

    // Array validation
    if (rule.startsWith('minItems:')) {
      const minItems = parseInt(rule.split(':')[1]);
      if (Array.isArray(value) && value.length < minItems) {
        return {
          valid: false,
          message: `"${fieldName}" must have at least ${minItems} items`,
        };
      }
    }

    // Regex pattern validation
    if (rule.startsWith('pattern:')) {
      const pattern = rule.substring(8);
      const regex = new RegExp(pattern);
      if (typeof value === 'string' && !regex.test(value)) {
        return {
          valid: false,
          message: `"${fieldName}" does not match required pattern: ${pattern}`,
        };
      }
    }

    // File existence validation
    if (rule === 'fileExists') {
      // This would need fs access - handled by caller
      return { valid: true };
    }

    return { valid: true };
  }

  /**
   * Format validation result for human-readable output
   */
  static formatValidationResult(
    result: ContractValidationResult,
    type: 'input' | 'output'
  ): string {
    const lines: string[] = [];

    lines.push(`${type.toUpperCase()} Contract Validation:`);
    lines.push(`Status: ${result.valid ? '✓ PASSED' : '✗ FAILED'}`);
    lines.push(`Timestamp: ${result.timestamp}`);
    lines.push('');

    if (result.errors.length > 0) {
      lines.push('Errors:');
      for (const error of result.errors) {
        lines.push(`  ✗ ${error.field}: ${error.message || error.status}`);
      }
      lines.push('');
    }

    if (result.warnings.length > 0) {
      lines.push('Warnings:');
      for (const warning of result.warnings) {
        lines.push(`  ⚠ ${warning.field}: ${warning.message || warning.status}`);
      }
      lines.push('');
    }

    if (result.valid) {
      lines.push('All required fields validated successfully.');
    }

    return lines.join('\n');
  }
}
