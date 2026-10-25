#!/usr/bin/env bash
# Append review repros as test cases of the contracts they name.
#
# Usage: add-repros.sh --contracts FILE REPROS_FILE
# Stdout: one line per repro -- ADDED <contract> R<n> or DUPLICATE <contract> <id>
# Exit:   0 applied (or nothing to do), 2 usage/missing file, 3 malformed,
#         4 jq missing, 5 a repro names a contract that is not in FILE
#
# An archive of the previous FILE is written only when a case is appended,
# beside FILE as contracts-prev-<ts>.json, never overwriting an existing archive
# (two writes inside one second get a -n suffix). The FILE write is atomic (temp
# file beside it, then mv). On any error FILE is left untouched and no archive is
# written.

set -euo pipefail

if ! command -v jq >/dev/null 2>&1; then
  echo "add-repros: jq is required" >&2
  exit 4
fi

usage() {
  echo "Usage: add-repros.sh --contracts FILE REPROS_FILE" >&2
  exit 2
}

contracts=""
repros_file=""
while [ $# -gt 0 ]; do
  case "$1" in
    --contracts)
      [ $# -ge 2 ] || usage
      contracts="$2"
      shift 2 ;;
    -*) usage ;;
    *)
      [ -z "$repros_file" ] || usage
      repros_file="$1"
      shift ;;
  esac
done
[ -n "$contracts" ] && [ -n "$repros_file" ] || usage

if [ ! -f "$contracts" ] || [ ! -f "$repros_file" ]; then
  echo "add-repros: missing contracts file or repros file" >&2
  exit 2
fi
dir="$(cd "$(dirname "$contracts")" && pwd)"

# archive_contracts: copies the contracts file to contracts-prev-<YYYYmmddHHMMSS>[-n].json
#   beside it and prints that path. Never overwrites an earlier archive.
archive_contracts() {
  local ts archive n=0
  ts=$(date +%Y%m%d%H%M%S)
  archive="$dir/contracts-prev-${ts}.json"
  while [ -e "$archive" ]; do
    n=$((n + 1))
    archive="$dir/contracts-prev-${ts}-${n}.json"
  done
  cp "$contracts" "$archive"
  printf '%s\n' "$archive"
}

if ! jq -e '.contracts | type == "array"' "$contracts" >/dev/null 2>&1; then
  echo "add-repros: malformed contracts.json" >&2
  exit 3
fi

if ! jq -e '
  (.repros | type) == "array"
  and all(.repros[];
        (.contract | type) == "string" and (.contract | length) > 0
    and (.given    | type) == "string" and (.given    | length) > 0
    and (.expect   | type) == "string" and (.expect   | length) > 0
    and (.command  | type) == "string" and (.command  | length) > 0)
' "$repros_file" >/dev/null 2>&1; then
  echo "add-repros: malformed repros or entry missing contract, given, expect, or command" >&2
  exit 3
fi

# unknown-name check
unknown=$(jq -r --slurpfile c "$contracts" '
  [ .repros[].contract ] - [ $c[0].contracts[].name ] | unique | .[]
' "$repros_file")
if [ -n "$unknown" ]; then
  printf '%s\n' "$unknown" >&2
  exit 5
fi
# end unknown-name check

work=""
doc=""
cleanup() {
  [ -n "$work" ] && rm -f "$work"
  [ -n "$doc" ] && rm -f "$doc"
  return 0
}
trap cleanup EXIT

work=$(mktemp "$dir/.add-repros.XXXXXX")
jq --slurpfile repros "$repros_file" '
  reduce $repros[0].repros[] as $rep (
    {doc: ., log: [], added: false, inserts: []};
    (.doc.contracts | map(.name) | index($rep.contract)) as $idx
    | if $idx == null then
        .
      else
        (.doc.contracts[$idx].test_cases // []) as $cases
        | ([ $cases[] | select(.given == $rep.given) ] | first) as $dup
        | if $dup != null then
            .log += ["DUPLICATE \($rep.contract) \($dup.id)"]
          else
            ([ $cases[] | .id // empty | select(type == "string") ]) as $ids
            | (first(range(1; 1000000) | "R\(.)" as $rid | select(($ids | index($rid)) == null) | $rid)) as $id
            | .doc.contracts[$idx].test_cases = (
                $cases + [{id: $id, given: $rep.given, expect: $rep.expect, command: $rep.command}]
              )
            | .inserts += [{
                contract: $rep.contract,
                case: {id: $id, given: $rep.given, expect: $rep.expect, command: $rep.command}
              }]
            | .log += ["ADDED \($rep.contract) \($id)"]
            | .added = true
          end
      end
  )
' "$contracts" > "$work"

if [ "$(jq -r '.added' "$work")" = "true" ]; then
  doc=$(mktemp "$dir/.contracts.XXXXXX")
  python3 - "$contracts" "$work" "$doc" <<'PY'
import json, sys

src_path, plan_path, out_path = sys.argv[1:]
src = open(src_path, encoding="utf-8", newline="").read()
plan = json.load(open(plan_path, encoding="utf-8"))

class Parser:
    def __init__(self, s):
        self.s = s
        self.i = 0
        self.n = len(s)

    def skip(self):
        while self.i < self.n and self.s[self.i] in " \t\r\n":
            self.i += 1

    def parse(self):
        self.skip()
        if self.i >= self.n:
            raise ValueError("truncated JSON")
        c = self.s[self.i]
        if c == "{":
            return self.obj()
        if c == "[":
            return self.arr()
        if c == '"':
            return self.string()
        if c == "t":
            self.i += 4
            return True
        if c == "f":
            self.i += 5
            return False
        if c == "n":
            self.i += 4
            return None
        return self.number()

    def string(self):
        start = self.i
        self.i += 1
        while self.i < self.n:
            if self.s[self.i] == "\\":
                self.i += 2
                continue
            if self.s[self.i] == '"':
                self.i += 1
                return json.loads(self.s[start:self.i])
            self.i += 1
        raise ValueError("unterminated string")

    def number(self):
        start = self.i
        while self.i < self.n and self.s[self.i] in "0123456789+-eE.":
            self.i += 1
        return json.loads(self.s[start:self.i])

    def arr(self):
        open_i = self.i
        self.i += 1
        self.skip()
        if self.i < self.n and self.s[self.i] == "]":
            close_i = self.i
            self.i += 1
            return {"__array__": True, "open": open_i, "close": close_i}
        while True:
            self.parse()
            self.skip()
            if self.s[self.i] == ",":
                self.i += 1
                continue
            if self.s[self.i] == "]":
                close_i = self.i
                self.i += 1
                return {"__array__": True, "open": open_i, "close": close_i}
            raise ValueError("bad array")

    def obj(self):
        self.i += 1
        self.skip()
        keys = {}
        empty = True
        if self.i < self.n and self.s[self.i] == "}":
            close_i = self.i
            self.i += 1
            return {"__object__": True, "keys": keys, "close": close_i, "empty": True}
        while True:
            empty = False
            self.skip()
            k = self.string()
            self.skip()
            if self.s[self.i] != ":":
                raise ValueError("expected colon")
            self.i += 1
            keys[k] = self.parse()
            self.skip()
            if self.s[self.i] == ",":
                self.i += 1
                continue
            if self.s[self.i] == "}":
                close_i = self.i
                self.i += 1
                return {"__object__": True, "keys": keys, "close": close_i, "empty": empty}
            raise ValueError("bad object")

doc = Parser(src).parse()
contracts = doc["keys"]["contracts"]
by_name = {}
# Walk contracts with a second pass over the raw array so the first name wins.
# The parsed object does not keep contract order spans separately; re-scan.
p = Parser(src)
p.i = contracts["open"] + 1
while True:
    p.skip()
    if p.s[p.i] == "]":
        break
    obj = p.parse()
    name = obj["keys"].get("name")
    if isinstance(name, str) and name not in by_name:
        cases = obj["keys"].get("test_cases")
        by_name[name] = {
            "cases": cases if isinstance(cases, dict) and cases.get("__array__") else None,
            "close": obj["close"],
            "empty": obj["empty"],
        }
    p.skip()
    if p.s[p.i] == ",":
        p.i += 1

grouped = {}
order = []
for item in plan["inserts"]:
    name = item["contract"]
    if name not in grouped:
        grouped[name] = []
        order.append(name)
    grouped[name].append(item["case"])

edits = []
for name in order:
    loc = by_name[name]
    payload = ",".join(
        json.dumps(case, ensure_ascii=False, separators=(",", ":"))
        for case in grouped[name]
    )
    if loc["cases"] is not None:
        inner = src[loc["cases"]["open"] + 1:loc["cases"]["close"]]
        if inner.strip() == "":
            edits.append((loc["cases"]["close"], payload))
        else:
            edits.append((loc["cases"]["close"], "," + payload))
    else:
        prefix = "" if loc["empty"] else ","
        edits.append((loc["close"], prefix + '"test_cases":[' + payload + "]"))

edits.sort(key=lambda e: e[0], reverse=True)
out = src
for pos, text in edits:
    out = out[:pos] + text + out[pos:]
open(out_path, "w", encoding="utf-8", newline="").write(out)
PY
  archive_contracts >/dev/null
  mv "$doc" "$contracts"
  doc=""
fi

jq -r '.log[]' "$work"
