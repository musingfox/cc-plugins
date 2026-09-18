# omp-quota

Shows every omp provider's remaining quota inside a Claude Code session, as one Claude Mod
(a function-hooks module, `hooks/register.ts`).

- **Status line**: one line under the prompt with each provider's lowest remaining share.
- **`/quota`**: opens a pane listing every limit of every provider.
- **`/quota refresh`**: drops omp's cache and fetches fresh quota, without a model turn.
- **Toast**: one in-session toast when a provider's status worsens from `ok`.

Built and tested against Claude Code 2.1.276.

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
