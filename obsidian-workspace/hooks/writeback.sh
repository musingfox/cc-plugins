#!/usr/bin/env bash
# Writes a bound session's progress back to its task card.
#
# cc-mobile writes ~/.claude-mobile/launches/<session_id>.json when it starts a
# session for a card: {cardPath, vault, project, paneId, createdAt}. Every
# session in every repo with obw enabled fires this hook; a session without
# that file leaves at once, before reading anything else.
#
# Usage:  writeback.sh prompt|stop|permission   (hook input JSON on stdin)
#   prompt      first prompt of the session: set `session`, append "工作中"
#   stop        append the last reply's first line; a longer reply's full text
#               goes to pm/<project>/runs/<card>.md, linked from that line
#   permission  append "需要核准"
# Env:    OBW_LAUNCHES_DIR (default ~/.claude-mobile/launches)
#         OBW_WRITEBACK_LOG (default ~/.claude-mobile/writeback.log)
# Exit:   always 0 -- a failed write is logged, never surfaced to the session.

input=$(cat)
[[ $input =~ \"session_id\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]] || exit 0
sid=${BASH_REMATCH[1]}
binding="${OBW_LAUNCHES_DIR:-$HOME/.claude-mobile/launches}/$sid.json"
[ -f "$binding" ] || exit 0

log="${OBW_WRITEBACK_LOG:-$HOME/.claude-mobile/writeback.log}"
fail() { printf '%s %s %s: %s\n' "$(date '+%F %T')" "$sid" "${1:-?}" "$2" >>"$log" 2>/dev/null; exit 0; }

event="$1"
card=$(jq -r '.cardPath // empty' "$binding" 2>/dev/null)
vault=$(jq -r '.vault // empty' "$binding" 2>/dev/null)
project=$(jq -r '.project // empty' "$binding" 2>/dev/null)
[ -n "$card" ] && [ -n "$vault" ] || fail "$event" "binding lacks cardPath or vault"

now=$(date '+%F %H:%M')
run_path="" run_text="" set_session=false
case "$event" in
  prompt)
    set_session=true
    line="- $now 工作中" ;;
  permission)
    line="- $now 需要核准" ;;
  stop)
    msg=$(printf '%s' "$input" | jq -r '.last_assistant_message // empty' 2>/dev/null)
    first=$(printf '%s\n' "$msg" | sed '/^[[:space:]]*$/d' | head -1)
    [ -n "$first" ] || first="（沒有回覆內容）"
    line="- $now $first"
    if [ "$(printf '%s\n' "$msg" | sed '/^[[:space:]]*$/d' | wc -l)" -gt 1 ] && [ -n "$project" ]; then
      name=$(basename "$card" .md)
      run_path="pm/$project/runs/$name.md"
      heading=$(date '+%F %H.%M.%S')
      run_text=$(printf '## %s\n\n%s\n' "$heading" "$msg")
      line="${line}（[[pm/${project}/runs/${name}#${heading}|全文]]）"
    fi ;;
  *) fail "$event" "unknown event" ;;
esac

# Content goes in as base64 JSON and is decoded inside Obsidian: the CLI's
# content= turns a literal backslash-n into a newline and has cut CJK text in
# large writes while still reporting success.
payload=$(jq -n --arg card "$card" --arg sid "$sid" --arg line "$line" \
  --arg runPath "$run_path" --arg runText "$run_text" --argjson setSession "$set_session" \
  '{card:$card, sid:$sid, line:$line, runPath:$runPath, runText:$runText, setSession:$setSession}' | base64 | tr -d '\n')

js=$(cat <<'JS'
(async () => {
  const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob('__PAYLOAD__'), c => c.charCodeAt(0))));
  const f = app.vault.getAbstractFileByPath(p.card);
  if (!f) return 'ERR card not found: ' + p.card;
  if (p.setSession) {
    let bound = false;
    await app.fileManager.processFrontMatter(f, fm => {
      if (fm.session === p.sid) { bound = true; return; }
      fm.session = p.sid;
    });
    if (bound) return 'OK already bound';
  }
  if (p.runPath) {
    const r = app.vault.getAbstractFileByPath(p.runPath);
    if (r) await app.vault.process(r, s => s.replace(/\n*$/, '\n\n') + p.runText);
    else {
      const dir = p.runPath.slice(0, p.runPath.lastIndexOf('/'));
      if (!app.vault.getAbstractFileByPath(dir)) await app.vault.createFolder(dir);
      await app.vault.create(p.runPath, p.runText);
    }
  }
  await app.vault.process(f, s => {
    const lines = s.split('\n');
    let at = lines.findIndex(l => l.trim() === '## Agent');
    if (at < 0) {
      const notes = lines.findIndex(l => l.trim() === '## Notes');
      const block = ['## Agent', '', p.line, ''];
      if (notes < 0) return s.replace(/\n*$/, '\n\n') + block.join('\n');
      lines.splice(notes, 0, ...block);
      return lines.join('\n');
    }
    let end = lines.findIndex((l, i) => i > at && /^#{1,2} /.test(l));
    if (end < 0) end = lines.length;
    let last = end;
    while (last > at + 1 && lines[last - 1].trim() === '') last--;
    lines.splice(last, 0, ...(last === at + 1 ? ['', p.line] : [p.line]));
    return lines.join('\n');
  });
  const back = await app.vault.read(f);
  if (!back.includes(p.line)) return 'ERR line missing after write';
  if (p.runPath && !(await app.vault.read(app.vault.getAbstractFileByPath(p.runPath))).includes(p.runText)) return 'ERR run note mismatch';
  return 'OK';
})()
JS
)
out=$(timeout 15 obsidian "vault=$vault" eval "code=${js/__PAYLOAD__/$payload}" 2>&1 | cat)
case "$out" in *"=> OK"*) exit 0 ;; esac
fail "$event" "obsidian: $(printf '%s' "$out" | head -c 300)"
