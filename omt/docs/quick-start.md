# OMT Quick Start Guide

OMT (One Man Team) 使用 **Contract-First Agent Workflow** 來自動化軟體開發流程。本指南將帶你快速上手。

## 安裝

1. **將 OMT plugin 加入你的 marketplace**:

```bash
cd ~/.claude/plugins
git clone <your-omt-repo> omt
```

2. **安裝依賴並編譯 TypeScript**:

```bash
cd omt
npm install
npm run build
```

3. **驗證安裝**:

```bash
# 在 Claude Code 中
/help

# 應該看到 OMT agents 列表
```

## 核心概念

### Contract-First Design

每個 agent 都有明確的 **input/output contract**：

```yaml
agent: tdd
input_contract:
  required:
    - requirements: 需求文件
    - architecture: 架構設計
output_contract:
  required:
    - test_files: 測試檔案
    - tests_status: "X/Y passed"
```

**好處**:
- ✓ 執行前驗證輸入，避免浪費 context
- ✓ 執行後驗證輸出，確保完整性
- ✓ 明確的依賴關係

### Agent 分類

**Planning Agents** (規劃階段):
- `@arch` - 技術架構設計 (API-First)

**Execution Agents** (執行階段):
- `@tdd` - TDD 實作 (Test-Driven Development)

**Coordinators** (協調器):
- `@hive` - 執行階段協調器

## 基本使用流程

### 方式 1: 使用 Coordinator (推薦)

讓 coordinator 引導你完成流程：

```bash
# 1. 描述任務
User: "實作 JWT 認證 API"

# 2. 調用 coordinator
User: "@hive"

# 3. Coordinator 會呈現選項
@hive:
  🔧 Execution Phase Options:

  讀取專案偏好...
    ✓ Development style: TDD (from CLAUDE.md)

  可用的執行 agents:

    A) [@tdd] TDD Implementation ⭐ 推薦
       - Red → Green → Refactor 循環
       - 測試覆蓋率 ≥80%
       - 適合：關鍵功能、複雜邏輯

    B) [@impl] 快速原型
       - 先實作，後補測試
       - 適合：探索不確定的需求

  你的選擇？

# 4. 選擇執行方式
User: "A"

# 5. Agent 開始執行
@hive: → 調用 @tdd

  ✓ 輸入驗證通過
  ⏳ @tdd 工作中...

# 6. 完成後呈現下一步
@hive:
  ✅ @tdd 完成

  測試: 15/15 passed
  覆蓋率: 95%

  下一步選項:
    A) [@doc] 添加 API 文件
    B) /review - 進入審核階段 ⭐ 推薦
    C) 繼續執行

  你的選擇？
```

### 方式 2: 直接調用 Agent

如果你明確知道要用哪個 agent：

```bash
# 直接調用 @arch 設計架構
User: "@arch 設計 JWT 認證系統"

@arch:
  ✓ 輸入驗證通過
  📐 開始架構設計...

  [生成 API contracts, 架構圖, 技術決策]

  ✅ 架構完成
  輸出: outputs/arch.md

# 然後調用 @tdd 實作
User: "@tdd"

@tdd:
  ✓ 讀取 outputs/arch.md
  ✓ 輸入驗證通過
  🔴 開始 TDD 循環...

  [Red → Green → Refactor]

  ✅ 實作完成
  測試: 15/15 passed
```

## 完整範例工作流程

### 範例：實作使用者認證系統

#### Step 1: 架構設計

```bash
User: "@arch 實作 JWT-based 使用者認證系統，包含 login, logout, token refresh"

@arch:
  # 讀取專案結構
  ✓ 掃描專案檔案: 87 個檔案
  ✓ 讀取 CLAUDE.md: TypeScript, Express, PostgreSQL

  # 設計 API Contracts
  📋 定義 interfaces:
    - AuthService
    - LoginCredentials
    - AuthToken

  # 創建架構圖
  📊 Mermaid 架構圖已生成

  # 技術決策
  ✓ JWT 策略: RS256 (asymmetric)
  ✓ Token 儲存: Redis
  ✓ 資料庫: PostgreSQL + Prisma

  # 檔案規劃
  📁 需要建立: 5 個檔案
  📁 需要修改: 7 個檔案
  📁 總計: 12 個檔案 ✓ 在限制內 (≤15)

  ✅ 架構完成
  輸出: outputs/arch.md
  狀態: state.json 已更新
```

#### Step 2: TDD 實作

```bash
User: "@tdd"

@tdd:
  # 驗證輸入
  ✓ requirements: 從任務描述讀取
  ✓ architecture: outputs/arch.md
  ✓ files_to_modify: 12 個檔案

  # TDD 循環開始
  🔴 RED Phase
    ✓ 撰寫測試: tests/auth.service.test.ts
    ✓ 執行測試: 0/2 passed (預期失敗)

  🟢 GREEN Phase
    ✓ 實作: src/services/auth.service.ts
    ✓ 執行測試: 2/2 passed

  🔵 REFACTOR Phase
    ✓ 重構: 提取 token generation 邏輯
    ✓ 執行測試: 2/2 passed (仍然通過)

  [重複 6 個迭代...]

  # 最終驗證
  ✓ 所有測試: 15/15 passed
  ✓ 覆蓋率: 95% (目標: 80%)
  ✓ Linting: 無錯誤
  ✓ Type check: 無錯誤

  # 輸出驗證
  ✓ test_files: 15 個檔案
  ✓ implementation_files: 12 個檔案
  ✓ tests_status: "15/15 passed"
  ✓ complexity_actual: 13 (符合估計)

  ✅ TDD 完成
  輸出: outputs/tdd.md
```

#### Step 3: 進入審核階段

```bash
User: "/review"

@coord-review:
  分析變更...
    - 12 個檔案修改 (認證相關)
    - 新增 middleware
    - JWT token 處理

  建議的審核:

    A) [@sec] 安全性審核 ⭐ 關鍵
       - OWASP Top 10 掃描
       - JWT 安全性最佳實踐

    B) [@quality] 程式碼品質審核
       - 最佳實踐檢查

    C) 全面審核 (Security + Quality)

  你的選擇？

User: "C"

# [審核流程...]

✅ 所有審核通過
準備核准: /approve
```

## State Management

所有 agents 的執行狀態都記錄在 `.agents/state.json`:

```json
{
  "task_id": "TASK-123",
  "title": "實作 JWT 認證",
  "current_phase": "execution",

  "planning": {
    "agents_executed": ["arch"],
    "outputs": {
      "arch": {
        "agent": "arch",
        "output_file": "outputs/arch.md",
        "contract_validated": true,
        "validation_results": {
          "api_contracts": "✓ valid",
          "architecture_diagram": "✓ valid",
          "__status__": "✓ all valid"
        }
      }
    }
  },

  "execution": {
    "agents_completed": ["tdd"],
    "current_agent": null
  },

  "context": {
    "complexity_estimate": 13,
    "files_involved": 12
  }
}
```

## jj Integration

每個 agent 完成後，`state-sync` hook 會自動：

1. **創建 jj bookmark**:
```bash
agent-tdd-2025-01-14T15:30:00Z
```

2. **添加 metadata 到 commit description**:
```
Agent Output: @tdd

TDD Implementation: JWT Auth
Tests: 15/15 passed
Coverage: 95%
Complexity: 13
```

查看 agent 歷史：
```bash
jj log | grep "Agent Output"
```

## Contract Validation

### 為什麼需要 Contract Validation？

**問題**: Agent 執行到一半才發現缺少輸入
```
❌ 舊方式:
  @tdd 開始 → 找不到 architecture → 失敗 → 浪費 2000 tokens

✅ Contract-First:
  驗證 Input → 發現缺少 architecture → 立即失敗 → 浪費 50 tokens
```

### 如何使用

Agent 會自動使用 contract validation skill:

```typescript
// 1. 驗證輸入 (agent 執行前)
import { ContractValidator } from '${CLAUDE_PLUGIN_ROOT}/lib/contract-validator.js';

const inputValidation = ContractValidator.validateInput(contract, context);

if (!inputValidation.valid) {
  // 立即失敗，報告缺少的輸入
  console.error(ContractValidator.formatValidationResult(inputValidation, 'input'));
  throw new Error('Missing required inputs');
}

// 2. 執行 agent 邏輯
// ...

// 3. 驗證輸出 (agent 執行後)
const outputValidation = ContractValidator.validateOutput(contract, context);

if (!outputValidation.valid) {
  // 報告缺少的輸出
  console.error(ContractValidator.formatValidationResult(outputValidation, 'output'));
}
```

## 常見問題

### Q: 如何知道該用哪個 agent？

**A**: 使用 coordinator！`@hive` 會根據你的專案設定 (CLAUDE.md) 和任務類型推薦合適的 agent。

### Q: 可以跳過 planning 直接執行嗎？

**A**: 可以，但不建議。如果沒有 architecture，@tdd 的輸入驗證會失敗並提示你先完成 planning。

### Q: Contract validation 會增加多少 overhead？

**A**: 非常少 (~50-100 tokens)。相比發現錯誤後重試節省的 context，這個成本微不足道。

### Q: 如果 validation 失敗怎麼辦？

**A**: Agent 會清楚報告哪些輸入/輸出缺失，你可以：
1. 補齊缺失的輸入
2. 運行前置 agent (例如先運行 @arch)
3. 調整 contract (如果需求改變)

### Q: 可以自訂 agent contracts 嗎？

**A**: 可以！編輯 `contracts/<agent-name>.json` 來修改 input/output 定義。

## 最佳實踐

### 1. 設定 CLAUDE.md

在專案根目錄建立 `CLAUDE.md` 來定義偏好：

```markdown
# Project Configuration

## Development Style
- Prefer: TDD (Test-Driven Development)
- Test Framework: vitest
- Coverage Target: 80%

## Tech Stack
- Language: TypeScript
- Framework: Express.js
- Database: PostgreSQL + Prisma
- Authentication: JWT

## File Structure
- Source: src/
- Tests: tests/
- Docs: docs/
```

### 2. 循序漸進

```
Planning → Execution → Review → Approve

1. @arch (設計架構)
2. @tdd (TDD 實作)
3. /review (審核)
4. /approve (核准並 commit)
```

### 3. 利用 Coordinators

讓 coordinators 引導你，它們會：
- 呈現可用選項
- 根據專案偏好推薦
- 驗證 agent 可執行性
- 追蹤常見模式 (未來可自動化)

### 4. 檢查 State

遇到問題時，檢查 state.json：

```bash
cat .agents/state.json | jq .
```

確認：
- 哪些 agents 已執行
- 是否有 validation errors
- 目前在哪個 phase

### 5. 使用 jj 歷史

查看 agent 執行歷史：

```bash
# 列出所有 agent bookmarks
jj bookmark list | grep agent-

# 查看特定 agent 的 output
jj log -r agent-tdd-2025-01-14T15:30:00Z
```

## 下一步

- 閱讀 [Contract Validation Guide](./contract-validation.md) 了解詳細驗證機制
- 查看 [contracts/](../contracts/) 了解各 agent 的 contract 定義
- 閱讀個別 agent 文件:
  - [agents/arch.md](../agents/arch.md) - 架構設計
  - [agents/tdd.md](../agents/tdd.md) - TDD 實作
  - [agents/hive.md](../agents/hive.md) - 生命週期協調器

## 故障排除

### Agent 無法啟動

```bash
# 檢查 plugin 是否正確安裝
ls ~/.claude/plugins/omt

# 檢查 TypeScript 是否已編譯
ls ~/.claude/plugins/omt/dist

# 重新編譯
cd ~/.claude/plugins/omt
npm run build
```

### Input Validation 失敗

```bash
# 檢查 state.json 內容
cat .agents/state.json | jq .planning

# 確認所需檔案存在
ls outputs/
ls outputs/arch.md
ls outputs/pm.md
```

### Agent 執行後沒有更新 state.json

檢查 hook 是否正常運作：

```bash
# 確認 hook 可執行
ls -la ~/.claude/plugins/omt/hooks/state-sync.sh

# 如果沒有執行權限
chmod +x ~/.claude/plugins/omt/hooks/state-sync.sh
```

## 支援

- GitHub Issues: <your-repo>/issues
- 文件: `docs/` 目錄
- 範例 Contracts: `contracts/` 目錄
