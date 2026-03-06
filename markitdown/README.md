# markitdown

A Claude Code plugin for converting non-plain-text files to Markdown using [Microsoft's MarkItDown](https://github.com/microsoft/markitdown).

## Features

- **Auto-triggered reading**: Seamlessly read PDF, Office documents, images, audio, and more — just reference the file naturally
- **Explicit conversion**: Use `/convert` to save files as Markdown

## Supported Formats

| Category | Extensions |
|----------|-----------|
| Documents | `.pdf`, `.docx`, `.pptx`, `.xlsx`, `.xls` |
| Web | `.html`, `.htm` |
| Images | `.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.tiff`, `.webp` |
| Audio | `.mp3`, `.wav`, `.m4a`, `.ogg`, `.flac` |
| Data | `.csv`, `.json`, `.xml` |
| Other | `.epub`, `.zip` |

## Prerequisites

Install markitdown:

```bash
# Recommended (isolated install)
uv tool install 'markitdown[all]'

# Alternative
pip install 'markitdown[all]'
```

## Usage

### Natural Language (Skill)

Just ask Claude to read or analyze a supported file:

- "Read this PDF and summarize it"
- "What's in report.docx?"
- "Analyze the data in spreadsheet.xlsx"

### Command

```
/convert report.pdf
```

Converts `report.pdf` → `report.md` in the same directory.

## Installation

```bash
/plugin install markitdown
```
