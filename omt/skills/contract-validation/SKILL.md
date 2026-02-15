---
name: contract-validation
description: >-
  Activated when an OMT agent starts or finishes execution, when debugging a failed agent run,
  or when verifying state.json updates. Validates input/output contracts using the Contract-First
  pattern defined in contracts/*.json and lib/contract-validator.ts.
---

# Contract Validation Skill

Validates agent input and output contracts using the Contract-First design pattern. Every OMT agent has a contract in `contracts/<agent-name>.json` that defines required inputs, outputs, and validation rules.

## Core Concepts

### Agent Contract Structure

Every agent must define:
1. **Input Contract**: What the agent needs to start (sources, required fields, validation rules)
2. **Output Contract**: What the agent must produce (required fields, destinations)
3. **Validation Rules**: How to verify correctness (see `references/validation-rules.md`)

### Contract Validation Flow

```
1. Read agent contract: contracts/<agent-name>.json
2. Gather input data from contract's source locations
3. Validate input contract
4. Execute agent logic
5. Validate output contract
6. Update state.json with results
```

## How to Validate

### Step 1: Read the Contract

Use the Read tool to load the agent's contract definition:

```
Read contracts/dev.json
```

The contract specifies `input_contract.source` — a list of file paths to gather input from.

### Step 2: Validate Input Before Execution

Before starting agent work:

1. **Gather input data** — For each source in `input_contract.source`, use the Read tool to check the file exists and has content:
   - Read `outputs/pm.md` (requirements from @pm)
   - Read `outputs/arch.md` (architecture from @arch)
   - Use Glob to find existing files matching patterns (e.g., `tests/**/*.test.ts`)

2. **Check required fields** — For each field in `input_contract.required`:
   - Verify the data exists and is not empty
   - Apply validation rules (e.g., `fileExists`, `minLength:N`)
   - If any required field fails: **stop and report errors**

3. **Record validation** — Use `ContractValidator.validateInput()` from `lib/contract-validator.ts` and log the result.

### Step 3: Validate Output After Execution

After completing agent work:

1. **Collect output data** — Gather all outputs specified in `output_contract.required`:
   - Use Glob to list created files (e.g., `tests/**/*.test.ts`, `src/**/*.ts`)
   - Capture execution results (e.g., test status: "15/15 passed")

2. **Check output requirements** — For each field in `output_contract.required`:
   - Verify data exists and meets validation rules
   - Check arrays have minimum items (`minItems:N`)
   - Check strings match patterns (`pattern:REGEX`)

3. **Update state** — Use `StateManager.recordExecutionAgent()` from `lib/state-manager.ts` to record results in `.agents/.state/state.json`.

## Example: Dev Agent Contract

The `contracts/dev.json` contract defines:

**Input** (from @pm and @arch):
- `requirements` — Requirements document (`outputs/pm.md`, validation: `fileExists`)
- `architecture` — Architecture design (`outputs/arch.md`, validation: `fileExists`)
- `existing_tests` — Optional existing test files

**Output** (to `tests/`, `src/`, `outputs/dev.md`):
- `test_files` — Created test files (validation: `minItems:1`)
- `implementation_files` — Modified source files (validation: `minItems:1`)
- `tests_status` — Test execution status (validation: `pattern:^\d+/\d+ passed$`)

## References

- **Validation rules and contract schema**: `references/validation-rules.md`
- **Patterns, debugging, and complete examples**: `references/patterns-and-examples.md`
- **Contract definitions**: `contracts/pm.json`, `contracts/arch.json`, `contracts/dev.json`
- **Runtime libraries**: `lib/contract-validator.ts`, `lib/state-manager.ts`
