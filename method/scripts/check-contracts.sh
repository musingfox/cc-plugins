#!/usr/bin/env bash
# Acceptance check: a contracts.json document follows the schema in
# method/skills/method/contracts.md ("contracts.json").
#
# Usage:   check-contracts.sh FILE
# Stdout:  always empty
# Stderr:  "check-contracts: <reason>"  (one line, exit 2) when FILE is missing,
#            unreadable, not JSON, or has no `contracts` array
#          "<name>: <problem>"          (one line per violation, exit 1)
#          empty                        (exit 0)
# Exit:    0 = no violation, 1 = violation, 2 = unusable input
#
# Per contract: observes is a non-empty array of stdout|stderr|exit|files;
# touches_files is a non-empty array; test_files is an array whose entries are
# in touches_files; test_cases is a non-empty array whose every `expect` names
# each observed channel as "<channel>:". A contract without a string `name` is
# reported as "#<index>" (0-based). Never writes a file.

die() { echo "check-contracts: $1" >&2; exit 2; }

command -v jq >/dev/null 2>&1 || die "jq not found"
[ $# -eq 1 ] || die "usage: check-contracts.sh FILE"
FILE="$1"
[ -f "$FILE" ] || die "$FILE: no such file"
[ -r "$FILE" ] || die "$FILE: not readable"

jq -s -e 'length == 1' "$FILE" >/dev/null 2>&1 || die "$FILE: not JSON"
jq -e 'type == "object" and (.contracts | type) == "array"' "$FILE" >/dev/null 2>&1 \
  || die "$FILE: no contracts array"

problems="$(jq -r '
  def arr(k; $c):
    if ($c | has(k) | not) then "\(k) is missing"
    elif ($c[k] | type) != "array" then "\(k) is not an array"
    else empty end;
  def nonempty(k; $c):
    arr(k; $c),
    (if ($c | has(k)) and ($c[k] | type) == "array" and ($c[k] | length) == 0
     then "\(k) is empty" else empty end);
  def channels: ["stdout", "stderr", "exit", "files"];

  .contracts | to_entries[] | .key as $i | .value as $c
  | (if ($c | type) == "object" and ($c.name | type) == "string" then $c.name else "#\($i)" end) as $n
  | (if ($c | type) != "object" then "contract is not an object"
     else
       nonempty("observes"; $c),
       ( if ($c.observes | type) == "array"
         then $c.observes[] | select(. as $v | channels | index([$v]) | not)
              | "observes holds invalid value \(if type == "string" then . else tojson end)"
         else empty end ),
       nonempty("touches_files"; $c),
       arr("test_files"; $c),
       ( if ($c.test_files | type) == "array"
            and ($c.touches_files | type) == "array"
         then $c.test_files[] | . as $f
              | select(($c.touches_files | index([$f])) | not)
              | "test_files entry \(if type == "string" then . else tojson end) is not in touches_files"
         else empty end ),
       nonempty("test_cases"; $c),
       ( if ($c.test_cases | type) == "array" then
           ( [ $c.observes[]? | select(type == "string" and (. as $v | channels | index([$v]))) ] ) as $obs
           | $c.test_cases | to_entries[] | .key as $j | .value as $t
           | (if ($t | type) == "object" and ($t.id | type) == "string" then $t.id else "#\($j)" end) as $id
           | (if ($t | type) == "object" and ($t.expect | type) == "string" then $t.expect else "" end) as $e
           | $obs[] | . as $ch
           | select($e | test("(^|[^A-Za-z0-9_])" + $ch + ":") | not)
           | "test case \($id) expect does not name channel \($ch)"
         else empty end )
     end)
  | "\($n): \(.)"
' "$FILE")" || die "$FILE: could not be checked"

[ -z "$problems" ] && exit 0
printf '%s\n' "$problems" >&2
exit 1
