# Contract Validation System

OMT 使用 **Contract-First** 設計原則來確保 agents 正確執行。每個 agent 都必須定義明確的 input/output contract，並在執行前後進行驗證。

## 核心概念

### 為什麼需要 Contract Validation？

1. **確保正確性**: 在 agent 執行前驗證所有必要的輸入都存在
2. **早期錯誤檢測**: 在 agent 開始工作前就發現問題
3. **明確的預期**: 每個 agent 都清楚知道需要產生什麼輸出
4. **可追蹤性**: 所有驗證結果記錄在 state.json 和 jj 中

### Contract-First vs. Ad-hoc

```
❌ Ad-hoc (舊方式):
  Agent 開始執行 → 發現缺少輸入 → 失敗 → 浪費 context

✅ Contract-First (新方式):
  定義 Contract → 驗證 Input → 執行 Agent → 驗證 Output → 成功
```

## 架構組成

### 1. TypeScript Libraries

位於 `lib/` 目錄：

- **types.ts**: Contract 型別定義
- **contract-validator.ts**: 驗證邏輯實作
- **state-manager.ts**: state.json 管理
- **index.ts**: 主要 export

### 2. Agent Contracts

位於 `contracts/` 目錄，每個 agent 一個 JSON 檔案：

- **tdd.json**: TDD agent contract
- **arch.json**: Architecture agent contract
- **pm.json**: Product Management agent contract

### 3. Skills

位於 `skills/` 目錄：

- **contract-validation.md**: 教導 agents 如何使用驗證工具

### 4. Hooks

位於 `hooks/` 目錄：

- **state-sync.sh**: 自動同步 agent 輸出到 state.json 和 jj

## 使用方式

### Agent 開發者視角

#### Step 1: 定義 Agent Contract

創建 `contracts/<agent-name>.json`:

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
        "location": "outputs/previous-agent.md",
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
    "destination": ["outputs/my-agent.md"]
  }
}
```

#### Step 2: 在 Agent Prompt 中使用

在 agent markdown 文件中添加驗證步驟：

```markdown
# My Agent

Before starting:
1. Load contract from contracts/my-agent.json
2. Use contract-validation skill to validate input
3. If validation fails, report errors and stop

After completing:
1. Collect output data
2. Validate output contract
3. Update state.json with results
```

#### Step 3: 執行驗證

Agents 可以使用 TypeScript API：

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

### Coordinator 視角

Coordinator agents 使用 contracts 來：

1. **選擇適當的 agent**: 根據 input 是否滿足 contract
2. **驗證 agent 可執行性**: 檢查所有 required inputs 是否存在
3. **追蹤進度**: 透過 state.json 了解哪些 agents 已完成

Example:

```typescript
// Check if @tdd can execute
const tddContract = JSON.parse(await Read('contracts/tdd.json'));
const inputData = {
  requirements: await Read('outputs/pm.md'),
  architecture: await Read('outputs/arch.md'),
  files_to_modify: state.planning.architecture.files_to_modify
};

const canExecute = ContractValidator.validateInput(
  tddContract,
  { agent: 'tdd', task_id: taskId, phase: 'execution', input_data: inputData }
);

if (canExecute.valid) {
  // Invoke @tdd
} else {
  // Report missing inputs to user
}
```

## Contract Schema 參考

### 完整的 Contract 結構

```typescript
interface AgentContract {
  agent: string;                    // Agent 名稱
  description: string;              // 簡短描述
  method: {
    name: string;                   // 方法名稱 (e.g., "TDD")
    description: string;            // 方法描述
    steps?: string[];               // 執行步驟
  };
  input_contract: {
    required: ContractField[];      // 必要輸入
    optional?: ContractField[];     // 可選輸入
    source: ContractSource[];       // 輸入來源
  };
  output_contract: {
    required: ContractField[];      // 必要輸出
    optional?: ContractField[];     // 可選輸出
    destination: string[];          // 輸出目的地
  };
  validation?: string[];            // 額外驗證規則
  complexity_range?: [number, number]; // 複雜度範圍
}
```

### ContractField 結構

```typescript
interface ContractField {
  field_name: string;     // 欄位名稱
  description: string;    // 欄位描述
  type?: string;         // 型別: string, number, array, object, any
  validation?: string[]; // 驗證規則
}
```

### 內建驗證規則

- `minLength:N` - 字串最少 N 個字元
- `maxLength:N` - 字串最多 N 個字元
- `minItems:N` - 陣列最少 N 個元素
- `pattern:REGEX` - 符合正則表達式
- `fileExists` - 檔案必須存在

## State Management

### state.json 結構

Contract validation 結果會記錄在 state.json:

```json
{
  "task_id": "TASK-123",
  "current_phase": "execution",
  "planning": {
    "agents_executed": ["pm", "arch"],
    "outputs": {
      "arch": {
        "agent": "arch",
        "output_file": "outputs/arch.md",
        "contract_validated": true,
        "validation_results": {
          "api_contracts": "✓ valid",
          "files_to_create": "✓ valid",
          "__status__": "✓ all valid"
        },
        "timestamp": "2025-01-14T12:00:00Z"
      }
    }
  }
}
```

### jj Integration

Hook 會自動創建 jj bookmarks 和 metadata:

```bash
# Automatic bookmark
agent-tdd-2025-01-14T12:00:00Z

# Commit description includes
Agent Output: @tdd
Timestamp: 2025-01-14T12:00:00Z
Output: outputs/tdd.md
```

## 開發工作流程

### 1. 編譯 TypeScript

```bash
cd omt
npm install
npm run build
```

這會將 `lib/*.ts` 編譯成 `dist/*.js`。

### 2. 測試 Contract

創建測試文件來驗證 contract:

```typescript
import { ContractValidator } from './lib/index.js';

const contract = JSON.parse(await fs.readFile('contracts/tdd.json', 'utf-8'));
const testInput = {
  requirements: "Test requirements",
  architecture: "Test architecture",
  files_to_modify: ["src/test.ts"]
};

const result = ContractValidator.validateInput(contract, {
  agent: 'tdd',
  task_id: 'TEST',
  phase: 'execution',
  input_data: testInput
});

console.log(ContractValidator.formatValidationResult(result, 'input'));
```

### 3. 更新 Contracts

當 agent 需求改變時：

1. 更新 `contracts/<agent>.json`
2. 重新執行驗證測試
3. 更新 agent markdown 文件

## 最佳實踐

### 1. Contract 設計

- **明確性**: 每個欄位都要有清楚的描述
- **可驗證性**: 使用 validation rules 確保資料正確
- **最小化**: 只要求真正需要的輸入
- **文件化**: 在 source 中說明資料來源

### 2. Agent 實作

- **Early validation**: 在開始工作前就驗證 input
- **Complete validation**: 不要跳過 output validation
- **Clear errors**: 使用 formatValidationResult 提供清楚的錯誤訊息
- **State updates**: 永遠記錄驗證結果到 state.json

### 3. 錯誤處理

```typescript
try {
  const result = ContractValidator.validateInput(contract, context);

  if (!result.valid) {
    // Report to user with clear errors
    const report = ContractValidator.formatValidationResult(result, 'input');
    console.error(report);

    // Decide: can we fix it? or escalate?
    if (result.errors.some(e => e.field === 'requirements')) {
      // Critical error - stop
      throw new Error('Missing requirements');
    }
  }
} catch (error) {
  // Log and escalate
  console.error('Validation error:', error);
  throw error;
}
```

## 常見問題

### Q: Contract validation 會增加多少 overhead?

A: 很少。Validation 主要是檢查欄位存在性和簡單規則，通常 <100 tokens。相比發現錯誤後重試，這個成本微不足道。

### Q: 如果 validation 失敗怎麼辦？

A: 有三個選項：
1. **Fix and retry**: 修復問題後重新驗證
2. **Ask user**: 如果需要使用者提供輸入
3. **Fail gracefully**: 清楚報告問題並停止

### Q: 可以動態修改 contract 嗎？

A: 不建議。Contracts 是 agent 身份的一部分，應該是穩定的。如果需求改變，應該創建新的 agent。

### Q: 如何處理 optional fields?

A: Optional fields 如果存在會被驗證，但不存在不算錯誤。用於增強功能但非必要的輸入。

## 範例

完整的範例請參考：

- **contracts/tdd.json**: TDD agent contract
- **contracts/arch.json**: Architecture agent contract
- **contracts/pm.json**: PM agent contract
- **skills/contract-validation.md**: 詳細使用指南

## 下一步

1. 閱讀 [skills/contract-validation.md](../skills/contract-validation.md) 了解詳細用法
2. 查看範例 contracts 了解如何定義
3. 在新 agent 中整合 contract validation
4. 使用 state-sync hook 自動追蹤進度
