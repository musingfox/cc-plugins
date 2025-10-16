# Approve Command

**Command Type**: Critical Decision Point
**When to Use**: Review and approve important changes before commit

## Purpose

`/approve` 命令用於人工審查重要變更,特別是 API 變更、Schema 變更、重大重構等需要明確批准的修改。

## When to Use

### 必須使用 /approve 的情況:

1. **API 變更**
   - 新增/修改 public API endpoint
   - 變更 API request/response schema
   - API 版本升級

2. **Database Schema 變更**
   - 新增/修改 table schema
   - 資料庫遷移腳本
   - 索引變更

3. **重大重構**
   - 架構模式變更
   - 核心模組重寫
   - 依賴版本主要升級

4. **安全性變更**
   - 認證/授權機制修改
   - 密碼處理邏輯變更
   - 安全性配置調整

5. **效能關鍵變更**
   - 快取策略變更
   - 資料庫查詢優化
   - 負載平衡配置

### 不需要使用 /approve 的情況:

- 小型 bug 修復
- 程式碼註解更新
- 單元測試新增
- 文件更新
- 樣式調整

## Usage

```bash
# 基本使用
/approve

# 系統會顯示待審查的變更
# 你需要:
# 1. 檢視變更內容
# 2. 決定批准或退回
# 3. (可選) 提供審查意見
```

## Workflow Integration

### 觸發時機

`@agent-reviewer` 在偵測到重要變更時會自動提示需要人工審查:

```markdown
🔍 重要變更偵測

**變更類型**: API Schema 修改
**影響範圍**: POST /auth/login

需要人工審查,請執行: /approve
```

### 審查流程

```mermaid
graph LR
    A[@agent-coder<br/>完成實作] --> B[@agent-reviewer<br/>自動審查]
    B --> C{偵測到<br/>重要變更?}

    C -->|是| D[🛑 暫停]
    C -->|否| F[✅ 自動 commit]

    D --> E[/approve<br/>人工審查]
    E --> G{批准?}

    G -->|批准| H[@agent-reviewer<br/>完成 commit]
    G -->|退回| I[@agent-coder<br/>修改]

    I --> B
```

### 審查選項

執行 `/approve` 後會看到:

```markdown
## 待審查變更

**任務**: LIN-123 - User Authentication API
**變更類型**: API Schema 修改

### 變更摘要

**Modified Files**:
- src/routes/auth.routes.ts
- src/schemas/auth.schema.ts
- docs/api/auth.openapi.yaml

**API Changes**:
```diff
POST /auth/login
- Request: { email, password }
+ Request: { email, password, deviceId }

- Response: { accessToken, refreshToken }
+ Response: { accessToken, refreshToken, sessionId }
```

**影響分析**:
- 破壞性變更: ❌ 否 (向後相容)
- 需要前端調整: ✅ 是 (新增 deviceId 欄位)
- 需要文件更新: ✅ 是 (已完成)

---

**選項**:
A) ✅ 批准並 commit
B) ❌ 退回修改 (附帶意見)
C) 🔍 查看詳細 diff
D) 📝 新增審查註記後批准

請選擇 (A/B/C/D):
```

## Response Examples

### 選項 A: 批准並 commit

```markdown
✅ 變更已批准

@agent-reviewer 將執行以下操作:
1. 標記審查通過
2. 建立 git commit
3. 更新任務狀態

Commit message:
feat(LIN-123): add device tracking to auth API

- Add deviceId to login request
- Return sessionId in login response
- Update API documentation

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
Reviewed-By: [Your Name]
```

### 選項 B: 退回修改

```markdown
❌ 變更已退回

**審查意見**:
deviceId 欄位應該是可選的,不應強制要求。
建議調整 schema 為:
```typescript
{
  email: string;
  password: string;
  deviceId?: string;  // optional
}
```

任務已標記為需要修改,@agent-coder 將收到通知。
```

### 選項 C: 查看詳細 diff

顯示完整的 git diff 輸出

### 選項 D: 新增審查註記後批准

```markdown
**審查註記**:
API 變更已確認,但需注意:
1. 前端團隊需要同步更新
2. 舊版 mobile app 可能需要處理向後相容
3. 建議在下個 sprint 通知使用者升級

請輸入額外的審查註記 (按 Enter 完成):
> [Your notes here]

✅ 已批准並記錄審查註記
```

## Integration with Agent Workspace

審查記錄會寫入 agent workspace:

```javascript
// 批准記錄寫入 .agents/tasks/LIN-123/approve.md
const approvalRecord = {
  approved_at: new Date().toISOString(),
  approved_by: 'human',
  change_type: 'api_schema',
  decision: 'approved',
  notes: 'Confirmed with frontend team, backward compatible'
};

task.writeAgentOutput('approve', JSON.stringify(approvalRecord, null, 2));
```

## Best Practices

1. **仔細檢視影響分析**: 確認是否為破壞性變更
2. **確認測試覆蓋**: 重要變更必須有完整測試
3. **檢查文件同步**: API 變更必須更新文件
4. **考慮向後相容性**: 評估對現有客戶端的影響
5. **記錄審查意見**: 為未來參考留下審查記錄

## Key Constraints

- **Only Human**: 此命令僅供人工使用,agents 無法執行
- **Blocking**: 任務會暫停直到審查完成
- **Required for Critical Changes**: 重要變更必須經過此流程
- **Audit Trail**: 所有審查記錄都會保存

## References

- @~/.claude/workflow.md - Complete workflow
- @~/.claude/agents/reviewer.md - Reviewer agent
- @~/.claude/CLAUDE.md - Global configuration
