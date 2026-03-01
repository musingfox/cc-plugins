# Contract Validation System

OMT uses **Contract-First** design principles to ensure agents execute correctly. Each agent must define clear input/output contracts, validated before and after execution.

## Core Concepts

### Why Contract Validation?

1. **Correctness**: Verify all required inputs exist before an agent starts
2. **Early Error Detection**: Catch problems before agents begin work
3. **Clear Expectations**: Each agent knows exactly what it must produce
4. **Traceability**: All validation results recorded in `.agents/.state/state.json`

### Contract-First vs. Ad-hoc

```
Ad-hoc (old):
  Agent starts → discovers missing input → fails → wastes context

Contract-First:
  Define Contract → Validate Input → Execute Agent → Validate Output → Success
```

## Architecture

### 1. TypeScript Libraries

Located in `lib/`:

- **types.ts**: Contract type definitions
- **contract-validator.ts**: Validation logic
- **state-manager.ts**: `.agents/.state/state.json` management
- **index.ts**: Main exports

### 2. Agent Contracts

Located in `contracts/`, one JSON file per agent:

- **pm.json**: PM agent contract
- **arch.json**: Architecture agent contract
- **dev.json**: Dev agent contract
- **hive.json**: Hive lifecycle coordinator contract

### 3. Skills

Located in `skills/`:

- **contract-validation/SKILL.md**: Teaches agents how to use validation tools

## Usage

### Agent Developer Perspective

#### Step 1: Define Agent Contract

Create `contracts/<agent-name>.json`:

```json
{
  "agent": "my-agent",
  "description": "Agent description",
  "method": {
    "name": "Method Name",
    "description": "How this agent works"
  },
  "input_contract": {
    "required": [
      {
        "field_name": "input_field",
        "description": "What this field is",
        "type": "string",
        "validation": ["minLength:10"]
      }
    ],
    "source": [
      {
        "location": ".agents/outputs/previous-agent.md",
        "description": "Where to find this input"
      }
    ]
  },
  "output_contract": {
    "required": [
      {
        "field_name": "output_field",
        "description": "What this field is",
        "type": "string"
      }
    ],
    "destination": [".agents/outputs/my-agent.md"]
  }
}
```

#### Step 2: Add Validation to Agent Prompt

In the agent markdown file, add validation steps:

```markdown
# My Agent

Before starting:
1. Load contract from contracts/my-agent.json
2. Use contract-validation skill to validate input
3. If validation fails, report errors and stop

After completing:
1. Collect output data
2. Validate output contract
3. Update .agents/.state/state.json with results
```

#### Step 3: Execute Validation

Agents use the TypeScript API:

```typescript
import { ContractValidator, StateManager } from '${CLAUDE_PLUGIN_ROOT}/lib/index.js';

// Validate input
const inputResult = ContractValidator.validateInput(contract, context);
if (!inputResult.valid) {
  throw new Error('Input validation failed');
}

// ... do work ...

// Validate output
const outputResult = ContractValidator.validateOutput(contract, context);

// Update state
const stateManager = new StateManager(process.cwd());
await stateManager.recordExecutionAgent('my-agent', outputResult);
```

### @hive Coordinator Perspective

@hive uses contracts to:

1. **Verify agent readiness**: Check all required inputs exist before dispatch
2. **Validate execution results**: Confirm agent outputs meet contract
3. **Track progress**: Via `.agents/.state/state.json` and `.agents/.state/hive-state.json`

Example:

```typescript
// Check if @dev can execute
const devContract = JSON.parse(await Read('contracts/dev.json'));
const inputData = {
  requirements: await Read('.agents/outputs/pm.md'),
  architecture: await Read('.agents/outputs/arch.md'),
  files_to_modify: state.planning.architecture.files_to_modify
};

const canExecute = ContractValidator.validateInput(
  devContract,
  { agent: 'dev', task_id: taskId, phase: 'execution', input_data: inputData }
);

if (canExecute.valid) {
  // Dispatch @dev
} else {
  // Report missing inputs to user
}
```

## Contract Schema Reference

### Full Contract Structure

```typescript
interface AgentContract {
  agent: string;
  description: string;
  method: {
    name: string;
    description: string;
    steps?: string[];
  };
  input_contract: {
    required: ContractField[];
    optional?: ContractField[];
    source: ContractSource[];
  };
  output_contract: {
    required: ContractField[];
    optional?: ContractField[];
    destination: string[];
  };
  validation?: string[];
  complexity_range?: [number, number];
}
```

### ContractField Structure

```typescript
interface ContractField {
  field_name: string;
  description: string;
  type?: string;        // string, number, array, object, any
  validation?: string[];
}
```

### Built-in Validation Rules

- `minLength:N` - String minimum N characters
- `maxLength:N` - String maximum N characters
- `minItems:N` - Array minimum N items
- `pattern:REGEX` - Match regex pattern
- `fileExists` - File must exist at path

## State Management

### state.json Structure

Contract validation results are recorded in `.agents/.state/state.json`:

```json
{
  "task_id": "TASK-123",
  "current_phase": "execution",
  "planning": {
    "agents_executed": ["pm", "arch"],
    "outputs": {
      "arch": {
        "agent": "arch",
        "output_file": ".agents/outputs/arch.md",
        "contract_validated": true,
        "validation_results": {
          "api_contracts": "✓ valid",
          "files_to_create": "✓ valid",
          "__status__": "✓ all valid"
        },
        "timestamp": "2026-01-14T12:00:00Z"
      }
    }
  }
}
```

## FAQ

### Q: How much overhead does contract validation add?

A: Very little. Validation mainly checks field existence and simple rules, typically <100 tokens. Compared to retrying after discovering errors, the cost is negligible.

### Q: What happens when validation fails?

A: Three options:
1. **Fix and retry**: Fix the issue and re-validate
2. **Ask user**: If user input is needed
3. **Fail gracefully**: Report the problem clearly and stop

### Q: Can contracts be dynamically modified?

A: Not recommended. Contracts are part of agent identity and should be stable. If requirements change, update the contract file and re-validate.

### Q: How are optional fields handled?

A: Optional fields are validated if present, but absence is not an error. Used for enhancements that are not strictly required.

## References

- **contracts/pm.json**: PM agent contract
- **contracts/arch.json**: Architecture agent contract
- **contracts/dev.json**: Dev agent contract
- **contracts/hive.json**: Hive lifecycle coordinator contract
- **skills/contract-validation/SKILL.md**: Detailed usage guide
