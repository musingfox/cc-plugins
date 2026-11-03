---
name: rate
description: Score the current Claude Code session 1-5 with a one-line reason, appended to ~/.claude/usage-data/ratings.jsonl. Use when the user types /rate, says "給這個 session 評分", "打個分數", "rate this session", or wants to record how well a session went. The score is input for /dream and triggers nothing by itself.
---

# /rate — 為這個 session 打分

分數是 `/dream` 的標籤資料，本身不觸發任何行為。

## 流程

1. **取得 session_id**：scratchpad 路徑的中段就是 session id，形如
   `/private/tmp/claude-501/<project-slug>/<session-id>/scratchpad`。取不到時退回該專案
   transcript 目錄下最新的 `.jsonl` 檔名（不含副檔名）：
   ```bash
   ls -t ~/.claude/projects/<project-slug>/*.jsonl | head -1
   ```

2. **決定分數**：
   - 使用者給了分數（`/wrap-up:rate 4`）就用它；理由沒給就依這個 session 的實際經過補一句。
   - 只打 `/wrap-up:rate`：先提一個分數與理由給使用者確認，確認後才寫入。不要自己決定就寫。
   - 評分依據是「使用者實際拿到想要的東西的程度」，不是工作量或工具呼叫次數。
     理由要指名具體事件（走錯方向、需要重問幾次、一次到位），不要寫抽象評語。

3. **寫入**：
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/rate/scripts/rate.mjs" \
     --session <session-id> --score <1-5> --reason "<一句話>" --project "$(pwd)"
   ```

重複評分同一個 session 就再追加一行，聚合時以最後一行為準，先前的保留成修正軌跡。

## 分數含義

| 分數 | 含義 |
|---|---|
| 5 | 一次到位，沒有需要糾正的地方 |
| 4 | 達成目標，過程有小繞路 |
| 3 | 達成了但要多次糾正才走對方向 |
| 2 | 只做到一部分，或方向要使用者親自拉回來 |
| 1 | 沒達成，或產出要整個丟掉 |

## 邊界

只寫 `ratings.jsonl`，不碰 `facets/` 與 `session-meta/`（那兩個目錄由 `/insights` 擁有，
會被它覆寫）。不要在這裡順手做分析，分析是 `/dream` 的事。
