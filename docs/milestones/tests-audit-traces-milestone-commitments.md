---
status: accepted    # accepted | done | superseded
delivered:          # commit or tag ref — filled when acceptance passes
depends: []         # milestone slugs that must land first
---

# A tests audit that traces milestone commitments to tests

On 2026-09-10 fifteen cf contracts passed while four phases of the diagnose work were lost. No contract covered the clause "keep the upstream middle", so the missing phases had no test to fail. A green suite only proves what it asserts. This milestone settles what a tests audit checks, so that this kind of gap gets found before the work ships.

## What is committed

- **The audit works at the requirement level only.** It follows the V-model split, where each stage verifies its own level. For each requirement a repo has written down, the audit asks whether a test is meant to guard it. Whether that test actually goes red when the code breaks is a development-stage check. It stays with cf: the revert gate flags tests that stay green after a shard's code is reverted (`context-flow/scripts/cf-pi-revert-gate.sh:2-5`), and review runs the contract's test cases. The audit never reverts code, injects violations, or runs the suite to prove that a test goes red.
- **The requirements it traces are milestone commitments.** A repo's `docs/milestones/` files, which spiral writes (`spiral/commands/spiral.md:353-375`), are the requirement list, because a milestone is what the requirement stage produces. For each commitment in a milestone that is still standing, the audit looks for a test that guards it.

## Concrete enough to build on

- **Input.** The audit reads every milestone under `docs/milestones/` whose `status` is not `superseded`. The milestone frontmatter fields are fixed at `spiral/commands/spiral.md:356-362`.
- **It reads the text of each commitment, not a heading.** On 2026-10-06, only 3 of this repo's 6 milestones had an `## Acceptance criteria` heading, and one of those 3 was superseded. The other repos that have milestones (cyris, investment-base, tw-politic-war, cc-mobile, cc-mobile-launch-proto) had none. The motivating requirement sits in body text (`docs/milestones/diagnose-plugin-and-prototype-role.md:22`).
- **Milestones reached the motivating case.** That requirement was written down before the work: `:22` comes from 2223751 (2026-09-09), and the diagnose work is a330148 (2026-09-10). The motivating requirement is guarded now (`diagnose/tests/method-loops.test.sh:74-77`). A run on today's tree therefore will not reproduce the incident, and checking the audit needs a constructed case.
- **Out of scope.** The audit does not trace spec entries, doc rules, or README claims. `spec.sh verify` already prints `DEBT -- prose only` for every spec entry that has no check (`spec/scripts/spec.sh:30-48`). The docs-classifier already labels each doc rule as test-backed, partly backed, or prose only (`audit/agents/docs-classifier.md:32-33`).
- **Reach.** A repo with no milestones gets nothing from this audit. That repo never went through the requirement stage this audit verifies.

## Left open

- **How a commitment links to a test.** The options are: the milestone cites the test, the test cites the milestone, or the audit judges the match by reading. A cited anchor turns coverage into a grep. A requirement that is only restated turns it into judgment. Milestone frontmatter has no field that points to a test today. This choice changes how every repo writes milestones, so it gets decided on its own.
- **Home and timing.** The candidates are:
  - a new `/audit:tests` skill in `audit`, which the repo already announces in README.md, Audit section, and in `audit/.claude-plugin/plugin.json:3`;
  - folding the trace into audit:docs;
  - a check at the moment spiral hands a milestone to cf.

  A goal spiral hands to cf is the milestone itself (`context-flow/commands/cf.md:2`), so a hand-off check reads the same input at a different time. A separate plugin is no longer a candidate: the only direction that pulled toward it, mutating code to test the tests, was rejected.
- **Grain of a commitment.** The audit reads either whole paragraphs or individual clauses. The lost clause was written nowhere, and only its parent clause was. A clause-level read gets closest to that case. No read recovers a requirement nobody wrote down.
- **Output form.** A proposal table like audit:docs, or a list of unguarded commitments to hand to cf. This depends on the home.

## What would overturn this

- **A requirement-level trace passes and a requirement is still lost.** Suppose every commitment has a named test and the audit reports green. If a requirement is still lost because its named test asserts only what was built, the requirement-level check is not enough. Some check that the test goes red would then have to move into this audit, against the V-model split.
- **Milestones hold too little to trace.** If most standing milestones state commitments too loosely to name a test for, the audit has no input. The gap is then in how spiral writes milestones, and it needs fixing there first.
- **The losses that matter are not in milestones.** If the next lost requirement lived only in a cf goal, a spec entry, or a README promise, milestones are the wrong source.

Directions that lost:
- **Test to code (mutate or revert the code, and see whether tests go red).** It checks code, which is the development stage's job, and cf's revert gate already does it per contract. It also cannot see a requirement that has no test.
- **Tests read as docs (judge whether each assertion pins layout or checks a property).** It catches the opposite failure, tests that go red when nothing is wrong. It also conflicts with audit:docs step 4, which keeps doc-reading tests as anchors (`audit/skills/docs/SKILL.md:88-95`).
- **Rules that already name a test (spec `verify:` and the doc rules the classifier pairs).** Finding those gaps is already done by spec and the docs-classifier. Nothing in `audit/` reads milestones, so this direction may not reach the motivating case.
- **README promises to users.** audit:docs treats a README sentence about what the code does as a cache to be replaced by a pointer (`audit/skills/docs/SKILL.md:22-25`). Treating that same sentence as a requirement would make the two skills disagree.

## Suggested skills

- `cf` — to run research, plan and the gate on this goal, starting with the open link and home questions.
- `marketplace` — if the result adds a skill to `audit` or changes its README row, plugin.json or tests (`audit/tests/readme.test.sh:9`, `audit/tests/manifest.test.sh:16`).
- `spec:spec` — if the link from a commitment to a test becomes a rule every milestone must follow.
