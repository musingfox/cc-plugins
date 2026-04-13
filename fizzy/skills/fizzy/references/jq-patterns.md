# Fizzy jq Patterns

## Reducing Output

```bash
# Card summary (most useful)
fizzy card list | jq '[.data[] | {number, title, status, board: .board.name}]'

# First N items
fizzy card list | jq '.data[:5]'

# Just IDs
fizzy board list | jq '[.data[].id]'

# Specific fields from single item
fizzy card show 579 | jq '.data | {number, title, status, golden}'

# Card with description length
fizzy card show 579 | jq '.data | {number, title, desc_length: (.description | length)}'
```

## Filtering

```bash
# Cards with a specific status
fizzy card list --all | jq '[.data[] | select(.status == "published")]'

# Golden cards only
fizzy card list --indexed-by golden | jq '[.data[] | {number, title}]'

# Cards with non-empty descriptions
fizzy card list | jq '[.data[] | select(.description | length > 0) | {number, title}]'

# Cards with steps (must use card show, steps not in list)
fizzy card show 579 | jq '.data.steps'
```

## Extracting Nested Data

```bash
# Comment text only (body.plain_text for comments)
fizzy comment list --card 579 | jq '[.data[].body.plain_text]'

# Card description (just .description for cards - it's a string)
fizzy card show 579 | jq '.data.description'

# Step completion status
fizzy card show 579 | jq '[.data.steps[] | {content, completed}]'
```

## Activity Analysis

```bash
# Cards with steps count (requires card show for each)
fizzy card show 579 | jq '.data | {number, title, steps_count: (.steps | length)}'

# Comments count for a card
fizzy comment list --card 579 | jq '.data | length'
```
