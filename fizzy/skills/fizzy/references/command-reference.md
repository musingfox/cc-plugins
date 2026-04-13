# Fizzy Command Reference

## Identity

```bash
fizzy identity show                    # Show your identity and accessible accounts
```

## Account

```bash
fizzy account show                     # Show account settings (name, auto-postpone period)
fizzy account entropy --auto_postpone_period_in_days N  # Update account default auto-postpone period (admin only, N: 3, 7, 11, 30, 90, 365)
fizzy account settings-update --name "Name"            # Update account name
fizzy account export-create                            # Create data export
fizzy account export-show EXPORT_ID                    # Check export status
fizzy account join-code-show                           # Show join code
fizzy account join-code-reset                          # Reset join code
fizzy account join-code-update --usage-limit N         # Update join code limit
```

The `auto_postpone_period_in_days` is the account-level default. Each board can override this with `board entropy`.

## Search

Quick text search across cards. Multiple words are treated as separate terms (AND).

```bash
fizzy search QUERY [flags]
  --board ID                           # Filter by board
  --assignee ID                        # Filter by assignee user ID
  --tag ID                             # Filter by tag ID
  --indexed-by LANE                    # Filter: all, closed, not_now, golden
  --sort ORDER                         # Sort: newest, oldest, or latest (default)
  --page N                             # Page number
  --all                                # Fetch all pages
```

## Boards

```bash
fizzy board list [--page N] [--all]
fizzy board show BOARD_ID
fizzy board create --name "Name" [--all_access true/false] [--auto_postpone_period_in_days N]
fizzy board update BOARD_ID [--name "Name"] [--all_access true/false] [--auto_postpone_period_in_days N]
fizzy board publish BOARD_ID
fizzy board unpublish BOARD_ID
fizzy board delete BOARD_ID
fizzy board entropy BOARD_ID --auto_postpone_period_in_days N  # N: 3, 7, 11, 30, 90, 365
fizzy board closed --board ID [--page N] [--all]       # List closed cards
fizzy board postponed --board ID [--page N] [--all]    # List postponed cards
fizzy board stream --board ID [--page N] [--all]       # List stream cards
fizzy board involvement BOARD_ID --involvement LEVEL   # Update your involvement
```

`board show` includes `public_url` only when the board is published.

## Board Migration

Migrate boards between accounts (e.g., from personal to team account).

```bash
fizzy migrate board BOARD_ID --from SOURCE_SLUG --to TARGET_SLUG [flags]
  --include-images                       # Migrate card header images and inline attachments
  --include-comments                     # Migrate card comments
  --include-steps                        # Migrate card steps (to-do items)
  --dry-run                              # Preview migration without making changes
```

**What gets migrated:** Board, columns (order/colors), cards (titles, descriptions, timestamps, tags), card states.
**What cannot be migrated:** Card creators/numbers, comment authors, user assignments.
**Requirements:** API access to both source and target accounts. Verify with `fizzy identity show`.

## Cards

### Listing & Viewing

```bash
fizzy card list [flags]
  --board ID                           # Filter by board
  --column ID                          # Filter by column ID or pseudo: not-now, maybe, done
  --assignee ID                        # Filter by assignee user ID
  --tag ID                             # Filter by tag ID
  --indexed-by LANE                    # Filter: all, closed, not_now, stalled, postponing_soon, golden
  --search "terms"                     # Search by text
  --sort ORDER                         # Sort: newest, oldest, or latest (default)
  --creator ID                         # Filter by creator user ID
  --closer ID                          # Filter by user who closed the card
  --unassigned                         # Only show unassigned cards
  --created PERIOD                     # Filter by creation: today, yesterday, thisweek, lastweek, thismonth, lastmonth
  --closed PERIOD                      # Filter by closure: today, yesterday, thisweek, lastweek, thismonth, lastmonth
  --page N                             # Page number
  --all                                # Fetch all pages

fizzy card show CARD_NUMBER            # Show card details (includes steps)
```

### Creating & Updating

```bash
fizzy card create --board ID --title "Title" [flags]
  --description "HTML"                 # Card description (HTML)
  --description_file PATH              # Read description from file
  --image SIGNED_ID                    # Header image (use signed_id from upload)
  --tag-ids "id1,id2"                  # Comma-separated tag IDs
  --created-at TIMESTAMP               # Custom created_at

fizzy card update CARD_NUMBER [flags]
  --title "Title"
  --description "HTML"
  --description_file PATH
  --image SIGNED_ID
  --created-at TIMESTAMP

fizzy card delete CARD_NUMBER
```

### Status Changes

```bash
fizzy card close CARD_NUMBER           # Close card (sets closed: true)
fizzy card reopen CARD_NUMBER          # Reopen closed card
fizzy card postpone CARD_NUMBER        # Move to Not Now lane
fizzy card untriage CARD_NUMBER        # Remove from column, back to triage
```

**Note:** Card `status` field stays "published" for active cards. Use `closed: true/false` to check if closed.

### Actions

```bash
fizzy card column CARD_NUMBER --column ID     # Move to column (use column ID or: maybe, not-now, done)
fizzy card move CARD_NUMBER --to BOARD_ID     # Move card to a different board
fizzy card assign CARD_NUMBER --user ID       # Toggle user assignment
fizzy card self-assign CARD_NUMBER            # Toggle current user's assignment
fizzy card tag CARD_NUMBER --tag "name"       # Toggle tag (creates tag if needed)
fizzy card watch CARD_NUMBER                  # Subscribe to notifications
fizzy card unwatch CARD_NUMBER                # Unsubscribe
fizzy card pin CARD_NUMBER                    # Pin card for quick access
fizzy card unpin CARD_NUMBER                  # Unpin card
fizzy card golden CARD_NUMBER                 # Mark as golden/starred
fizzy card ungolden CARD_NUMBER               # Remove golden status
fizzy card image-remove CARD_NUMBER           # Remove header image
fizzy card publish CARD_NUMBER               # Publish a card
fizzy card mark-read CARD_NUMBER             # Mark card as read
fizzy card mark-unread CARD_NUMBER           # Mark card as unread
```

### Attachments

```bash
fizzy card attachments show CARD_NUMBER [--include-comments]           # List attachments
fizzy card attachments download CARD_NUMBER [INDEX] [--include-comments]  # Download (1-based index)
  -o, --output FILENAME                                    # Exact name (single) or prefix (multiple)
```

## Columns

Boards have pseudo columns by default: `not-now`, `maybe`, `done`

```bash
fizzy column list --board ID
fizzy column show COLUMN_ID --board ID
fizzy column create --board ID --name "Name" [--color HEX]
fizzy column update COLUMN_ID --board ID [--name "Name"] [--color HEX]
fizzy column delete COLUMN_ID --board ID
fizzy column move-left COLUMN_ID             # Move column one position left
fizzy column move-right COLUMN_ID            # Move column one position right
```

## Comments

```bash
fizzy comment list --card NUMBER [--page N] [--all]
fizzy comment show COMMENT_ID --card NUMBER
fizzy comment create --card NUMBER --body "HTML" [--body_file PATH] [--created-at TIMESTAMP]
fizzy comment update COMMENT_ID --card NUMBER [--body "HTML"] [--body_file PATH]
fizzy comment delete COMMENT_ID --card NUMBER
```

### Comment Attachments

```bash
fizzy comment attachments show --card NUMBER                  # List attachments in comments
fizzy comment attachments download --card NUMBER [INDEX]      # Download (1-based index)
  -o, --output FILENAME
```

## Steps (To-Do Items)

Steps are returned in `card show` response but can also be listed separately.

```bash
fizzy step list --card NUMBER
fizzy step show STEP_ID --card NUMBER
fizzy step create --card NUMBER --content "Text" [--completed]
fizzy step update STEP_ID --card NUMBER [--content "Text"] [--completed] [--not_completed]
fizzy step delete STEP_ID --card NUMBER
```

## Reactions

Reactions can be added to cards directly or to comments on cards.

```bash
# Card reactions
fizzy reaction list --card NUMBER
fizzy reaction create --card NUMBER --content "emoji"
fizzy reaction delete REACTION_ID --card NUMBER

# Comment reactions
fizzy reaction list --card NUMBER --comment COMMENT_ID
fizzy reaction create --card NUMBER --comment COMMENT_ID --content "emoji"
fizzy reaction delete REACTION_ID --card NUMBER --comment COMMENT_ID
```

| Flag | Required | Description |
|------|----------|-------------|
| `--card` | Yes | Card number (always required) |
| `--comment` | No | Comment ID (omit for card reactions) |
| `--content` | Yes (create) | Emoji or text, max 16 characters |

## Tags

Tags are created automatically when using `card tag`. List shows all existing tags.

```bash
fizzy tag list [--page N] [--all]
```

## Users

```bash
fizzy user list [--page N] [--all]
fizzy user show USER_ID
fizzy user update USER_ID --name "Name"       # Update user name (requires admin/owner)
fizzy user update USER_ID --avatar /path.jpg  # Update user avatar
fizzy user deactivate USER_ID                  # Deactivate user (requires admin/owner)
fizzy user role USER_ID --role ROLE            # Update user role (requires admin/owner)
fizzy user avatar-remove USER_ID               # Remove user avatar
fizzy user push-subscription-create --user ID --endpoint URL --p256dh-key KEY --auth-key KEY
fizzy user push-subscription-delete SUB_ID --user ID
```

## Pins

```bash
fizzy pin list                                 # List your pinned cards (up to 100)
```

## Notifications

```bash
fizzy notification list [--page N] [--all]
fizzy notification tray                    # Unread notifications (up to 100)
fizzy notification tray --include-read     # Include read notifications
fizzy notification read NOTIFICATION_ID
fizzy notification read-all
fizzy notification unread NOTIFICATION_ID
fizzy notification settings-show              # Show notification settings
fizzy notification settings-update --bundle-email-frequency FREQ  # Update settings
```

## Webhooks

Webhooks notify external services when events occur on a board. Requires account admin access.

```bash
fizzy webhook list --board ID [--page N] [--all]
fizzy webhook show WEBHOOK_ID --board ID
fizzy webhook create --board ID --name "Name" --url "https://..." [--actions card_published,card_closed,...]
fizzy webhook update WEBHOOK_ID --board ID [--name "Name"] [--actions card_closed,...]
fizzy webhook delete WEBHOOK_ID --board ID
fizzy webhook reactivate WEBHOOK_ID --board ID    # Reactivate a deactivated webhook
```

**Supported actions:** `card_assigned`, `card_closed`, `card_postponed`, `card_auto_postponed`, `card_board_changed`, `card_published`, `card_reopened`, `card_sent_back_to_triage`, `card_triaged`, `card_unassigned`, `comment_created`

**Note:** Webhook URL is immutable after creation. Use `--actions` with comma-separated values.

## File Uploads

```bash
fizzy upload file PATH
# Returns: { "signed_id": "...", "attachable_sgid": "..." }
```

| ID | Use For |
|---|---|
| `signed_id` | Card header/background images (`--image` flag) |
| `attachable_sgid` | Inline images in rich text (descriptions, comments) |

## Setup & Authentication

```bash
fizzy setup                              # Interactive wizard
fizzy auth login TOKEN                   # Save token for current profile
fizzy auth status                        # Check auth status
fizzy auth list                          # List all authenticated profiles
fizzy auth switch PROFILE                # Switch active profile
fizzy auth logout                        # Log out current profile
fizzy auth logout --all                  # Log out all profiles
```

### Signup (New User or Token Generation)

```bash
# Step 1: Request magic link
fizzy signup start --email user@example.com

# Step 2: User checks email for 6-digit code, then verify
fizzy signup verify --code ABC123 --pending-token eyJ...

# Step 3: Write session token to temp file (keep out of agent session)
echo "eyJ..." > /tmp/fizzy-session && chmod 600 /tmp/fizzy-session

# Step 4a: New user — complete signup
fizzy signup complete --name "Full Name" < /tmp/fizzy-session

# Step 4b: Existing user — generate token for an account
fizzy signup complete --account SLUG < /tmp/fizzy-session

# Step 5: Clean up
rm /tmp/fizzy-session
```

**Note:** The user must check their email for the 6-digit code between steps 1 and 2.

## Common Workflows

### Create Card with Steps

```bash
CARD=$(fizzy card create --board BOARD_ID --title "New Feature" \
  --description "<p>Feature description</p>" | jq -r '.data.number')
fizzy step create --card $CARD --content "Design the feature"
fizzy step create --card $CARD --content "Implement backend"
fizzy step create --card $CARD --content "Write tests"
```

### Link Code to Card

```bash
fizzy comment create --card 42 --body "<p>Commit $(git rev-parse --short HEAD): $(git log -1 --format=%s)</p>"
fizzy card close 42
```

### Create Card with Inline Image

```bash
SGID=$(fizzy upload file screenshot.png | jq -r '.data.attachable_sgid')
cat > desc.html << EOF
<p>See the screenshot below:</p>
<action-text-attachment sgid="$SGID"></action-text-attachment>
EOF
fizzy card create --board BOARD_ID --title "Bug Report" --description_file desc.html
```

### Search and Filter

```bash
fizzy search "bug" | jq '[.data[] | {number, title}]'
fizzy card list --created today --sort newest
fizzy card list --indexed-by closed --closed thisweek
fizzy card list --unassigned --board BOARD_ID
```
