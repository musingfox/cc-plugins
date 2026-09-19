---
status: accepted    # accepted | done | superseded
delivered:          # commit or tag ref — filled when acceptance passes
depends: []         # milestone slugs that must land first
---

# pi-dispatch and its consumers agree on what a worker may write and how a failure is routed

The source is the pi-dispatch backlog in the Obsidian vault `obsidian`, project `cc-plugins`, as inventoried on 2026-09-19. One card is open: `cf-pi-report-path-outside-sandbox`. `dispatch-framework-baseline-and-followups` and `pi-parallel-shard-fleet` stay open but are not part of this milestone. Two read-only audits of the code at `4b6f99d` back the inventory. Both test suites are green: 10 pi-dispatch files, including `bun test pi-dispatch/extensions/`, and 25 context-flow files. Every defect below sits on a path those suites do not exercise.

One sentence ties the milestone together. Since the 2026-09-11 fence work, pi-dispatch enforces a boundary that its consumers do not know about, and it emits a failure vocabulary that its consumers read only partly. Each item below is one place where the two sides disagree.

## Where things stand

- **The fence blocks the files cf asks for.** cf tells the worker to write `REPORT_FILE` and `ESCALATE_FILE` under `/tmp/cf-*/shards/<id>/`, beside the worktree rather than inside it (`context-flow/scripts/cf-pi-env.sh:56-57`, `cf-pi-brief.sh:157-158`). The same brief also says "All file writes MUST stay inside WORK_DIR" (`cf-pi-brief.sh:169`). Two layers deny the write independently of each other: the sandbox profile (`pi-dispatch/scripts/pi-dispatch.sh:168-179`, `:224-237`) and the write/edit fence (`pi-dispatch/extensions/worktree-fence.ts:35-47`). The 2026-09-18 incident was the sandbox: `run-20260918-190430-10663/pi.stream.jsonl` shows "Operation not permitted". As a result, every pi shard ends `FAIL report-malformed`. The automatic report re-brief rebuilds the same fence on resume, so it fails the same way. `escalate.md` is also unreachable, so a stuck worker can never reach `NEEDS_REPLAN escalate` (`cf-pi-run.sh:456-464`, `:504-509`).
- **No file-based verdict exists anywhere in the code.** The accepted spec `dispatch-verdict-from-file` says a verdict comes from one agreed file. Only `pi-dispatch/skills/pi-dispatch/SKILL.md:21-43` describes that file. `pi-dispatch/agents/builder.md:39-41` instead tells the worker to "produce the deliverable as your final answer text". No script reads a verdict file. `pi-poll.sh:236-288` treats a run as finished when the stream's final `stopReason` is `stop` and the final text is non-empty. That shows the process ended; it does not show the task was done.
- **cf does not handle quota, although cf.md says it does.** `context-flow/commands/cf.md:335` says `cf-pi-run.sh` classifies `QUOTA` and `QUOTA-WINDOW` and aborts the batch. No cf-pi script checks for either tag. A quota line falls through to `STATUS=FAIL*` and becomes reason `error` (`cf-pi-run.sh:404-431`), and the retry budget then re-launches the shard once, paying for the same wall a second time. The only batch abort lives in `pi-agent.sh:150-181`, and cf never calls that script. `cf.md:58` still names a "pre-dispatch quota gate", which was removed in `698ae9b`. The `quota-saturated` trigger for the §3.6 fallback can never fire.
- **pi-poll classifies quota on only one of its failure branches.** `quota_class` is applied when the worker is still running (`pi-poll.sh:333-339`) and when the stream ends in an error (`:264-267`). It is not applied on the `exit rc=`, `died-mid-stream` or `no-rc` branches (`:297-315`).
- **cf loses the cause when dispatch refuses.** When `pi-dispatch.sh` refuses (exit 2, `:144-151` and `:203-206`), `set -e` kills `cf-pi-run.sh`, and the refusal shows up as `FAIL outcome-missing` (`cf-pi-run.sh:262-268`).
- **The docs name the wrong routing file.** pi 0.85.1 reads `<PI_CODING_AGENT_DIR>/settings.json` (`getSettingsPath()` in its bundle), and no `.yml` path appears anywhere in the bundle. `SKILL.md:150-152`, `README.md:54` and `pi-dispatch.sh:33` all say `config.yml`. The 2026-09-15 fix for `pi-provider-without-model` moved these docs in the wrong direction. On this machine `~/.pi/dispatch` holds `config.yml` and `settings.json.bak` but no `settings.json`. This matches omp's migration, which writes `config.yml` and then archives the JSON as `settings.json.bak` (per the omp CHANGELOG). omp picks up `PI_CODING_AGENT_DIR` from the settings env. Which omp run did the migration is unverified. The gap is hidden only because `PI_PROVIDER`/`PI_MODEL` are pinned in `~/.claude/settings.json`. Without those pins, default routing would silently fall to pi's built-in choice.
- **The builder and reviewer seats contradict the doctrine.** `builder.md` grants only `Bash, Read, SendMessage`, yet its self-do mode is supposed to edit files. Its "am I done" check (`:66-68`) uses the machine-wide `ls`, so a running worker from another dispatch keeps it looping. `reviewer.md` pins `model: sonnet`, which can be weaker than the builder and breaks the doctrine's rule that the reviewer is at least as capable as the builder.
- **Stale prose.** `docs/dispatch-doctrine.md` still describes the haiku liaison (`:10-14`), `modelRoles` (`:73-75`), config overlays (`:116-121`) and foreman-era footnotes (`:129-137`). Other stale lines:
  - `README.md`: the architecture diagram at `:8-11`; the phrase "with it set" at `:56`, although `PI_CWD` is now mandatory; a test list at `:78` that omits `run-test.sh`.
  - `SKILL.md:102`: says every terminal line carries `model=… cost=…`, which four line types do not.
  - `pi-run.sh:4`: still names the foreman.
  - `worktree-fence.ts:3`: says the extension loads only when `PI_CWD` is set, but it now always loads.
  - The docs also disagree on whether to use Monitor or `Bash(run_in_background)`.
  - Seven env vars are read but documented only in script headers: `PI_PROMPT`, `PI_RESOLVE_ROUTING_ONLY`, `PI_WALL_CLOCK_S`, `PI_STALL_THRESHOLD_S`, `PI_NO_MARKER_GRACE_S`, `PI_RUN_DEADLINE_S` and `PI_POLL_INTERVAL_S`.

## What is committed

The human ruled on three decisions on 2026-09-19:

1. **The writable set is declared by the caller.** pi-dispatch takes an explicit list of extra files a worker may write outside `PI_CWD`. That one list feeds both the sandbox profile and the write/edit fence, is recorded in `RUNDIR/routing` and is replayed on resume. cf declares its report and escalate files. The builder declares its verdict file. The rejected alternative put the report inside the worktree, untracked. It touches four places that sweep the worktree (`git add -A`, the scope gate `cf-pi-scope.sh:49-55`, `implement.diff` at `cf-pi-run.sh:660-661`, and cleanup at `pi-worktree.sh:211`), and ignoring the file means writing to the human's shared `.git/info/exclude`.
2. **cf stops the batch on quota.** This makes `cf.md:335` true instead of deleting it, and it matches the 2026-09-16 ruling: when a batch hits the quota wall, it stops, and the human changes the routing and re-runs.
3. **The code is brought in line with `dispatch-verdict-from-file`.** The spec stays as it is. The builder route moves to a verdict file.

## Concrete enough to build on

Slices, in order. Each one can be verified on its own.

1. **Writable-file knob (pi-dispatch).** `pi-dispatch.sh` accepts the list, adds each file to the profile as a single-file entry beside the existing `subpath` entries, exports it to `worktree-fence.ts` for an exact-path allow, writes it to `routing`, replays it on resume the way `CWD=` is replayed (record beats env), and echoes it on the launch line. Validation happens before `RUNDIR` exists: a relative path, a missing parent directory, or a path containing `"` exits 2. The `"` check matters because the profile interpolates paths raw at `:233`.
2. **cf declares its files.** `cf-pi-dispatch.sh` passes `REPORT_FILE` and `ESCALATE_FILE`. `cf-pi-brief.sh:169` names those two files as the only exceptions to "writes stay inside WORK_DIR". The Claude fallback (`cf.md:507`) runs outside the fence and keeps the same paths, so it needs no change.
3. **Quota on every pi-poll failure branch.** The `exit rc=`, `died-mid-stream` and `no-rc` branches apply `quota_class` the same way the other two branches do.
4. **cf routes quota and refusals.** `cf-pi-run.sh` matches `QUOTA` before every other failure pattern and never re-dispatches that shard. It records the wall at the parent session level. On every poll round, each sibling `cf-pi-run.sh` checks that record and stops its own worker as a sibling abort that carries the same tag. `QUOTA` or `QUOTA-WINDOW` becomes the §3.6 fallback trigger in place of `quota-saturated`, and `cf.md:58` drops the gate. A dispatch that exits 2 produces an outcome naming the refusal line, not `outcome-missing`.
5. **Builder verdict file.** The builder brief frame names a verdict file (created with `mktemp` before `start` and declared through slice 1) and asks for one `STATUS=DONE <check + exit code>` or `STATUS=BLOCKED <need>` line. The builder routes on that line and uses `result.md` only as the deliverable text. `builder.md` gains `Edit, Write` for self-do mode (`judge-seats-cannot-edit` binds only judgement seats), and its "am I done" check reads only the names it started, not the machine-wide `ls`.
6. **Prose follows the code.** Every item under "Stale prose" above is corrected, and `settings.json` replaces `config.yml` in the three places listed earlier. With no routing pinned, `pi-dispatch.sh` warns on stderr at launch if `$PI_CODING_AGENT_DIR/settings.json` is missing, naming the file. It warns rather than refuses, in line with the 2026-09-15 ruling against gating a manual routing choice. The seven undocumented env vars get a row each in the README.

Defaults taken on two-way doors:

- The knob is an env var, `PI_WRITABLE_FILES`, holding colon-separated absolute file paths, which matches how `PI_CWD` and `PATH` are passed. The unit is a file, not a directory, so a declared report never opens the whole session directory. If the real run shows that pi's write tool writes through a sibling temp file, the unit widens to the file's parent directory. That is the only allowed widening.
- `reviewer.md` drops its `sonnet` pin and inherits the caller's model, so the doctrine's reviewer ≥ builder rule holds without a table.
- `dispatch-doctrine.md` only has its stale statements deleted or corrected. The seat-agnostic rewrite remains step 4 of `dispatch-framework-baseline-and-followups` and waits for its baseline data.

## Outside the repo

Restoring `~/.pi/dispatch/settings.json` from `settings.json.bak` is a machine action for the human. It is not part of any commit here. The restore does not last on its own. Any `omp` started from a Claude Code shell inherits `PI_CODING_AGENT_DIR=~/.pi/dispatch` from the settings env and can migrate the file again. The omp-quota mod is safe because it overrides the directory to `~/.omp/agent` (`omp-quota/hooks/register.ts:21-24`); an `omp` run from the shell is not. That is why slice 6 warns: at launch it checks `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/settings.json`.

## Seen, not in this milestone

- **Sandbox hardening.** `TMPDIR`, `HOME` and `PI_CODING_AGENT_DIR` widen the allow list without validation (`TMPDIR=/` opens everything). A linked worktree's whole common `.git`, hooks and config included, is writable from the shell. The fence exists to stop accidental mutation, not a hostile worker.
- **Two pi-agent.sh edge cases.** A new `watch` replays an older terminal `QUOTA` line and aborts fresh siblings (inferred, untested). Mixed routing inside one `watch` batch is also unhandled; this is the `ponytail` comment at `pi-agent.sh:164-165`, and it holds while no fallback chain exists.
- **Contract loose ends.** Other gaps between pi-dispatch and cf that are real but not on this milestone's spine:
  - `pi-probe.sh` resolves project settings from the caller's cwd, while a dispatch runs in `PI_CWD`.
  - The probe exits 1 on a refusal while dispatch exits 2.
  - `index.log` rows have 4 columns from pi-poll but 6 from cf.
  - `cf-pi-status.sh` judges a stall from the session jsonl, while pi-poll judges it from `result.md`.
  - cf drops the `ROUTING=` line.
  - Case protection covers only uppercase tokens. `fail_cause` lowercases the cause text so it can never match an uppercase consumer pattern (`pi-poll.sh:126-137`). cf also matches lowercase tokens: `died-mid-stream`, `no-rc` and `not-stop` (`cf-pi-run.sh:404-431`). A provider error that contains one of those words would be misclassified.
- **Stale leftovers.** The OMP wording in cf scripts and `pi-implementer-protocol.md`. The dead `pi.pid` fallback in `cf-pi-stop.sh:33-39`. The `pi-build.sh` comment at `cf-pi-env.sh:113`. The `spiral/scripts/**` scope in `cross-plugin-runtime-resolution`. The merged branch `fix/dispatch-worker-cwd` (local and remote).
- **Other cards.** The parallel shard fleet (`pi-parallel-shard-fleet`; both of its stated blockers are resolved, and it is still a proposal). The fallback chain (cancelled 2026-09-16). The Linux sandbox and the ACP recall (both conditional). The dispatch baseline and the doctrine rewrite (`dispatch-framework-baseline-and-followups`).

## Acceptance criteria

- pi-dispatch test: a declared file outside `PI_CWD` is writable both by a shell write under the real sandbox and by the fence's write check. An undeclared sibling in the same directory is denied by both. A resume with the env var unset still honours the recorded list. A relative path, a missing parent, and a path containing `"` each exit 2 with no `RUNDIR`.
- context-flow test: the real `cf-pi-dispatch.sh` and `pi-dispatch.sh` run with a stand-in pi, using the `/tmp/cf-*` layout rather than a `TMPDIR` path (which the sandbox allows wholesale). The report and escalate writes land, and a write to another file under the session is denied.
- pi-poll test: an errorMessage matching `QUOTA_EXHAUST_RE` or `QUOTA_WINDOW_RE` on the `exit rc=`, `died-mid-stream` and `no-rc` branches yields the matching tag.
- cf test: a `QUOTA` poll line produces a quota outcome, no re-dispatch, and a sibling shard stopped with the same tag. A dispatch exit 2 produces an outcome that names the refusal.
- `grep -rn 'config\.yml' pi-dispatch` returns nothing, and neither do `modelRoles`, `overlay`, `haiku` or `foreman` in `pi-dispatch/docs`, `pi-dispatch/README.md`, `pi-dispatch/skills` or `pi-dispatch/scripts`.
- One real pi shard goes through `/cf` from dispatch to `PASS` with no manual step, and its `implement-report.md` is at `$SESSION/shards/<id>/`.
- One real builder offload writes its verdict file, and the builder's report quotes that line.
- All existing pi-dispatch and context-flow tests pass. The proposed specs `dispatch-write-targets-declared` and `quota-ends-the-batch` are accepted with their `verify` bound.

## What would overturn this

- **pi ships its own write-scope or sandbox option** that covers both shell writes and tool writes. The knob would then pass through to it instead of duplicating it in two layers.
- **A pre-dispatch headroom signal appears for the providers in use.** Stopping the batch reactively would then no longer be the only defence against paying for the same wall twice.
- **A fallback chain is reinstated.** Batches would then span providers, and every batch stop, in pi-agent.sh and in cf, would have to compare `RUNDIR/routing` before stopping a sibling.
