# Recipe round-trip monitoring

A recipe's Save button (儲存回饋 in feedback) writes the edited markdown back to the source `.md`
via the viz server (`/api/save`), but **nothing wakes you to read it** — the
user otherwise has to come back to chat and tell you, or click Export and paste.
To close the loop automatically, arm a `Monitor` on the source file right
after rendering: the user edits, clicks Save, the file's mtime changes, and
the Monitor wakes you to read it back — no copy-paste, no "I'm done" ping.

**Prerequisite**: the recipe must open on `http://127.0.0.1:<port>/...` (the
URL render.sh prints). If render.sh fell back to `file://` (server
unavailable — all candidate ports held), the Save button is hidden and
monitoring is useless; tell the user to use Export instead.

After a successful recipe render, note the absolute source path (the path
you passed to render.sh — for plan-name inputs it is
`~/.claude/plans/<name>.md`), then arm the Monitor:

```
Monitor:
  description: recipe edits on <source-path>
  timeout_ms: 300000
  command: |
    f="<source-path>"; prev=$(stat -f %m "$f" 2>/dev/null || echo 0); idle=0
    while true; do
      sleep 1
      cur=$(stat -f %m "$f" 2>/dev/null || echo 0)
      if [ "$cur" != "$prev" ]; then
        echo "recipe-saved: $f mtime=$cur"; prev="$cur"; idle=0
      else
        idle=$((idle + 1))
        [ "$idle" -ge 120 ] && { echo "recipe-watch-idle: $f — say resume-watch to restart"; exit 0; }
      fi
    done
```

- **`recipe-saved` event**: `Read` the source file, diff against what you
  last knew, and report the updated content to the user. They need not type
  anything.
- **`recipe-watch-idle` (120s no change) or Monitor timeout (300s)**: tell
  the user monitoring stopped. **Restart** = re-arm the same Monitor on the
  same source path, on an explicit "resume watch" from the user. Do not
  auto-restart indefinitely — idle usually means they stopped editing.

`stat -f %m` is macOS-only.

