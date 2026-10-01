# UI design module

Home: `DESIGN.md` at the root, the format
[Google Stitch introduced](https://designmd.app/what-is-design-md) for coding agents:
design tokens in YAML frontmatter, design rules in prose. It covers UI and visual design
only; software design decisions go to `/adr:adr`.

## What it holds

- The design principles, and why.
- Rules for using components and tokens: when to use which, and what never to combine.
- What the design system leaves out on purpose.

Token values have one home. When `DESIGN.md` is the source, its frontmatter holds the
values and the code's tokens are generated from it. Otherwise the token files hold them,
and `DESIGN.md` names the source ("every color in `tokens.css`") instead of copying the
values. Component props stay in the component library. A rule a linter or visual test enforces gets one line that names the check.

## Keeping it from drifting

Check every token, component and file the doc names against the code.

## Question when only the signal fires

"Is there a design rule the tokens and components do not express, such as when to use
which, or what must never appear?"
