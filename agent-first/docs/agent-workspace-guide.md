# Agent 本地工作區指南

## 概述

為實現 Agent-First 工作流程,每個 repo 都需要建立本地 Agent 工作區。這個工作區提供:
- **Agent 間通訊機制**
- **狀態管理與同步**
- **任務交接協議**
- **交付物暫存**
- **日誌與監控**

**重要**: 所有 Agent 工作區資料都是**本地的**,不會進入 git 版控。

## 目錄結構

```
project-root/
├── .claude/                    # Claude 配置 (在 git 中)
│   ├── agents/                # Agent 定義
│   ├── commands/              # Commands 定義
│   └── agent-config.yml       # Agent 行為配置
│
├── .agents/                   # ⭐ Agent 工作區 (不進 git)
│   ├── workspace/            # 各 Agent 工作空間
│   │   ├── planner/         # Planner 專屬區域
│   │   ├── coder/           # Coder 專屬區域
│   │   ├── reviewer/        # Reviewer 專屬區域
│   │   └── ...
│   │
│   ├── communication/        # Agent 間通訊
│   │   ├── messages/        # 訊息佇列
│   │   ├── handoffs/        # 任務交接
│   │   └── broadcasts/      # 廣播通知
│   │
│   ├── state/               # 狀態管理
│   │   ├── active-agents.json
│   │   ├── task-registry.json
│   │   └── checkpoints/
│   │
│   ├── logs/                # 日誌系統
│   ├── deliverables/        # 交付物暫存
│   ├── metrics/             # 指標數據
│   └── cache/               # 快取
│
└── .gitignore              # 已排除 .agents/
```

## 快速開始

### 1. 初始化 Agent 工作區

在新專案中執行:

```bash
# 方式 1: 使用初始化腳本
bash ~/.claude/templates/init-agent-workspace.sh

# 方式 2: 手動建立
mkdir -p .agents/{workspace,communication,state,logs,deliverables,metrics,cache}
```

### 2. 配置 Git 排除規則

```bash
# 自動添加 .gitignore 規則
cat ~/.claude/templates/agents-gitignore.txt >> .gitignore
```

### 3. 初始化各個 Agent

```bash
./.agents/scripts/init-agent.sh planner
./.agents/scripts/init-agent.sh coder
./.agents/scripts/init-agent.sh reviewer
./.agents/scripts/init-agent.sh debugger
./.agents/scripts/init-agent.sh optimizer
./.agents/scripts/init-agent.sh pm
```

## 任務資料格式

### Task JSON (輕量狀態)

**範例: `.agents/tasks/LIN-123.json`**

```json
{
  "task_id": "LIN-123",
  "title": "實作用戶認證 API",
  "status": "in_progress",
  "current_agent": "coder",

  "complexity": {
    "estimated": 8,
    "estimated_tokens": 8000,
    "actual": null,
    "actual_tokens": null
  },

  "agents": {
    "planner": {
      "status": "completed",
      "started_at": "2025-10-02T09:00:00Z",
      "completed_at": "2025-10-02T09:30:00Z",
      "output_file": "planner.md",
      "tokens_used": 1200,
      "handoff_to": "coder"
    },
    "coder": {
      "status": "working",
      "started_at": "2025-10-02T09:35:00Z",
      "output_file": "coder.md",
      "checkpoint": "stash@{0}",
      "retry_count": 0
    }
  },

  "metadata": {
    "created_at": "2025-10-02T09:00:00Z",
    "updated_at": "2025-10-02T10:30:00Z"
  }
}
```

### Agent Markdown (詳細內容)

**範例: `.agents/tasks/LIN-123/planner.md`**

```markdown
# Planner Output - LIN-123

**Estimated Complexity**: 8 (8000 tokens)
**Tokens Used**: 1200

## Requirements
- JWT authentication
- Refresh tokens
- Rate limiting

## Task Breakdown
- [ ] Token service (3 points)
- [ ] Auth middleware (2 points)
- [ ] Rate limiting (2 points)
- [ ] Tests (1 point)

## Handoff to Coder
Files to create: src/auth/token.service.ts, src/auth/auth.middleware.ts
Dependencies: jsonwebtoken, express-rate-limit
```

## Agent 通訊協議

### Handoff Protocol (任務交接)

Agent 完成工作後,透過更新 JSON 中的 `handoff_to` 欄位交接給下一個 Agent:

```javascript
// Planner 完成並交接給 Coder
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'  // 自動設定 current_agent
});

// Coder 查找分配給自己的任務
const myTasks = AgentTask.findMyTasks('coder');
// 返回所有 current_agent === 'coder' 且 status === 'in_progress' 的任務
```

**簡化設計**:
- 無需複雜的訊息佇列或交接檔案
- 透過 JSON 的 `current_agent` 和 `handoff_to` 實現交接
- Agent 定期檢查自己的任務 (`findMyTasks`)

## 狀態管理

### 狀態定義 (Single Source of Truth)

所有狀態定義在 `.agents/states.yml`:

```yaml
# 任務狀態
task_states:
  pending: "等待開始"
  in_progress: "進行中"
  blocked: "被阻擋,需要人工介入"
  completed: "已完成"
  failed: "失敗"
  cancelled: "已取消"

# Agent 狀態
agent_states:
  idle: "閒置"
  working: "工作中"
  completed: "完成"
  blocked: "遇到問題"
  skipped: "被跳過"

# 複雜度 (費氏數列)
complexity_scale:
  values: [1, 2, 3, 5, 8, 13, 21, 34, 55, 89]
  token_estimates:
    1: 1000
    2: 2000
    3: 3000
    5: 5000
    8: 8000
    13: 13000
    21: 21000
    34: 34000
    55: 55000
    89: 89000
```

### 狀態存儲位置

- **任務狀態**: `.agents/tasks/{task-id}.json` 中的 `status` 欄位
- **Agent 狀態**: `.agents/tasks/{task-id}.json` 中的 `agents.{agent-name}.status` 欄位
- **無需額外的狀態檔案**: 所有狀態都在任務 JSON 中

## 資料生命週期

### 自動清理機制 (基於檔案 mtime)

```javascript
const { AgentTask } = require('./.agents/lib');

// 清理 90 天前完成的任務
const cleaned = AgentTask.cleanup(90);
console.log(`Cleaned ${cleaned} old tasks`);
```

**清理規則**:
- ✅ 只清理 `completed` 或 `cancelled` 狀態
- ✅ 基於檔案 `mtime` (修改時間) 判斷年齡
- ✅ 同時刪除 `.json` 檔案和對應的資料夾
- ✅ 無需 archive 資料夾

### 定期維護 (可選)

```bash
# 設定 cron job
# 每天凌晨 2 點清理 90 天前的任務
0 2 * * * cd /path/to/project && node -e "require('./.agents/lib').AgentTask.cleanup(90)"
```

## Agent 工作流程範例

### 範例 1: Planner → Coder Handoff

```javascript
const { AgentTask } = require('./.agents/lib');

// 1. Planner 建立任務
const task = AgentTask.create('LIN-123', 'User Authentication API', 8);

// 2. Planner 寫入 PRD
task.writeAgentOutput('planner', `
# PRD: User Authentication API

## Requirements
- JWT authentication
- Refresh tokens
- Rate limiting

## Implementation Plan
...
`);

// 3. Planner 完成並交接
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'  // 自動設定 current_agent = 'coder'
});

// 4. Coder 查找自己的任務
const myTasks = AgentTask.findMyTasks('coder');
console.log(`Found ${myTasks.length} tasks for coder`);

// 5. Coder 開始工作
task.updateAgent('coder', {
  status: 'working',
  checkpoint: 'stash@{0}'
});
```

### 範例 2: 錯誤升級 (失敗保護)

```javascript
const { AgentTask } = require('./.agents/lib');

// Coder 執行任務
const task = new AgentTask('LIN-123').load();
let retryCount = task.agents.coder?.retry_count || 0;

try {
  // 執行測試
  await runTests();
} catch (error) {
  retryCount++;

  if (retryCount >= 3) {
    // 達到重試上限,升級人工
    task.updateAgent('coder', {
      status: 'blocked',
      retry_count: retryCount,
      checkpoint: 'stash@{0}',
      error_message: error.message
    });

    // 寫入診斷報告
    task.appendAgentOutput('coder', `
## 🚨 需要人工協助

**錯誤**: ${error.message}
**重試次數**: ${retryCount}
**Checkpoint**: stash@{0}

請檢查並修復問題後重新啟動任務。
    `);

    // 任務標記為 blocked
    const taskData = task.load();
    taskData.status = 'blocked';
    task.save(taskData);

  } else {
    // 更新重試次數
    task.updateAgent('coder', { retry_count: retryCount });
  }
}
```

## 監控與除錯

### 查看任務狀態

```bash
# 查看特定任務
cat .agents/tasks/LIN-123.json | jq

# 查看任務列表
ls .agents/tasks/*.json

# 查看進行中的任務
jq -r 'select(.status == "in_progress") | .task_id' .agents/tasks/*.json

# 查看被阻擋的任務
jq -r 'select(.status == "blocked") | .task_id' .agents/tasks/*.json
```

### 查看 Agent 輸出

```bash
# 查看 Planner 輸出
cat .agents/tasks/LIN-123/planner.md

# 查看 Coder 工作記錄
cat .agents/tasks/LIN-123/coder.md

# 查看 Reviewer 檢查結果
cat .agents/tasks/LIN-123/reviewer.md
```

### 查看回顧分析

```bash
# 查看 Retro Agent 分析
ls .agents/retro/
cat .agents/retro/2025-10-sprint-1.md
```

## 最佳實踐

### 1. Agent 啟動時

```javascript
const { AgentTask } = require('./.agents/lib');

// 查找分配給我的任務
const myTasks = AgentTask.findMyTasks('coder');
console.log(`Found ${myTasks.length} tasks`);

// 開始第一個任務
if (myTasks.length > 0) {
  const task = new AgentTask(myTasks[0].task_id);
  task.updateAgent('coder', { status: 'working' });
}
```

### 2. 執行任務時

```javascript
const task = new AgentTask('LIN-123');

// 開始工作
task.updateAgent('coder', {
  status: 'working',
  checkpoint: 'stash@{0}'
});

// 記錄進度
task.appendAgentOutput('coder', `
### Progress Update
- Implemented token service
- Tokens used: 2500
`);

// 完成工作
task.updateAgent('coder', {
  status: 'completed',
  tokens_used: 5000,
  handoff_to: 'reviewer'
});
```

### 3. 任務交接時

```javascript
// 簡化的交接流程
task.updateAgent('planner', {
  status: 'completed',
  tokens_used: 1200,
  handoff_to: 'coder'  // 自動設定 current_agent
});

// 下一個 Agent 自動發現
const myTasks = AgentTask.findMyTasks('coder');
```

### 4. 錯誤處理時

```javascript
let retryCount = task.agents.coder?.retry_count || 0;

try {
  await executeTask();
} catch (error) {
  retryCount++;

  if (retryCount >= 3) {
    // 升級人工
    task.updateAgent('coder', {
      status: 'blocked',
      retry_count: retryCount,
      error_message: error.message
    });

    const taskData = task.load();
    taskData.status = 'blocked';
    task.save(taskData);
  } else {
    task.updateAgent('coder', { retry_count: retryCount });
  }
}
```

## 疑難排解

### 問題 1: 任務找不到

```bash
# 檢查任務是否存在
ls .agents/tasks/LIN-123.json

# 檢查任務內容
cat .agents/tasks/LIN-123.json | jq
```

### 問題 2: Agent 找不到自己的任務

```javascript
// 檢查 current_agent 欄位
const task = new AgentTask('LIN-123').load();
console.log(task.current_agent);  // 應該是 'coder'

// 檢查任務狀態
console.log(task.status);  // 應該是 'in_progress'
```

### 問題 3: 磁碟空間不足

```bash
# 檢查工作區大小
du -sh .agents/

# 手動清理舊任務
node -e "require('./.agents/lib').AgentTask.cleanup(30)"  # 30 天

# 查看清理了多少任務
const cleaned = require('./.agents/lib').AgentTask.cleanup(90);
console.log(`Cleaned ${cleaned} tasks`);
```

## 參考資料

- @~/.claude/workflow.md - 完整工作流程說明
- @~/.claude/workflow.md#agent-first-workflow - Agent 優先設計
- @~/.claude/workflow.md#agent-失敗保護機制 - 失敗保護機制

---

**版本**: 1.0
**最後更新**: 2025-10-02
**狀態**: Active
