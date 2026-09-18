# omp-quota

Shows every omp provider's remaining quota inside a Claude Code session, as one Claude Mod
(a function-hooks module, `hooks/register.ts`).

- **Status line**: one line under the prompt with each provider's lowest remaining share.
- **`/quota`**: opens a pane listing every limit of every provider.
- **`/quota refresh`**: drops omp's cache and fetches fresh quota, without a model turn.
- **Toast**: one in-session toast when a provider's status worsens from `ok`.

Built and tested against Claude Code 2.1.276.

## How omp is run

Each fetch runs `omp usage --json` with `PI_CODING_AGENT_DIR` set to `$HOME/.omp/agent`
and a 10 s limit. The override matters: Claude Code may pass down a
`PI_CODING_AGENT_DIR` of its own (pi-dispatch sets one), and omp reading that home answers
with exit 0 and no providers. `omp` is found on Claude Code's `PATH` (it usually lives in
`~/.bun/bin`). With `HOME` unset, omp is not run and the status line reads
`omp quota: unavailable (HOME is unset)`.

Quota is fetched once at session start and then every 5 minutes. A failed fetch leaves the
poll running; there is no other retry. When a reload re-fires session start, the previous
poll is cancelled first, so the cadence never doubles.

Nothing waits on omp. Session start (which Claude Code awaits before the first prompt)
starts the fetch without awaiting it, and the module hooks no tool-call or prompt event,
so no tool call or prompt is ever held up by a slow omp.

## How quota is read

- **Remaining share** of a limit: omp's `remainingFraction` when it is a number, else
  `1 − usedFraction`, else none; clamped to 0–100%. A provider's share is the lowest of its
  limits' shares. Shown as a rounded percentage, or `—` when none is computable.
- **Status** of a provider: the worst status among its limits (`exhausted` > `warning` >
  `ok`); limits without one are ignored, and a provider with none has no status. Reports
  with the same provider name merge into one provider.
- **Worsened provider**: one whose status was `ok` in the previous good fetch and is
  `warning` or `exhausted` now. The first good fetch has no previous; `warning` →
  `exhausted`, a provider without a status on either side, and a newly appearing provider
  do not count.
- **Failed fetch**: omp did not answer (could not start, or still running after 10 s),
  exited non-zero, printed something that is not a JSON report list, or reported no
  providers — the last is how omp answers when it reads the wrong home, so it never wipes
  the display. omp's error output is never shown.

## The status line

Exactly one of:

- `omp quota: fetching` — no fetch has settled yet.
- `omp quota: openai-codex 6% · ollama-cloud — · …` — each provider's lowest remaining
  share, in omp's order, with omp's provider names.
- the same followed by ` (stale)` — the latest fetch failed; the figures are from the last
  good one. The next good fetch clears the mark.
- `omp quota: unavailable (<reason>)` — no fetch has succeeded yet.

A refused `/quota` registration does not affect it.

## The toast

When a good fetch finds providers that worsened since the previous good fetch (see
*Worsened provider* above), one in-session toast names them all:
`omp quota: openai-codex now warning, anthropic now exhausted`. Failed fetches in between
do not reset the comparison. There is no OS notification; a worsening that happens while
you are in another window shows on the status line when you return.

## Commands

- `/quota` opens the pane (`omp-quota`), focused and closed with Escape; it prints nothing
  in the transcript. Only this command opens the pane — a poll or a worsening never does.
  If the pane is refused, one line says so.
- `/quota <anything else>` answers `usage: /quota [refresh]` and runs nothing.

## The pane

A notice line while fetching (`Fetching omp usage`), when no fetch has succeeded
(`Unavailable: <reason>`), or when the latest fetch failed
(`Stale: <reason>; showing data from <age> ago`). Then one section per provider, headed
`<provider> <share>`, with one row per limit: name, share, status (`—` when omp gives
none), and time to reset (`Xd Yh`, `Xh Ym`, or `Ym`; `now` when due; `—` when omp gives
none). A provider without limits shows `no limits reported`.

A row's name is the limit label, plus `· <window>` when the window label differs. When
the same name repeats inside a provider, each row gets a tag in brackets: the parts of the
limit id that differ within the group (antigravity's shared pools read `[anthropic]` and
`[openai]`).

## Enabling

Claude Mods are off unless Claude Code starts with the global switch:

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude
```

The switch is not per plugin: it enables the modules of every installed plugin, not only
this one.

## Tests

```bash
CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude plugin test omp-quota
```

The test kit is hermetic: no filesystem, network, or process; every `$` call a test makes
is answered by a stub beneath the plugin.

`tests/fixtures/snapshot.ts` is a redacted copy of a live `omp usage --json` taken on
2026-09-18. To refresh it, capture a new snapshot, remove every `metadata` object, every
`scope.projectId` and `scope.accountId`, and `resetCredits`, then paste it in. The first
test in `tests/snapshot.test.ts` fails while any account key or any string holding `@`
remains.
