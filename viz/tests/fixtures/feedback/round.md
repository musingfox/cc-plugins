---
viz: feedback
title: 這一層要決定的三件事
panel: 你的決定
prompt: 每一題各自獨立，可以分開回答。
q1.title: 儲存層
q1.options: 留在 SQLite | 換 Postgres | 兩個都探
q1.recommend: 換 Postgres
q1.multi: true
q1.choice:
q1.notes:
q2.title: 匯出格式
q2.options: CSV | JSON
q2.choice:
q3.title: 還有什麼沒問到的
notes:
---

# 背景

這是 round 模式的 fixture：三個彼此獨立的決策，`q1` 允許多選，`q3` 只收自由回答。

| 決策 | 難逆轉 |
|---|---|
| 儲存層 | 是 |
| 匯出格式 | 否 |
