## Observation-Driven Evolution

OMT 使用 **observation-driven evolution** 策略來逐步演進自動化程度。

## 核心理念

### 三階段演進

```
Phase 1: 手動決策 + 觀察收集 (初期)
  └─> 收集資料，了解使用模式

Phase 2: 半自動化 + 確認 (中期)
  └─> 自動推薦常見模式，使用者確認

Phase 3: 高度自動化 + 斷點 (後期)
  └─> 自動執行常見流程，關鍵點仍需確認
```

**關鍵原則**: 不預先假設，用資料說話。

## 觀察機制

### 資料收集

每次 coordinator 呈現選項並等待使用者決策時，自動記錄：

```typescript
{
  "timestamp": "2025-01-14T15:30:00Z",
  "task_id": "TASK-123",
  "phase": "execution",
  "coordinator": "coord-exec",
  "task_type": "feature",
  "task_complexity": 13,

  "decision_point": "execution_agent_selection",
  "options_presented": ["@tdd", "@impl", "@bugfix"],
  "option_chosen": "@tdd",
  "was_recommended": true,

  "project_preferences": {
    "development_style": "TDD",
    "test_framework": "vitest"
  },

  "planning_agents_used": ["arch"],
  "execution_agent_chosen": "tdd"
}
```

### 資料儲存

- **位置**: `.agents/observations.jsonl`
- **格式**: JSON Lines (每行一個 JSON 物件)
- **隱私**: 只記錄決策模式，不記錄程式碼內容

### 觀察點

coordinators 在以下決策點記錄觀察：

#### @coord-exec
1. **執行 agent 選擇**: 使用者選擇 @tdd, @impl, 還是 @bugfix？
2. **執行後動作**: 完成後選擇添加 @doc, /review, 還是繼續執行？

#### @coord-plan (未來)
1. **規劃 agent 選擇**: 使用者選擇 @pm, @arch, 還是 @design？
2. **規劃後動作**: 完成後進入執行階段還是繼續規劃？

#### @coord-review (未來)
1. **審核類型選擇**: 使用者選擇 @quality, @sec, 還是全面審核？
2. **審核後動作**: 核准、修復問題、還是重新規劃？

## 分析工具

### 查看統計數據

```bash
/analyze-observations stats
```

輸出：
- 執行 agent 使用頻率
- 按任務類型分類的 agent 選擇
- 推薦遵循率
- 常見 agent 組合序列
- 執行後添加模式
- 階段轉換率

### 生成自動化建議

```bash
/analyze-observations suggestions
```

根據觀察模式，自動生成 Phase 2/3 的自動化建議：

**Phase 2 建議範例** (信心度 ≥ 70%):
```
feature tasks → @tdd (88% 使用率)
→ 實作: 當 task_type === 'feature' 時，自動推薦 @tdd

@tdd → @doc (83% 添加率)
→ 實作: @tdd 完成後，自動推薦 @doc
```

**Phase 3 建議範例** (頻率 ≥ 5 次):
```
arch → tdd → doc (12 次執行，平均複雜度 12.5)
→ 實作: 創建 workflow agent 自動執行此序列
```

### 匯出報告

```bash
/analyze-observations export
```

生成完整報告到 `.agents/observation-report.md`，包含：
- 統計數據
- 自動化建議
- 原始資料位置

## Phase 2 實作指南

當觀察資料顯示高信心模式（≥70%）時，可以實作 Phase 2 自動化。

### 範例：自動推薦 @tdd

**觀察發現**:
```
feature tasks 使用 @tdd: 88% (14/16 次)
信心度: 88%
```

**實作** (在 `agents/coord-exec.md`):

```typescript
// Phase 2 enhancement
let recommendedAgent = null;

// Auto-recommend based on observations
if (state.task.type === 'feature' && preferences.developmentStyle === 'TDD') {
  // Observed pattern: 88% of feature tasks use @tdd
  recommendedAgent = 'tdd';
}

// Present options with auto-recommendation
const options = [];

options.push({
  label: recommendedAgent === 'tdd'
    ? '[@tdd] TDD Implementation ⭐ Recommended (based on usage patterns)'
    : '[@tdd] TDD Implementation',
  description: `...`
});

// ... other options
```

### 範例：自動建議後續 agent

**觀察發現**:
```
@tdd 完成後添加 @doc: 83% (10/12 次)
信心度: 83%
```

**實作**:

```typescript
// After @tdd completes
if (selectedAgent === 'tdd') {
  // Observed pattern: 83% add @doc after @tdd
  nextOptions.unshift({
    label: '[@doc] Add API Documentation ⭐ Recommended (commonly added after TDD)',
    description: 'Generate API reference from code and types'
  });
}
```

## Phase 3 實作指南

當觀察資料顯示穩定的 workflow 模式時（頻率 ≥ 5 次），可以考慮 Phase 3 全自動化。

### 範例：創建 workflow agent

**觀察發現**:
```
arch → tdd → doc: 12 次執行
平均複雜度: 12.5
信心度: 52%
```

**實作** (創建新 agent `agents/workflow-feature.md`):

```markdown
---
name: workflow-feature
description: End-to-end feature implementation workflow (arch → tdd → doc)
---

# Feature Workflow Agent

Automatically executes the common feature development workflow:
1. Architecture design (@arch)
2. TDD implementation (@tdd)
3. API documentation (@doc)

## Breakpoints

User confirmation required at:
- After architecture design (review architecture)
- Before final approval (review all outputs)

## Usage

\`\`\`bash
@workflow-feature "Implement JWT authentication"
\`\`\`

This agent will:
1. Invoke @arch → wait for approval
2. Invoke @tdd → automatic
3. Invoke @doc → automatic
4. Present summary → wait for final approval
```

## 演進決策矩陣

| 模式 | 信心度 | 頻率 | 階段 | 動作 |
|------|--------|------|------|------|
| feature → @tdd | ≥70% | ≥10 | Phase 2 | Auto-recommend |
| @tdd → @doc | ≥70% | ≥10 | Phase 2 | Auto-suggest |
| arch → tdd → doc | ≥50% | ≥5 | Phase 3 | Create workflow |
| 推薦遵循率 | ≥80% | - | Phase 2 | Increase automation |

## 觀察資料查詢

### 基本查詢

```bash
# 查看所有觀察記錄
cat .agents/observations.jsonl | jq .

# 計算總記錄數
cat .agents/observations.jsonl | wc -l

# 查看最新 5 筆
tail -5 .agents/observations.jsonl | jq .
```

### 過濾查詢

```bash
# 只看執行階段的決策
cat .agents/observations.jsonl | jq 'select(.phase == "execution")'

# 只看 feature 類型任務
cat .agents/observations.jsonl | jq 'select(.task_type == "feature")'

# 只看 agent 選擇決策
cat .agents/observations.jsonl | jq 'select(.decision_point == "execution_agent_selection")'

# 統計各 agent 使用次數
cat .agents/observations.jsonl | \
  jq -r 'select(.execution_agent_chosen) | .execution_agent_chosen' | \
  sort | uniq -c | sort -rn
```

### 進階分析

```bash
# 計算 @tdd 使用率
total=$(cat .agents/observations.jsonl | jq 'select(.execution_agent_chosen)' | wc -l)
tdd=$(cat .agents/observations.jsonl | jq 'select(.execution_agent_chosen == "tdd")' | wc -l)
echo "TDD usage: $tdd / $total = $(echo "scale=2; $tdd * 100 / $total" | bc)%"

# 計算推薦遵循率
total_with_rec=$(cat .agents/observations.jsonl | jq 'select(.was_recommended != null)' | wc -l)
followed=$(cat .agents/observations.jsonl | jq 'select(.was_recommended == true)' | wc -l)
echo "Follow rate: $followed / $total_with_rec = $(echo "scale=2; $followed * 100 / $total_with_rec" | bc)%"

# 找出最常見的 agent 序列
cat .agents/observations.jsonl | \
  jq -r 'select(.planning_agents_used and .execution_agent_chosen) |
    (.planning_agents_used + [.execution_agent_chosen] + (.additional_agents // [])) | join(" → ")' | \
  sort | uniq -c | sort -rn | head -5
```

## 觀察資料生命週期

### 資料清理

觀察資料會隨時間累積，定期清理舊資料：

```bash
# 備份現有資料
cp .agents/observations.jsonl .agents/observations.jsonl.$(date +%Y%m%d).backup

# 保留最近 30 天的資料
thirty_days_ago=$(date -u -d '30 days ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-30d +%Y-%m-%dT%H:%M:%SZ)

cat .agents/observations.jsonl | \
  jq "select(.timestamp >= \"$thirty_days_ago\")" \
  > .agents/observations.jsonl.tmp

mv .agents/observations.jsonl.tmp .agents/observations.jsonl
```

### 資料匯出

匯出資料用於外部分析：

```bash
# 匯出為 CSV (用於 Excel)
cat .agents/observations.jsonl | \
  jq -r '[.timestamp, .task_type, .execution_agent_chosen, .was_recommended] | @csv' \
  > observations.csv

# 匯出為 JSON 陣列 (用於其他工具)
cat .agents/observations.jsonl | jq -s . > observations.json
```

## 隱私與安全

### 記錄的內容

✅ **記錄**:
- Agent 選擇和執行模式
- 任務類型和複雜度
- 專案偏好設定（從 CLAUDE.md）
- 決策點和選項
- 時間戳記和任務 ID

❌ **不記錄**:
- 程式碼內容
- 檔案內容
- 任務標題或描述詳細內容
- 使用者個人資料
- API keys 或敏感設定

### 資料儲存

- **位置**: 本地 `.agents/` 目錄
- **權限**: 只有專案擁有者可讀寫
- **傳輸**: 不上傳到任何伺服器
- **分享**: 完全由使用者控制

## 最佳實踐

### 1. 定期檢查觀察資料

```bash
# 每週檢查一次
/analyze-observations stats

# 每月生成建議
/analyze-observations suggestions
```

### 2. 漸進式演進

不要一次實作所有自動化：
1. 先實作最高信心的模式（≥80%）
2. 觀察自動化後的使用情況
3. 調整並實作下一個模式

### 3. 保留斷點

即使在 Phase 3，仍應保留關鍵決策點：
- 架構設計後的審查
- 最終核准前的確認
- 安全相關的變更

### 4. 記錄決策理由

在實作自動化時，記錄：
- 基於哪些觀察資料
- 信心度是多少
- 何時實作的
- 效果如何

## 故障排除

### 觀察資料遺失

```bash
# 檢查檔案是否存在
ls -la .agents/observations.jsonl

# 檢查最後修改時間
stat .agents/observations.jsonl

# 如果遺失，檢查備份
ls -la .agents/observations.jsonl.*.backup
```

### 資料格式錯誤

```bash
# 驗證每行都是有效的 JSON
cat .agents/observations.jsonl | while read line; do
  echo "$line" | jq . > /dev/null || echo "Invalid JSON: $line"
done

# 自動修復：移除無效行
cat .agents/observations.jsonl | while read line; do
  echo "$line" | jq . > /dev/null && echo "$line"
done > .agents/observations.jsonl.fixed

mv .agents/observations.jsonl.fixed .agents/observations.jsonl
```

### 統計結果不準確

```bash
# 檢查資料量是否足夠
total=$(cat .agents/observations.jsonl | wc -l)
echo "Total observations: $total"

# 建議至少 10-20 筆資料才能得出有意義的統計
if [ $total -lt 10 ]; then
  echo "⚠️  Not enough data. Continue using the workflow to collect more observations."
fi
```

## 參考資料

- ObservationLogger API: `${CLAUDE_PLUGIN_ROOT}/lib/observation-logger.ts`
- Analysis Command: `${CLAUDE_PLUGIN_ROOT}/commands/analyze-observations.md`
- Coordinator Integration: `${CLAUDE_PLUGIN_ROOT}/agents/coord-exec.md`
- Evolution Plan: See plan file for complete Phase 1/2/3 strategy
