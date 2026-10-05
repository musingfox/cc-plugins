#!/usr/bin/env bash
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
# hooks/writeback.sh: a session with no binding file leaves at once without
# touching Obsidian; a bound one sends one eval carrying the right line.
# Obsidian itself is stubbed; the live write is checked by hand (see the card).

fail() { echo "  ✗ $*"; exit 1; }
HOOK="$PWD/obsidian-workspace/hooks/writeback.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/bin" "$TMP/launches"
cat >"$TMP/bin/obsidian" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$@" >"$OBW_STUB_ARGS"
echo "=> OK"
STUB
chmod +x "$TMP/bin/obsidian"
export PATH="$TMP/bin:$PATH" OBW_LAUNCHES_DIR="$TMP/launches" OBW_WRITEBACK_LOG="$TMP/log" OBW_STUB_ARGS="$TMP/args"

# payload EVAL_ARGS_FILE: the JSON the hook base64-encoded into its eval code.
payload() { grep -o "atob('[^']*')" "$1" | sed "s/atob('//; s/')//" | base64 -d; }

# T1: no binding file -> exit 0, no Obsidian call, under 50 ms. The best of
# three runs after a warm-up: the first spawn on a cold cache measures the disk.
now_ms() { perl -MTime::HiRes=time -e 'printf "%d", time * 1000'; }
unbound='{"session_id":"none-such","hook_event_name":"Stop","last_assistant_message":"x"}'
echo "$unbound" | "$HOOK" stop
best=99999
for _ in 1 2 3; do
  start=$(now_ms); echo "$unbound" | "$HOOK" stop; rc=$?; ms=$(( $(now_ms) - start ))
  [ "$ms" -lt "$best" ] && best=$ms
  [ "$rc" = 0 ] || fail "T1 exit $rc"
done
[ ! -e "$TMP/args" ] || fail "T1 an unbound session called obsidian"
[ "$best" -lt 50 ] || fail "T1 took ${best}ms"

printf '{"cardPath":"pm/p/tasks/c.md","vault":"v","project":"p","paneId":"1","createdAt":"t"}\n' >"$TMP/launches/s1.json"

# T2: first prompt binds the session and says it is working.
echo '{"session_id":"s1","hook_event_name":"UserPromptSubmit","prompt":"go"}' | "$HOOK" prompt
grep -qx 'vault=v' "$TMP/args" || fail "T2 eval not sent to the binding's vault"
p=$(payload "$TMP/args")
[ "$(jq -r .setSession <<<"$p")" = true ] || fail "T2 session not set"
jq -r .line <<<"$p" | grep -q ' 工作中$' || fail "T2 line: $(jq -r .line <<<"$p")"

# T3: a multi-line reply -> first line on the card, full text in the run note.
jq -n '{session_id:"s1", hook_event_name:"Stop", last_assistant_message:"結果：完成 — 修好了\n\n細節一\n細節二"}' | "$HOOK" stop
p=$(payload "$TMP/args")
jq -r .line <<<"$p" | grep -q ' 結果：完成 — 修好了（\[\[pm/p/runs/c#' || fail "T3 line: $(jq -r .line <<<"$p")"
[ "$(jq -r .runPath <<<"$p")" = "pm/p/runs/c.md" ] || fail "T3 run path: $(jq -r .runPath <<<"$p")"
jq -r .runText <<<"$p" | grep -q '細節二' || fail "T3 run note lacks the full text"

# T4: a one-line reply has no run note.
jq -n '{session_id:"s1", hook_event_name:"Stop", last_assistant_message:"結果：需要你"}' | "$HOOK" stop
[ -z "$(payload "$TMP/args" | jq -r .runPath)" ] || fail "T4 one-line reply wrote a run note"

# T5: a permission prompt.
echo '{"session_id":"s1","hook_event_name":"Notification","notification_type":"permission_prompt"}' | "$HOOK" permission
payload "$TMP/args" | jq -r .line | grep -q ' 需要核准$' || fail "T5 permission line"
echo ok
