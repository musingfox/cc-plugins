# Drive Operations via gog CLI

Alias: `gog drive` / `gog drv`. **Operations use file IDs, not names** — resolve
first via `ls` or `search`.

## Verify auth

```bash
gog drive ls --max=1
```

If auth fails: `gog auth add <email> --services drive`.

## Listing Files

```bash
gog drive ls                                  # Root
gog drive ls --parent=<folderId>
gog drive ls --max=50
gog drive ls --query="mimeType='application/pdf'"
gog drive ls --no-all-drives                  # My Drive only
```

## Searching Files

```bash
gog drive search "quarterly report"
gog drive search "quarterly report" --max=20
```

Advanced (Drive query language):

```bash
gog drive search --raw-query "mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime > '2026-01-01'"
```

Common raw query patterns:
- `mimeType='application/vnd.google-apps.document'` — Docs
- `mimeType='application/vnd.google-apps.spreadsheet'` — Sheets
- `mimeType='application/vnd.google-apps.presentation'` — Slides
- `mimeType='application/vnd.google-apps.folder'` — Folders
- `modifiedTime > '2026-01-01'`
- `'<folderId>' in parents`
- `trashed = true`

## File Metadata

```bash
gog drive get <fileId>
```

## Downloading

```bash
gog drive download <fileId>
gog drive download <fileId> --out=/tmp/file.pdf
```

Export formats for Google native files:

```bash
gog drive download <fileId> --format=pdf      # Doc → PDF
gog drive download <fileId> --format=docx     # Doc → Word
gog drive download <fileId> --format=csv      # Sheet → CSV
gog drive download <fileId> --format=xlsx     # Sheet → Excel
gog drive download <fileId> --format=pptx     # Slides → PowerPoint
gog drive download <fileId> --format=txt      # Plain text
```

## Uploading

Preview with `--dry-run`:

```bash
gog drive upload /path/to/file.pdf --dry-run
gog drive upload /path/to/file.pdf --parent=<folderId> --dry-run
```

Key flags:
- `--name="custom name"`
- `--parent=<folderId>`
- `--replace=<fileId>` — overwrite content (preserves link/permissions)
- `--convert` — auto-convert to native Google format
- `--convert-to=doc|sheet|slides`
- `--mime-type=<type>`

## Copying

```bash
gog drive copy <fileId> "Copy of Document"
gog drive copy <fileId> "Copy of Document" --parent=<folderId>
```

## Folders

```bash
gog drive mkdir "New Folder"
gog drive mkdir "Subfolder" --parent=<folderId>
```

## Move / Rename

```bash
gog drive move <fileId> --to=<folderId> --dry-run
gog drive rename <fileId> "New Name"
```

## Deleting

```bash
gog drive delete <fileId> --dry-run                # Trash (recoverable)
gog drive delete <fileId> --permanent --dry-run    # Irreversible
```

## Sharing & Permissions

```bash
# Specific user
gog drive share <fileId> --to=user --email=alice@example.com --role=writer --dry-run
# Anyone with link
gog drive share <fileId> --to=anyone --role=reader --dry-run
# Domain
gog drive share <fileId> --to=domain --domain=example.com --role=reader --dry-run

gog drive permissions <fileId>
gog drive unshare <fileId> <permissionId>
```

Roles: `reader`, `writer`.

## Utilities

```bash
gog drive url <fileId>
gog drive drives                              # List shared (Team) drives
gog drive comments list <fileId>
gog drive comments create <fileId> --content="Comment text"
```

## Workflows

**Find and Download**:
1. `gog drive search "budget 2026" --json --max=10`
2. Extract file ID
3. `gog drive download <fileId> --out=/tmp/budget.xlsx --format=xlsx`

**Upload and Share**:
1. `gog drive upload /path/to/report.pdf --parent=<folderId> --dry-run`
2. After confirm, execute
3. Get file ID from output
4. `gog drive share <fileId> --to=user --email=boss@example.com --role=reader --dry-run`
5. After confirm, execute

**Organize**:
1. `gog drive mkdir "Q1 Reports" --parent=<parentFolderId>`
2. Get new folder ID
3. `gog drive move <fileId> --to=<newFolderId> --dry-run`
