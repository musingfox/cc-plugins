---
name: gog Drive
description: >-
  This skill should be used when the user asks to "list files on Drive", "search Drive",
  "upload file to Drive", "download from Drive", "export Google Doc", "share a file",
  "move file", "rename file", "create folder on Drive", "delete file from Drive",
  "check file permissions", "copy file on Drive", "get file link",
  or mentions Google Drive operations. Provides guidance for using the `gog drive`
  CLI to interact with Google Drive.
---

# Drive Operations via gog CLI

Interact with Google Drive using the `gog` CLI tool (`gog drive` or alias `gog drv`).

## Prerequisites

Verify `gog` is available and authenticated:

```bash
gog drive ls --max=1
```

If authentication fails, inform the user to run `gog auth add <email> --services drive` first.

## Core Principles

- **Always use `--json` when parsing output programmatically** (e.g., extracting file IDs). Use human-readable output when displaying file lists to the user.
- **Use `--dry-run` before any destructive or write operation** (delete, upload, share, move). Preview the action, then execute after user confirmation.
- **Use `--no-input`** to prevent interactive prompts.
- **File operations use file IDs, not file names.** Always resolve the file ID first via `ls` or `search`.

## Command Reference

### Listing Files

List files in a folder (default: root):

```bash
gog drive ls                                  # Root folder
gog drive ls --parent=<folderId>              # Specific folder
gog drive ls --max=50                         # More results
gog drive ls --query="mimeType='application/pdf'"  # Drive query filter
gog drive ls --no-all-drives                  # My Drive only (exclude shared drives)
```

### Searching Files

Full-text search across all of Drive:

```bash
gog drive search "quarterly report"
gog drive search "quarterly report" --max=20
```

For advanced queries, use Drive query language with `--raw-query`:

```bash
gog drive search --raw-query "mimeType='application/vnd.google-apps.spreadsheet' and modifiedTime > '2026-01-01'"
```

Common raw query patterns:
- `mimeType='application/vnd.google-apps.document'` — Google Docs
- `mimeType='application/vnd.google-apps.spreadsheet'` — Google Sheets
- `mimeType='application/vnd.google-apps.presentation'` — Google Slides
- `mimeType='application/vnd.google-apps.folder'` — Folders
- `modifiedTime > '2026-01-01'` — modified after date
- `'<folderId>' in parents` — files in a specific folder
- `trashed = true` — trashed files

### Getting File Metadata

```bash
gog drive get <fileId>
```

### Downloading Files

```bash
gog drive download <fileId>                   # Download to default location
gog drive download <fileId> --out=/tmp/file.pdf  # Specify output path
```

For Google Docs formats, specify export format:

```bash
gog drive download <fileId> --format=pdf      # Export Google Doc as PDF
gog drive download <fileId> --format=docx     # Export as Word
gog drive download <fileId> --format=csv      # Export Sheet as CSV
gog drive download <fileId> --format=xlsx     # Export Sheet as Excel
gog drive download <fileId> --format=pptx     # Export Slides as PowerPoint
gog drive download <fileId> --format=txt      # Export as plain text
```

### Uploading Files

**Preview with `--dry-run` first:**

```bash
gog drive upload /path/to/file.pdf --dry-run
gog drive upload /path/to/file.pdf --parent=<folderId> --dry-run
```

Key flags:
- `--name="custom name"` — override filename
- `--parent=<folderId>` — destination folder
- `--replace=<fileId>` — replace existing file content (preserves link/permissions)
- `--convert` — auto-convert to native Google format (e.g., .docx → Google Doc)
- `--convert-to=doc|sheet|slides` — convert to specific Google format
- `--mime-type=<type>` — override MIME type

### Copying Files

```bash
gog drive copy <fileId> "Copy of Document"
gog drive copy <fileId> "Copy of Document" --parent=<folderId>
```

### Creating Folders

```bash
gog drive mkdir "New Folder"
gog drive mkdir "Subfolder" --parent=<folderId>
```

### Moving Files

```bash
gog drive move <fileId> --to=<folderId> --dry-run
```

### Renaming Files

```bash
gog drive rename <fileId> "New Name"
```

### Deleting Files

**Always preview with `--dry-run` first — default moves to trash:**

```bash
gog drive delete <fileId> --dry-run           # Move to trash (recoverable)
gog drive delete <fileId> --permanent --dry-run  # Permanent delete (irreversible)
```

### Sharing and Permissions

Share a file:

```bash
# Share with a specific user
gog drive share <fileId> --to=user --email=alice@example.com --role=writer --dry-run

# Share with anyone (link sharing)
gog drive share <fileId> --to=anyone --role=reader --dry-run

# Share with a domain
gog drive share <fileId> --to=domain --domain=example.com --role=reader --dry-run
```

Roles: `reader`, `writer`.

List existing permissions:

```bash
gog drive permissions <fileId>
```

Remove a permission:

```bash
gog drive unshare <fileId> <permissionId>
```

### Utilities

Get web URL for a file:

```bash
gog drive url <fileId>
```

List shared drives (Team Drives):

```bash
gog drive drives
```

Manage comments on files:

```bash
gog drive comments list <fileId>
gog drive comments create <fileId> --content="Comment text"
```

## Workflow Patterns

### Find and Download

1. Search: `gog drive search "budget 2026" --json --max=10`
2. Extract file ID from JSON output
3. Download: `gog drive download <fileId> --out=/tmp/budget.xlsx --format=xlsx`

### Upload and Share

1. Upload: `gog drive upload /path/to/report.pdf --parent=<folderId> --dry-run`
2. After confirm, execute without `--dry-run`
3. Get file ID from output
4. Share: `gog drive share <fileId> --to=user --email=boss@example.com --role=reader --dry-run`
5. After confirm, execute without `--dry-run`

### Organize Files

1. Create folder: `gog drive mkdir "Q1 Reports" --parent=<parentFolderId>`
2. Get new folder ID from output
3. Move files: `gog drive move <fileId> --to=<newFolderId> --dry-run`

## Safety Rules

- **Never delete files (especially `--permanent`) without `--dry-run` preview and user confirmation.**
- **Never share files without `--dry-run` preview and user confirmation.** Sharing can expose sensitive data.
- **Never upload with `--replace` without confirming** — this overwrites the existing file content.
- When listing or searching, default to `--max=20` to keep output manageable.
- Always resolve file IDs via `ls` or `search` before operating. Do not guess file IDs.
