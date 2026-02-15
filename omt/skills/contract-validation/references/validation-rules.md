# Validation Rules Reference

## Built-in Validation Rules

| Rule | Applies To | Description | Example |
|------|-----------|-------------|---------|
| `minLength:N` | string | Minimum character count | `"minLength:10"` |
| `maxLength:N` | string | Maximum character count | `"maxLength:500"` |
| `minItems:N` | array | Minimum array items | `"minItems:1"` |
| `pattern:REGEX` | string | Must match regex | `"pattern:^\\d+/\\d+ passed$"` |
| `fileExists` | string | File/directory must exist at path | `"fileExists"` |

## Custom Validation

For validation logic beyond built-in rules, perform checks before calling the validator:

```
Before calling ContractValidator.validateOutput:
1. Read test coverage results
2. Check if coverage >= required threshold
3. If below threshold, report error and stop before validation
```

## Contract File Structure

Each contract JSON in `contracts/` follows this schema:

```json
{
  "agent": "<agent-name>",
  "description": "<agent purpose>",
  "method": {
    "name": "<methodology>",
    "description": "<methodology description>"
  },
  "input_contract": {
    "required": [
      {
        "field_name": "<name>",
        "description": "<what this field is>",
        "type": "string | array | object",
        "validation": ["<rule1>", "<rule2>"]
      }
    ],
    "optional": [...],
    "source": [
      {
        "location": "<file-path>",
        "description": "<where to find this data>"
      }
    ]
  },
  "output_contract": {
    "required": [...],
    "destination": ["<output-path-1>", "<output-path-2>"]
  }
}
```

## Existing Contracts

| Contract File | Agent | Input Sources | Output Destinations |
|--------------|-------|---------------|---------------------|
| `contracts/pm.json` | @pm | User goal | `outputs/pm.md` |
| `contracts/arch.json` | @arch | PM requirements | `outputs/arch.md` |
| `contracts/dev.json` | @dev | PM + Arch outputs | `tests/`, `src/`, `outputs/dev.md` |
