---
description: Convert a file to Markdown using markitdown
argument-hint: <file-path>
allowed-tools:
  - Bash
  - Read
  - Write
---

# Convert File to Markdown

Convert the specified file to Markdown format and save it as a `.md` file in the same directory.

## Instructions

1. **Validate input**: Confirm the user provided a file path as argument. If not, ask for the file path.

2. **Check installation**: Run `command -v markitdown` to verify markitdown is installed.
   - If not installed, inform the user and offer:
     - **Recommended**: `uv tool install 'markitdown[all]'`
     - **Alternative**: `pip install 'markitdown[all]'`
   - Ask the user which method they prefer. Do NOT install without confirmation.

3. **Determine output path**: Replace the file extension with `.md`.
   - Example: `report.pdf` → `report.md`
   - Example: `slides.pptx` → `slides.md`
   - Example: `data.xlsx` → `data.md`

4. **Convert**: Run the conversion:
   ```bash
   markitdown "<file-path>" -o "<output-path>"
   ```

5. **Report result**: Tell the user where the output file was saved and briefly describe the converted content.
