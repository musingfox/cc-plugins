# Fizzy

Interact with [Fizzy](https://fizzy.do) via the Fizzy CLI. Manage boards, cards, columns, comments, steps, reactions, tags, users, notifications, pins, webhooks, and account settings.

## Features

- Full CLI coverage: boards, cards, columns, comments, steps, reactions, tags, users, notifications, pins, webhooks, account settings, search, and board migration
- Decision trees for finding and modifying content
- Common jq patterns for reducing output
- Resource schemas with complete field reference
- Common workflows (create card with steps, link code to card, inline images, etc.)

## Prerequisites

- [Fizzy CLI](https://github.com/basecamp/fizzy-cli) installed and authenticated

```bash
fizzy setup          # Interactive setup wizard
fizzy auth status    # Verify authentication
```

## Usage

Natural language triggers:

```
"create a card on fizzy"
"search fizzy for login bugs"
"my cards"
"close card 42"
"show fizzy board"
```

Or invoke directly:

```
/fizzy list boards
/fizzy create card --board ID --title "New Feature"
```

## Installation

```bash
/plugin install fizzy
```
