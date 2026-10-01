# Operations module

Home: `docs/operations.md`. IaC is the source of truth; the doc holds what IaC cannot
explain and what a human must do by hand.

## What it holds

- Where each secret lives: the store and the key name, never the value.
- Steps only a human can do: dashboard settings, credential creation, DNS, billing.
- The order of a cutover and of its rollback.
- How to recover from the failures the team has already met.

Resources, environments and config values stay in the IaC. The doc names the IaC file or
directory instead of listing them. A hand procedure someone repeats becomes a
`/wizard:wizard` script, and the doc keeps a one-line pointer to it.

## Keeping it from drifting

Check every named secret key, IaC path and script against the repo.

## Question when only the signal fires

"Is there anything about deploying or running this that the IaC does not do, such as a
secret created by hand, a dashboard setting, or a cutover order?"
