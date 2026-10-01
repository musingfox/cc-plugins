# UI design module

Home: `docs/design.md`. It covers UI and visual design only; software design decisions
go to `/adr:adr`.

## What it holds

- The design principles, and why.
- Rules for using components and tokens: when to use which, and what never to combine.
- What the design system leaves out on purpose.

Token values, palettes and component props live in the token files and the component
library. The doc names the source ("every color in `tokens.css`") instead of copying the
values. A rule a linter or visual test enforces gets one line that names the check.

## Keeping it from drifting

Check every token, component and file the doc names against the code.

## Question when only the signal fires

"Is there a design rule the tokens and components do not express, such as when to use
which, or what must never appear?"
