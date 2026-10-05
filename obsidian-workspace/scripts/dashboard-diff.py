"""Compare a vault dashboard (stdin) with the plugin's dashboard template.

Usage: obsidian vault=V read path=P | uv run --no-project --with pyyaml dashboard-diff.py project NAME
       obsidian vault=V read path=pm/dashboard.base | uv run --no-project --with pyyaml dashboard-diff.py cross

Both sides are parsed as YAML before comparing: Obsidian rewrites a .base it has
opened (drops quotes, moves keys), so a text diff is mostly noise.

First line of output:
  verdict: missing       the CLI reported the file not found
  verdict: current       same as the current template
  verdict: stale SHA     same as an earlier template version, no hand edits
  verdict: edited        matches no template version
Then, for stale and edited, difference lines:
  added PATH             in the dashboard, not in the reference
  removed PATH           in the reference, not in the dashboard
  changed PATH: A -> B   dashboard value A, reference value B
A whole view or block is named by its path, never printed.

Every earlier template version lives in dashboard-history/<kind>-<sha>.base;
tests/dashboard-diff.test.sh fails when a committed version is missing there.
"""

import json
import sys
from pathlib import Path

import yaml

PLUGIN = Path(__file__).resolve().parent.parent
TEMPLATES = PLUGIN / "templates"
HISTORY = Path(__file__).resolve().parent / "dashboard-history"


def load(text, project):
    return yaml.safe_load(text.replace("__PROJECT__", project))


def keyed(base):
    """Views keyed by name, so a reordered or inserted view is not a change to every later one."""
    out = dict(base)
    if isinstance(out.get("views"), list):
        out["views"] = {f'"{v.get("name")}"': v for v in out["views"] if isinstance(v, dict)}
    return out


def diff(dash, ref, path=""):
    if isinstance(dash, dict) and isinstance(ref, dict):
        lines = []
        for key in list(ref) + [k for k in dash if k not in ref]:
            sub = f"{path}.{key}" if path else str(key)
            if key not in dash:
                lines.append(f"removed {sub}")
            elif key not in ref:
                lines.append(f"added {sub}")
            else:
                lines += diff(dash[key], ref[key], sub)
        return lines
    if dash == ref:
        return []
    show = lambda v: json.dumps(v, ensure_ascii=False)
    return [f"changed {path}: {show(dash)} -> {show(ref)}"]


def main(argv):
    if len(argv) < 2 or argv[1] not in ("project", "cross") or (argv[1] == "project") != (len(argv) == 3):
        print("usage: dashboard-diff.py project NAME | dashboard-diff.py cross", file=sys.stderr)
        return 2
    kind = argv[1]
    project = argv[2] if kind == "project" else ""

    text = sys.stdin.read()
    if text.lstrip().startswith("Error:"):
        print("verdict: missing")
        return 0
    try:
        dash = yaml.safe_load(text)
    except yaml.YAMLError as e:
        print(f"not a YAML file: {e}", file=sys.stderr)
        return 2
    if not isinstance(dash, dict):
        print("not a .base file: the top level is not a mapping", file=sys.stderr)
        return 2
    dash = keyed(dash)

    versions = {"current": load((TEMPLATES / f"dashboard-{kind}.base").read_text(), project)}
    for f in sorted(HISTORY.glob(f"{kind}-*.base")):
        versions[f.stem.split("-", 1)[1]] = load(f.read_text(), project)
    diffs = {name: diff(dash, keyed(base)) for name, base in versions.items()}

    if not diffs["current"]:
        print("verdict: current")
        return 0
    same = [name for name, d in diffs.items() if not d]
    if same:
        print(f"verdict: stale {same[0]}")
    else:
        base = min(diffs, key=lambda name: len(diffs[name]))
        print("verdict: edited")
        print(f"base: {base}")
        print(f"hand edits (dashboard vs {base}):")
        for line in diffs[base]:
            print(f"  {line}")
        if base == "current":
            return 0
    print("changes (dashboard vs current template):")
    for line in diffs["current"]:
        print(f"  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
