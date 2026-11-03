---
name: wrap-up
description: Close out the current task by reading the conversation, listing only the wrap-up operations it actually needs (recap, stale docs, commit/push/release, task card, memory/config), each with its evidence and tool, then running the ones the user ticks; every run also scores the session 1-5. Use when the user types /wrap-up, says "收尾", "收一下", "wrap up", "結束這個任務", or asks what is left to close out a task.
---

# /wrap-up — 依對話內容收尾

收尾不是固定流程。這次任務需要哪些操作，由對話內容和工作目錄的實際狀態決定。

## 1. 蒐集依據

先讀對話，再用指令確認現況。依據只能來自這兩處。

- 對話：改了哪些檔案、做了哪些決定、提到哪張任務卡、留下哪些待辦。
- 任務卡：對話提到卡片時，讀取卡片全文，找出和現況不符的敘述（例如「尚未 commit」而實際已經 push）。
- 現況（在 git repo 內才跑）：
  ```bash
  git status --short
  git log --oneline @{u}.. 2>/dev/null
  ```

## 2. 列出候選操作

逐一對照下表。一項操作必須有具體依據才能列出；找不到依據的就不列。例如工作目錄沒有改動，也沒有未 push 的 commit，就不列 commit 與 push。

| 操作 | 列出的依據 | 工具 |
|---|---|---|
| 更新文件 | 這次改動讓某份文件的敘述過時 | `git diff` 搭配 grep 找引用；在 cc-plugins 內用 `marketplace` skill 檢查四檔不變式 |
| Commit | 工作目錄有這次任務的改動 | `commit-commands:commit` |
| Push、開 PR | 有未 push 的 commit | `git push`；需要 PR 時用 `commit-commands:commit-push-pr` |
| Release | 專案有 release 流程，且這次改動需要釋出 | 先讀專案 CLAUDE.md 或 README 的 release 說明並照做；找不到說明就只 push，並問使用者 |
| 更新任務卡 | 對話提到某張卡，而且 AC 已完成、有進度要記、卡片內容與現況不符，或有後續工作 | `/obw:pm`：勾 AC、寫備註、封存、開後續卡 |
| Memory、知識庫 | 只和這個專案有關、值得跨 session 保留、但 repo 沒有記錄的事實 | memory 檔案（依系統提示的 memory 規則）；Hindsight 用 `hindsight_ingest_document` |
| 全域規則 | 適用所有專案的偏好，或在多個專案反覆出現的障礙 | 提出 `~/.claude/CLAUDE.md` 的修改，逐項核准後再改；memory 只在存入的專案載入，不適合放這類規則 |
| 設定、變數 | 對話中決定要改設定，但還沒改 | `Edit`；Claude Code 設定用 `update-config` skill |
| Journal | 使用者要把 recap 留存下來 | `/obw:jot` |

每一項寫成一行，包含操作、依據與工具。依據要指名具體內容，例如檔名、commit hash、卡片名稱或對話中的哪個決定。

## 3. 讓使用者勾選

用 `AskUserQuestion` 並設 `multiSelect: true`。每個問題最多 4 個選項，候選超過 4 項就拆成多個問題。沒有被勾選的項目不執行。

### 評分

同一次呼叫固定再加一個單選的評分問題，沒有候選操作時也要問。分數是 `/dream` 的輸入，評的是使用者實際拿到想要的東西的程度，不是工作量或工具呼叫次數。

| 分數 | 含義 |
|---|---|
| 5 | 一次到位，沒有需要糾正的地方 |
| 4 | 達成目標，過程有小繞路 |
| 3 | 達成了但要多次糾正才走對方向 |
| 2 | 只做到一部分，或方向要使用者親自拉回來 |
| 1 | 沒達成，或產出要整個丟掉 |

問題文字寫出建議分數與一句理由，理由指名這個 session 的具體事件（走錯方向、重問幾次、一次到位）。選項只能有 2 到 4 個：建議分數標 (Recommended) 放第一個，再放上下相鄰的分數，其餘分數由使用者選 Other 填。使用者在 Other 或 notes 寫的理由取代建議理由。一次呼叫最多 4 個問題，加上評分超過 4 個就分兩次呼叫。

使用者回答後立刻寫入，不等後面的操作。session id 是 scratchpad 路徑 `/private/tmp/claude-501/<project-slug>/<session-id>/scratchpad` 的中段；取不到時用 `ls -t ~/.claude/projects/<project-slug>/*.jsonl | head -1` 的檔名（不含副檔名）。

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/wrap-up/scripts/rate.mjs" \
  --session <session-id> --score <1-5> --reason "<一句話>" --project "$(pwd)"
```

同一個 session 再跑一次 wrap-up 就會追加一行，聚合時以最後一行為準。腳本只寫 `~/.claude/usage-data/ratings.jsonl`，不碰 `/insights` 擁有的 `facets/` 與 `session-meta/`。

## 4. 依序執行

照以下順序執行，因為後面的步驟要記錄前面步驟的結果（例如卡片備註要寫已經 push 的狀態）：

1. 更新文件
2. 設定、變數、全域規則
3. Commit
4. Push、PR、Release
5. 更新任務卡
6. Memory、知識庫、Journal

規則：

- push、release、封存卡片這類對外或不易還原的操作，在執行前要用 `AskUserQuestion` 再確認一次。勾選不算是確認。
- 每一步都要取得收據：commit 要有 hash，push 要有 `git push` 的輸出，CLI 要有它的回應。
- 寫入卡片、文件或 memory 之後，要讀回檔案實際內容，確認寫進去的就是預期的文字。指令結束沒有報錯，不代表內容正確（變數內插就可能寫壞卡片）。
- 任何一步失敗就停下，不要重試，也不要繞過去。

## 5. 回報

最後一則回覆包含：

- Recap：這次做了什麼、決定了什麼、還有哪些待辦。
- 每個執行過的操作和它的收據，包含評分寫入時 `rate.mjs` 印出的那一行。
- 失敗時，要列出已完成的步驟、失敗的步驟與錯誤訊息，以及還沒執行的步驟。
