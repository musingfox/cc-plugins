# Pi-Dispatch Migration Plan: MAIN-driven background dispatch

> Supersedes the earlier "Option B — Internal Modernization" plan. That plan kept the
> `pi-driver` sub-agent as a long-lived in-invocation poller. This plan instead moves the
> wait to the harness, driven by MAIN, because that is the only shape that delivers a
> **non-blocking** dispatch (MAIN keeps working while Pi runs). All claims below are backed
> by the receipts in the Evidence appendix.

## What changed since Option B

Option B existed to dodge the Bash tool's 10-minute ceiling by polling inside a sub-agent.
Three facts collapse that premise:

1. **The 10-minute ceiling is configurable, not a hard wall.** `BASH_MAX_TIMEOUT_MS` raises
   the per-call ceiling with no documented upper limit. The entire setsid/pgid/sleep-poll
   edifice was built to dodge a wall that a setting removes.
2. **`run_in_background` already firewalls heavy output.** A background Bash task's stdout
   goes to an output file; the completion notification injected into MAIN is metadata only
   (exit code + path). Measured: 801 lines of heavy stdout landed in the file, **zero** lines
   entered MAIN context. The §17 token firewall is therefore automatic on this path — no
   distiller sub-agent is required for it.
3. **Monitoring is native.** Claude Code's `Monitor` / `TaskOutput` / `TaskGet` tools watch a
   `run_in_background` task directly. "Non-blocking + watch progress" needs no MCP and no
   custom machinery.

The one constraint that shapes the architecture (finding F3): **only MAIN is re-invoked when
a background task completes; a sub-agent is not.** So a non-blocking dispatch must originate
from MAIN.

## Decision: two orthogonal layers

The four mechanisms considered (background task, sub-agent, MCP, loop) are not competitors —
they sit on two independent axes.

| Layer | Choice now | Future upgrade |
|---|---|---|
| **Wait** (survive a long run without blocking MAIN) | `run_in_background` Bash from MAIN + harness completion notification (`Monitor` for live progress) | — (native, sufficient) |
| **Selection** (pick the right agent profile per task) | `pi-dispatch.sh --profile NAME` reading a small profiles file | MCP server exposing one tool per profile, when ≥3 profiles are in regular use or a non-shell consumer appears |

`loop` (ScheduleWakeup) is redundant with the completion notification for a harness-observable
task and is not used. **MCP code-execution / sandbox** (Anthropic "Code execution with MCP",
Cloudflare "Code Mode") is **not available in the Claude Code CLI** (SDK/API only) and, even
where available, addresses only token efficiency — not long-running or monitoring. It is a
future option *if* this stack ever moves onto an SDK-based host; it is not a current lever.

## Target architecture

```
MAIN
 ├─ Bash(run_in_background) → pi-run-sync.sh --profile X   (one per shard, fired together)
 │                              └─ runs pi to completion, stdout → rundir/raw.jsonl
 │                              └─ self-distills → outcome.md (paths-only)
 ├─ (free to do other work; optional Monitor for progress)
 └─ on completion ping → Read outcome.md (small, paths-only) → proceed
```

- **Wait:** MAIN fires N background dispatches in one message; the harness pings MAIN as each
  completes. No sleep-poll, no setsid in the cf path, no translation layer, no waiting
  sub-agent.
- **Firewall:** the heavy `raw.jsonl` stays in the run dir; the background task's completion
  notification carries metadata only; MAIN reads the small `outcome.md`. The boundary that
  `pi-driver` used to enforce by being a sub-agent is now enforced by the run_in_background
  output split + a paths-only `outcome.md`. (A one-shot distiller sub-agent remains available
  as belt-and-suspenders but is not needed for the firewall.)
- **Selection:** `--profile` resolves model / provider / tool-set / permissions from a small
  config before launching Pi, so each dispatch picks the right profile.

## The one significant change: collapse the pi-driver waiter (reversible)

This plan retires `pi-driver` as the *waiter/driver* of a shard. That was the OWD-1 door the
prior spiral gated behind F3 + human approval; choosing a non-blocking dispatch is what opens
it deliberately. It is **not** irreversible — it is a refactor revertable by git — but it is
the load-bearing structural change, so it is staged last and behind its own rollback.

## Component fate

| Component | Fate | Reversible | Cite |
|---|---|---|---|
| `pi-run-sync.sh` (new) | ADD — runs Pi to completion + self-distills to paths-only `outcome.md`; this is what MAIN backgrounds | two-way | new |
| `pi-driver.md` | RETIRE as waiter — dispatch moves to MAIN; an optional one-shot distiller agent may replace it later if extra isolation is wanted | two-way (last step) | `context-flow/agents/pi-driver.md:1-12` |
| `cf-pi-run.sh` | SHRINK — `dispatch_and_poll` sleep/translate loop removed; lifecycle (write_outcome, gate pipeline) folds into `pi-run-sync.sh` or MAIN orchestration | two-way | `context-flow/scripts/cf-pi-run.sh:220-311` |
| `cf-pi-poll.sh` | REMOVE — translation layer is dead once nothing polls legacy tokens | two-way | `context-flow/scripts/cf-pi-poll.sh:82-152` |
| `cf-pi-dispatch.sh` | KEEP + dedup resolver into `cf-pi-env.sh`; gains `--profile` pass-through | two-way | `context-flow/scripts/cf-pi-dispatch.sh:27-34` |
| `cf-pi-status.sh` | OUT-OF-SCOPE — re-derives tokens from disk independently | n/a | `context-flow/scripts/cf-pi-status.sh:82-120` |
| `pi-dispatch.sh` | KEEP frozen — setsid/pgid + `OUTPUT=/PID=/RUNDIR=` (OWD-2) untouched; still used by spiral | frozen | `pi-dispatch/scripts/pi-dispatch.sh:196-198` |
| `pi-build.sh` (spiral) | OUT-OF-SCOPE — short blocking run inside spiral BUILD; no fanout, finishes before ceiling | n/a | `spiral/scripts/pi-build.sh:44-48` |

## Migration sequence (cheapest-to-reverse first)

### Step 1 — resolver dedup (two-way)
Extract the duplicated sibling-resolver (`cf-pi-dispatch.sh:27-34`, `cf-pi-poll.sh:44-49`,
`cf-pi-stop.sh:22-26`) into a `resolve_canon_dispatch` helper in `cf-pi-env.sh` (already
sourced by all three). Each caller keeps its own distinct failure branch (`PI_RESOLVE_ONLY`
lives only in dispatch; poll echoes `NO_PID` fail-soft; stop falls through to a direct kill).
Pure refactor, no behavior change. **Rollback:** restore inline blocks.

### Step 2 — add `--profile` selection (two-way, additive)
Add `--profile NAME` to `pi-dispatch.sh` (and pass-through in `cf-pi-dispatch.sh`) that reads a
small `profiles` file (model / provider / tool-set / permissions). Default profile = today's
behavior, so existing callers are unaffected. **Rollback:** ignore the flag; default path is
unchanged.

### Step 3 — add `pi-run-sync.sh` + migrate cf to MAIN-driven background (two-way)
Add `pi-run-sync.sh`: run Pi to completion (stdout → `raw.jsonl`), apply the existing
`agent_end` success whitelist, distill to paths-only `outcome.md`, exit. Change the context-flow
implement flow so **MAIN** fires one `run_in_background` Bash per shard calling
`pi-run-sync.sh --profile X`, and reads each `outcome.md` on its completion ping (optionally
`Monitor` for progress). Set `BASH_MAX_TIMEOUT_MS` in settings as the safety ceiling.
**Rollback:** revert the flow to spawning `pi-driver`; `pi-run-sync.sh` is additive and can sit
unused.

### Step 4 — remove the dead poll path (two-way, cleanup)
Once Step 3 is proven, delete `cf-pi-poll.sh`'s translation table and the `dispatch_and_poll`
sleep loop in `cf-pi-run.sh`; retire `pi-driver.md` (or replace with a one-shot distiller if
extra isolation is wanted). Migrate the two affected tests: `poll-json.test.sh` (assert on
canonical `STATUS=` grammar) and `gate3-retest.test.sh:64` (stub emits `STATUS=OK`).
**Rollback:** git revert; no persistent state is touched.

## Out of scope
- **spiral `pi-build.sh`** — short blocking run, no fanout; leave on the frozen `pi-dispatch.sh`
  path. The same MAIN-driven pattern could apply later if spiral wants non-blocking BUILD.
- **MCP server** — defer until ≥3 profiles are in regular rotation or a non-shell consumer
  needs dispatch as a first-class tool. The `--profile` file is forward-compatible: an MCP
  server would expose one tool per profile entry.
- **MCP code-execution / sandbox** — not in the CLI; revisit only on an SDK-based host.

## Evidence (receipts)
- **bg firewall:** 801-line heavy stdout → output file; MAIN completion notification = metadata
  only (exit code + path), 0 heavy lines. Measured this session.
- **Bash ceiling configurable:** `BASH_MAX_TIMEOUT_MS` overrides the 600000ms ceiling, no
  documented upper bound — `https://code.claude.com/docs/en/tools-reference.md`.
- **MCP call timeout:** per-server `timeout` (default ~28h), hard wall-clock —
  `https://code.claude.com/docs/en/mcp.md`.
- **F3:** only MAIN is re-invoked on background completion; a sub-agent is not (a sub-agent can
  Monitor its own bg task within one invocation, but cannot be re-woken). See
  `project-pi-dispatch-f3-and-migration` memory.
- **code-execution-MCP:** token efficiency only, no monitoring; CLI-unsupported —
  `https://www.anthropic.com/engineering/code-execution-with-mcp`,
  `https://blog.cloudflare.com/code-mode-mcp/`, `https://code.claude.com/docs/en/sandboxing.md`.
