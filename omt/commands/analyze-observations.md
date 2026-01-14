---
name: analyze-observations
description: Analyze observation data to identify automation opportunities and usage patterns
---

# Analyze Observations Command

分析從 coordinators 收集的觀察數據，識別常見模式並提供自動化建議。

## Usage

```bash
/analyze-observations [options]
```

## Options

- **stats** - 顯示觀察統計數據
- **suggestions** - 生成自動化建議
- **export** - 匯出詳細報告
- (無參數) - 顯示所有資訊

## 功能

### 1. 觀察統計 (stats)

顯示從觀察數據中提取的統計資訊：

```typescript
import { ObservationLogger } from '${CLAUDE_PLUGIN_ROOT}/lib/observation-logger.js';

const logger = new ObservationLogger(process.cwd());

try {
  const stats = await logger.generateStats();
  const formatted = ObservationLogger.formatStats(stats);

  console.log(formatted);
} catch (error) {
  if (error.message.includes('No observations found')) {
    console.log(`
      ℹ️  No observation data found yet.

      Observations are automatically collected when you use coordinators:
      - @coord-exec
      - @coord-plan
      - @coord-review

      Start using the workflow to collect data:
      1. Use @coord-exec to execute tasks
      2. Make selections when presented with options
      3. Return here to see patterns emerge
    `);
  } else {
    throw error;
  }
}
```

**輸出範例**:

```markdown
# Observation Statistics

Total Observations: 23
Date Range: 2025-01-14T10:00:00Z to 2025-01-15T16:30:00Z

## Execution Agent Frequency

- @tdd: 16 times (70%)
- @impl: 5 times (22%)
- @bugfix: 2 times (9%)

## Execution Agent by Task Type

### feature
- @tdd: 14 times (88%)
- @impl: 2 times (12%)

### bug
- @bugfix: 2 times (100%)

## Recommendation Follow Rate

Overall: 83%

By Coordinator:
- @coord-exec: 83%

## Common Agent Sequences

- arch → tdd → doc: 12 times (avg complexity: 12.5)
- arch → impl → test-unit: 3 times (avg complexity: 8.3)
- pm → arch → tdd: 8 times (avg complexity: 15.2)

## Post-Execution Additions

### After @tdd:
- @doc: 10 times

### After @impl:
- @test-unit: 4 times
- @doc: 3 times

## Phase Transition Rate

- Planning → Execution: 95%
- Execution → Review: 78%
- Execution Continue: 22%
```

### 2. 自動化建議 (suggestions)

根據觀察模式生成自動化建議：

```typescript
const logger = new ObservationLogger(process.cwd());

try {
  const suggestions = await logger.generateSuggestions();
  const formatted = ObservationLogger.formatSuggestions(suggestions);

  console.log(formatted);

  // Show actionable next steps
  if (suggestions.length > 0) {
    console.log(`\n## Next Steps\n`);
    console.log(`Ready to implement Phase 2 automation for high-confidence patterns.`);
    console.log(`\nSee docs/observation-analysis.md for implementation guide.`);
  }
} catch (error) {
  console.error('Error generating suggestions:', error.message);
}
```

**輸出範例**:

```markdown
# Automation Suggestions

## Phase 2: Semi-Automated (Auto-suggest with confirmation)

### feature tasks → @tdd
- **Description**: 88% of feature tasks use @tdd
- **Frequency**: 14 occurrences
- **Confidence**: 88%
- **Implementation**: In @coord-exec: if task_type === 'feature', auto-recommend @tdd

### @tdd → @doc
- **Description**: 83% of @tdd completions add @doc
- **Frequency**: 10 occurrences
- **Confidence**: 83%
- **Implementation**: After @tdd completes, auto-suggest @doc

### User follows recommendations
- **Description**: 83% follow rate suggests recommendations are accurate
- **Frequency**: 19 occurrences
- **Confidence**: 83%
- **Implementation**: Increase automation: auto-select recommended options with confirmation

## Phase 3: Highly Automated (Auto-execute with breakpoints)

### arch → tdd → doc
- **Description**: Common workflow executed 12 times (avg complexity: 12.5)
- **Frequency**: 12 occurrences
- **Confidence**: 52%
- **Implementation**: Create workflow agent that auto-executes: arch → tdd → doc
```

### 3. 匯出報告 (export)

匯出完整的分析報告到檔案：

```typescript
const logger = new ObservationLogger(process.cwd());
const outputPath = '.agents/observation-report.md';

try {
  const stats = await logger.generateStats();
  const suggestions = await logger.generateSuggestions();

  const report = `
# OMT Observation Analysis Report

Generated: ${new Date().toISOString()}

${ObservationLogger.formatStats(stats)}

---

${ObservationLogger.formatSuggestions(suggestions)}

---

## Raw Data

Observations file: \`.agents/observations.jsonl\`
Total records: ${stats.total_observations}

To view raw data:
\`\`\`bash
cat .agents/observations.jsonl | jq .
\`\`\`
  `.trim();

  await fs.promises.writeFile(outputPath, report, 'utf-8');

  console.log(`✅ Report exported to: ${outputPath}`);
  console.log(`\nView the report:`);
  console.log(`  cat ${outputPath}`);
} catch (error) {
  console.error('Error exporting report:', error.message);
}
```

## 使用場景

### Scenario 1: 檢查是否準備好 Phase 2

```bash
# 在使用一段時間後
/analyze-observations suggestions

# 查看是否有高信心的自動化建議
# 如果 confidence >= 70%，考慮實作 Phase 2 自動化
```

### Scenario 2: 了解團隊使用模式

```bash
# 查看團隊最常用的 agents 和流程
/analyze-observations stats

# 了解:
# - 哪些 agents 最受歡迎？
# - 常見的 agent 組合是什麼？
# - 是否遵循建議？
```

### Scenario 3: 生成進化策略報告

```bash
# 匯出完整報告用於規劃下一階段
/analyze-observations export

# 然後檢視報告
cat .agents/observation-report.md
```

## 觀察數據收集

觀察數據會在以下時機自動收集：

### @coord-exec
```typescript
// 當使用者選擇執行 agent 時
await logger.record({
  phase: 'execution',
  coordinator: 'coord-exec',
  task_id: state.task_id,
  task_type: 'feature',
  decision_point: 'execution_agent_selection',
  options_presented: ['@tdd', '@impl', '@bugfix'],
  option_chosen: '@tdd',
  was_recommended: true,
  project_preferences: {
    development_style: 'TDD'
  },
  execution_agent_chosen: 'tdd'
});

// 當執行完成後決定下一步
await logger.record({
  phase: 'execution',
  coordinator: 'coord-exec',
  task_id: state.task_id,
  decision_point: 'post_execution_action',
  options_presented: ['@doc', '/review', 'continue'],
  option_chosen: '@doc',
  was_recommended: false,
  execution_agent_chosen: 'tdd',
  additional_agents: ['doc']
});
```

### @coord-plan
```typescript
// 當使用者選擇 planning agent
await logger.record({
  phase: 'planning',
  coordinator: 'coord-plan',
  task_id: state.task_id,
  decision_point: 'planning_agent_selection',
  options_presented: ['@pm', '@arch', '@design'],
  option_chosen: '@arch',
  was_recommended: true,
  planning_agents_used: ['arch']
});
```

## 資料格式

觀察資料儲存在 `.agents/observations.jsonl` (JSON Lines 格式):

```json
{"timestamp":"2025-01-14T15:30:00Z","task_id":"TASK-123","phase":"execution","coordinator":"coord-exec","task_type":"feature","decision_point":"execution_agent_selection","options_presented":["@tdd","@impl"],"option_chosen":"@tdd","was_recommended":true,"execution_agent_chosen":"tdd","project_preferences":{"development_style":"TDD"}}
{"timestamp":"2025-01-14T15:45:00Z","task_id":"TASK-123","phase":"execution","coordinator":"coord-exec","decision_point":"post_execution_action","options_presented":["@doc","/review"],"option_chosen":"@doc","was_recommended":false,"additional_agents":["doc"]}
```

## 隱私與安全

觀察資料只記錄：
- Agent 選擇和執行模式
- 任務類型和複雜度
- 專案偏好設定

**不記錄**:
- 任務內容或程式碼
- 敏感資訊
- 使用者個人資料

資料儲存在本地 `.agents/` 目錄，不會上傳。

## 故障排除

### 找不到觀察資料

```bash
# 檢查檔案是否存在
ls -la .agents/observations.jsonl

# 如果不存在，開始收集資料
# 使用 @coord-exec 並做出選擇
```

### 資料損壞

```bash
# 驗證 JSONL 格式
cat .agents/observations.jsonl | jq . > /dev/null

# 如果有錯誤，找出損壞的行
cat .agents/observations.jsonl | while read line; do echo "$line" | jq . > /dev/null || echo "Bad: $line"; done
```

### 重置觀察資料

```bash
# 備份現有資料
cp .agents/observations.jsonl .agents/observations.jsonl.backup

# 刪除並重新開始
rm .agents/observations.jsonl
```

## References

- ObservationLogger: `${CLAUDE_PLUGIN_ROOT}/lib/observation-logger.ts`
- Documentation: `${CLAUDE_PLUGIN_ROOT}/docs/observation-analysis.md`
- Phase Evolution Plan: See plan file for Phase 2/3 roadmap
