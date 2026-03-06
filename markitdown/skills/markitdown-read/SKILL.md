---
name: MarkItDown Read
description: >-
  This skill should be used when the user asks to read, open, analyze, summarize,
  or extract content from non-plain-text files such as PDF (.pdf), Word (.docx),
  PowerPoint (.pptx), Excel (.xlsx, .xls), images (.jpg, .jpeg, .png, .gif, .bmp,
  .tiff, .webp), audio (.mp3, .wav, .m4a, .ogg, .flac), HTML (.html, .htm),
  EPUB (.epub), CSV (.csv), JSON (.json), XML (.xml), or ZIP (.zip) files.
  Also triggered when the user references these file types by name or wants to
  understand the contents of a document, spreadsheet, presentation, or media file.
  This skill converts files to Markdown via the markitdown CLI for seamless reading.
---

# MarkItDown Read

Convert non-plain-text files to Markdown for reading and analysis using Microsoft's `markitdown` CLI.

## Supported Formats

| Category | Extensions |
|----------|-----------|
| Documents | `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.xls` |
| Web | `.html`, `.htm` |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.webp` |
| Audio | `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac` |
| Data | `.csv`, `.json`, `.xml` |
| Other | `.epub`, `.zip` |

## Workflow

### Step 1: Check Installation

Before converting, verify `markitdown` is available:

```bash
command -v markitdown
```

If not installed, inform the user and offer installation options:

- **Recommended**: `uv tool install 'markitdown[all]'` (isolated install, no virtual env pollution)
- **Alternative**: `pip install 'markitdown[all]'`

Ask the user which method they prefer before installing. Do NOT install without confirmation.

### Step 2: Convert and Read

Run `markitdown` on the target file and capture stdout:

```bash
markitdown <file-path>
```

The output is Markdown text printed to stdout. Read the output directly — do not save to a file unless the user explicitly asks.

### Step 3: Present Content

After conversion, work with the Markdown output as if the file had been read natively:
- Answer questions about the content
- Summarize, extract, or analyze as requested
- Reference specific sections, tables, or data points

## Important Notes

- For large files, the output may be extensive. Summarize first, then dive into specifics if asked.
- Image conversion requires OCR capabilities — results depend on image quality and content.
- Audio conversion requires speech recognition — results may vary by audio quality.
- If `markitdown` fails on a specific file, report the error and suggest alternative approaches.
- When the user asks to "read" or "open" a supported file type, prefer this skill over the Read tool for binary formats (PDF, DOCX, PPTX, XLSX, images, audio, EPUB, ZIP). For plain-text formats (HTML, CSV, JSON, XML), use this skill only when the user specifically wants Markdown conversion or when the Read tool output is insufficient.
