# Contract Validation Patterns and Examples

## Common Patterns

### Pattern 1: Sequential Agent Workflow

When Agent B depends on Agent A's output:

```
1. Agent A completes execution
2. Validate Agent A's output contract
3. Record Agent A results via StateManager
4. Read Agent A's output files as Agent B's input
5. Validate Agent B's input contract against Agent A's output
6. Execute Agent B
```

This is the standard OMT pipeline: @hive → @pm → @arch → (Consensus) → @dev → @reviewer (per stage).

### Pattern 2: Error Recovery

When output validation fails on a recoverable field:

```
1. Run ContractValidator.validateOutput()
2. If validation fails:
   a. Check which fields failed (e.g., tests_status)
   b. If recoverable: fix the issue (e.g., fix failing tests)
   c. Re-validate after fix
   d. If still failing: escalate to user
3. If validation passes: proceed to state update
```

### Pattern 3: Pre-flight Check

Before starting any agent work, verify all prerequisites:

```
1. Read the agent's contract file from contracts/<agent-name>.json
2. For each source in input_contract.source:
   - Use Read tool to check if the file exists
   - Verify it contains expected content (not empty)
3. For each required field in input_contract.required:
   - Apply validation rules
   - Report any failures before starting work
4. Only proceed if all input validations pass
```

## Debugging Guide

### Check Validation Details

When validation fails, examine the full result:

```
1. Read the contract file: contracts/<agent-name>.json
2. Read each source file listed in input_contract.source
3. Compare actual data against contract requirements
4. Check validation rules one by one
```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Missing required field | Source file doesn't exist or is empty | Check upstream agent completed successfully |
| Type mismatch | Data structure doesn't match contract | Verify the producing agent's output format |
| Validation rule failed | Actual value doesn't match rule pattern | Check the specific rule and actual value |
| State update failed | .state/state.json is corrupted or locked | Reset state.json from last known good state |

## Best Practices

1. **Validate early**: Check input contract before doing any work
2. **Validate completely**: Never skip output validation
3. **Report clearly**: Use `ContractValidator.formatValidationResult()` for readable output
4. **Update state**: Always record validation results in .state/state.json via StateManager
5. **Handle errors gracefully**: Decide whether to fix, retry, or escalate to user
6. **Chain validations**: One agent's output validation feeds into the next agent's input validation

## Complete Example: Dev Agent Execution

This shows the full lifecycle of the @dev agent with contract validation:

```
=== @dev Agent Execution ===

1. LOAD CONTRACT
   Read contracts/dev.json

2. GATHER INPUT
   Read outputs/pm.md      → requirements (from @pm)
   Read outputs/arch.md    → architecture (from @arch)
   Use Glob to find existing tests in tests/

3. VALIDATE INPUT
   Call ContractValidator.validateInput() with:
   - agent: "dev"
   - task_id: current task
   - phase: "execution"
   - input_data: { requirements, architecture, existing_tests }

   If invalid → STOP and report errors

4. EXECUTE TDD WORKFLOW
   Red → Green → Refactor cycle
   Create test files in tests/
   Create/modify implementation files in src/

5. COLLECT OUTPUT
   Use Glob to list tests/**/*.test.ts → test_files
   Use Glob to list src/**/*.ts → implementation_files
   Run tests and capture status → tests_status (e.g., "15/15 passed")

6. VALIDATE OUTPUT
   Call ContractValidator.validateOutput() with:
   - agent: "dev"
   - output_data: { test_files, implementation_files, tests_status }

   If invalid → attempt fix or escalate

7. UPDATE STATE
   Call StateManager.recordExecutionAgent("dev", validationResult)
   This updates .agents/.state/state.json with execution results

8. DONE
   Report completion status to @hive
```
