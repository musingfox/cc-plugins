# Writing sub-contracts

You split, so you write the contracts your sub-nodes build against. A sub-contract is the interface a caller must know, with concrete test cases. It defines behaviour, not structure: file paths go in `touches_files` and `implementation_plan`, never in the Effect.

**Contents**

- [From your contract to sub-contracts](#from-your-contract-to-sub-contracts)
- [contracts.json](#contractsjson)
- [Field rules](#field-rules)
- [Test cases](#test-cases)
- [Atomicity](#atomicity)
- [Recurring failure classes](#recurring-failure-classes)
- [Decision tiering](#decision-tiering)
- [Load-bearing assumptions](#load-bearing-assumptions)
- [Before you dispatch](#before-you-dispatch)

## From your contract to sub-contracts

Work goal → decisions → contracts. Start from your own contract, name what has to happen, tier the design decisions it takes, then write the contracts that carry those decisions out. Every sub-contract traces back to a part of your contract.

Every constraint in your contract becomes a test case in some sub-contract. A constraint you cannot make testable is a problem with your own contract: report it up (`report.md`), kind decision, or carry it as a `fuzzy_criteria` entry when it genuinely resists a concrete case.

Operations with no meaningful input/output interface (a migration, a config edit, a file move) are not contracts. They are `implementation_plan` steps of the contract that needs them. Trivial operations (an import, an empty file) get no contract.

Write one `contracts.json` per sub-node, holding only the contracts that node builds. The gates read the whole file a node is handed: a file that also holds its siblings' contracts widens its allowed scope to their files. Keep it outside every tree a sub-node builds in (a `mktemp -d` directory), and never commit it.

## contracts.json

A single JSON document, `schema_version` 1:

```json
{
  "schema_version": 1,
  "contracts": [
    {
      "name": "<ContractName>",
      "summary": "<one-line Effect>",
      "input": "<the interface a caller passes>",
      "output": "<what it returns or writes>",
      "errors": "<error conditions and how each shows>",
      "observes": ["stdout", "stderr", "exit", "files"],
      "depends": ["<ContractName this one consumes>"],
      "touches_files": ["<path>", "<path>"],
      "test_files": ["<path>"],
      "implementation_plan": [
        {"title": "Step 2: Add the gate", "target": "scripts/gate.sh", "approach": "revert in place", "order": "after Step 1"}
      ],
      "test_cases": [
        {"id": "T1", "given": "<concrete input>", "expect": "stdout: <value>; stderr: empty; exit: 0; files: <paths written, or empty>"}
      ],
      "fuzzy_criteria": ["<non-deterministic clause, e.g. 'minimal memory footprint'>"]
    }
  ]
}
```

## Field rules

- **`name`**: a stable identifier. Review reports, repros and routing all anchor on it.
- **`summary`**: the **Effect**, in one plain sentence: what a caller or the system can now do, or what behaves differently. No file paths, no type names. This is the line the reviewer and your author read first.
- **`input`**, **`output`**, **`errors`**: the interface, exactly. Optional: omit the key when a contract has none; never `null` or `""`.
- **`observes`** (required): a non-empty array drawn from `stdout`, `stderr`, `exit`, `files`, naming every channel a caller or test can see this contract's behaviour on. Never omit it, never `[]`: a channel left out is a channel no test asserts.
- **`depends`** (load-bearing): names of contracts in **this** file whose interfaces this one consumes. Default `[]`. Pre-existing code is not listed. A missing real dependency costs a guaranteed failed round, because the order of work comes from it.
- **`touches_files`** (load-bearing): a **superset** of every file the contract creates or modifies, repo-relative. Test files count. Doc files count when the contract changes docs. Underset is a bug: `<plugin root>/scripts/scope-gate.sh` fails any changed file outside the union, and `<plugin root>/scripts/revert-gate.sh` reads the set to know what to put back. The most common underset is a forgotten test or doc file: an endpoint contract touches its handler, the router that registers it, its test, and the API doc.
- **`test_files`**: exactly the entries of `touches_files` that are this contract's tests, wherever they live. The revert gate puts every other touched file back to the base and expects these tests to go red. `[]` when the contract adds no test file.
- **`implementation_plan`**: guidance, `{"title","target","approach","order"}` per step. A step that serves two contracts appears in both. The builder may deviate in files and internal structure; the contract binds, the plan does not. Optional.
- **`test_cases`**: see below.
- **`fuzzy_criteria`**: default `[]`. Only for constraints that genuinely resist a concrete case ("idiomatic to the codebase"), never a place for a case you did not bother to make concrete. Each entry is **binding**: the reviewer renders an evidence-backed PASS/FAIL for it, and a FAIL fails the contract.

Parallel sub-nodes get disjoint `touches_files`. Two nodes that must touch one file are one node, or run in sequence through `depends`.

## Test cases

At least one per contract, with a concrete `given` and a concrete `expect`. Each `expect` names every channel in the contract's `observes` as `<channel>: <value>`, for example `stdout: ok; stderr: empty; exit: 0`. `empty` is a valid value. Silence is not: a channel left unstated is a channel no test asserts.

A contract is **user-facing** when a person perceives its output: a UI render, an HTTP response a frontend consumes, CLI output a person reads, a file an end user opens. A user-facing contract gets one test case per non-trivial state it has: loading, empty, error (validation and system apart when both apply), success, and partial or stale where data can be.

A test case that leans on existing behaviour (what a loader requires, what a route returns) rests on a `file:line` you read this session, or on an assumption you name (see Load-bearing assumptions).

Each contract's tests pass with only its own `touches_files` and those of the contracts in its `depends` in place. A test that needs a file another contract creates names that contract in `depends`, or the file moves into this contract.

## Atomicity

Every contract describes **one** observable behaviour. Split it when you see any of these:

- The Effect holds ` and `, `;`, or more than one imperative verb.
- Its test cases exercise different input→output mappings, not different values of one mapping.
- It has distinct error classes with different recovery paths.
- Input and output cross subsystems (reads a database, writes over the network), so it can fail in two unrelated ways.

When in doubt, split the contract. Many small contracts build and review more easily than a few compound ones. A contract count that feels too large for the goal is a scope signal about your own contract: report it up, rather than collapsing contracts to hide it.

Atomic contracts are not separate nodes. One node usually builds several; `split.md` decides the nodes.

## Recurring failure classes

Four classes of defect keep reaching review. Review caught each one, and the token-leak bypass took four rounds, because no finding became an assertion. When a contract touches one, write the test case that makes it fail, now:

- **Secrets and credentials**: a credential parsed, logged, forwarded, or embedded in an artifact. Assert the bypass path: the request that carries no token, the log line that must not contain it.
- **Mutable release identifiers**: a tag, digest or version an artifact is published under. Assert that one identifier cannot name two different artifacts.
- **Guard tests that cannot fail**: a test written to prove a guard works. Assert it red first: a guard test that passes against a deliberately broken guard reads as coverage and is worse than none.
- **Configuration and credential resolution**: which config file, env var or credential binds at run time. Assert the resolved value, not that the resolver was called.

A class no contract touches needs no case. A checklist line for the builder does not count; a test case runs every round.

## Decision tiering

Tier every design decision your split takes. Decide by cost to reverse.

| Impact | Criteria | Who decides |
|---|---|---|
| **High** | Strategic direction or irreversible technical (below), or information only the human holds | One layer up: report it (`report.md`, kind decision) |
| **Medium** | Significant but reversible: bounded refactor cost, no data loss, no external commitment | You, with the reason logged under "decisions taken" in your report |
| **Low** | Trivial: single-file scope, naming, internal organization | You |

**Strategic direction**, at least one of:

- Changes what success means for the goal (scope grows or shrinks).
- Affects two or more features beyond the one being built.
- Commits to a product direction nobody above endorsed: a new user-visible behaviour pattern, pricing dimension or permission model.
- Introduces a new third-party vendor, service or paid dependency.

**Irreversible technical**, at least one of:

- A schema migration that cannot roll back without data loss.
- A breaking change to a public API, SDK or CLI surface.
- A change to the authentication or authorization mechanism.
- Removing or replacing existing functionality, rather than adding beside it.
- Storing user data in a new location or format.
- Vendor or framework lock-in, with switching cost above one person-week.

**Not High**, however important it feels: two libraries with comparable trade-offs (Medium), a module seam or abstraction level (Low), a performance change with clear win criteria (Medium), a new internal endpoint with no public surface (Medium), test framework, lint or build tooling for new code (Low).

A wrong Medium costs a refactor. A wrong High costs a migration, customer comms or a strategic do-over. That asymmetry is the gate. A guess is not a decision: one you cannot make from what you know goes through `route.md`'s information round, or up.

## Load-bearing assumptions

An assumption is **load-bearing** when its being false would change two or more sub-contracts. List each in the ticket of every sub-node it carries, with the contracts it carries and a **receipt**: a `file:line` you read, a command and the output you observed, or a prototype result. A receipt you did not earn this session is the word `unproven`.

Dispatch nothing while an assumption is `unproven`. Prove it first: read the file, run the command, or send one information-gathering session (`route.md`). When it stays unproven, report up, kind missing information.

## Before you dispatch

Every item holds, or you fix the contracts first:

- Every sub-contract traces to your contract, and every constraint in your contract is a test case or a fuzzy criterion somewhere.
- Every contract has an Effect `summary`, `observes`, `depends`, `touches_files` (superset, tests and docs included), `test_files`, and at least one concrete test case naming every observed channel.
- Every contract is atomic.
- Every recurring failure class a contract touches has its failing case.
- Every High decision is reported up, every Medium one logged with its reason.
- Every load-bearing assumption has a receipt.
- `bash <plugin root>/scripts/check-contracts.sh <contracts.json>` passes (the plugin root SKILL.md names) on every file you wrote.

Done: each sub-node's `contracts.json` is written, checked and outside the tree it builds in.
