---
viz: feedback
title: 回饋頁裡的圖：正確的流程圖與壞掉的語法
panel: 你的決定
prompt: tests/diagrams.e2e.ts 用這份 brief 檢查回饋頁的 mermaid 圖。
d1.title: 午餐吃什麼？
d1.options: 便當 | 拉麵 | 沙拉
d1.recommend: 便當
d1.choice:
d1.notes:
notes:
---

## 午餐吃什麼？

| 選項 | 好處 | 代價 | 改回成本 |
|---|---|---|---|
| 便當 | 便宜；快 | 油 | 低 |
| 拉麵 | 好吃；熱 | 要排隊；鹹 | 中 |
| 沙拉 | 清爽 | 吃不飽 | 低 |

## 流程

```mermaid
graph TD
    Start[Start] --> Decide{Hungry?}
    Decide -->|yes| Eat[Eat]
```

## 壞掉的圖

```mermaid
graph TD
    A -->
```
