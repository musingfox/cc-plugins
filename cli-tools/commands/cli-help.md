---
description: Quick reference guide for modern CLI tools (fd, rg, ast-grep, fzf, jq, yq)
---

# CLI Tools Quick Reference

Get help with powerful command-line tools for development workflows.

## Available Tools

### 🔥 fd - Fast File Finder
```bash
fd <pattern>              # Find files by name
fd -e <ext>               # Find by extension
fd -t <type>              # Find by type (f=file, d=directory)
fd -H                     # Include hidden files
fd -E <pattern>           # Exclude pattern
```

### ⚡ ripgrep (rg) - Fast Text Search
```bash
rg "<pattern>"            # Search for text
rg -t <type>              # Search specific file type
rg -i                     # Case-insensitive
rg -C <num>               # Show context lines
rg -l                     # List files with matches
rg -w                     # Match whole words
```

### 💡 ast-grep - Structural Code Search
```bash
ast-grep --pattern '<pattern>'                    # Search by AST pattern
ast-grep --pattern '<old>' --rewrite '<new>'      # Structural refactor
ast-grep -l <lang>                                # Specify language
```

### 🎯 fzf - Interactive Fuzzy Finder
```bash
<command> | fzf           # Interactive selection
fzf -m                    # Multi-select mode
fzf --preview '<cmd>'     # Preview window
```

### 🔮 jq - JSON Processor
```bash
jq '.'                    # Pretty print
jq '.<field>'             # Extract field
jq '.[]'                  # Expand array
jq 'select(<expr>)'       # Filter
jq -r                     # Raw output
```

### 📝 yq - YAML/XML Processor
```bash
yq '.<field>'             # Read value
yq -i '.<field> = <val>'  # Update in-place
yq -o json                # Convert to JSON
yq -P                     # Convert to YAML
```

## Common Workflows

### Find and Edit Files
```bash
fd <pattern> | fzf -m | xargs $EDITOR
```

### Search with Preview
```bash
rg -l "<pattern>" | fzf --preview 'rg -C 5 "<pattern>" {}'
```

### Process API Response
```bash
curl -s <url> | jq '.[] | select(.<field> > <value>)'
```

### Edit Config Files
```bash
fd "config" -e yaml | fzf | xargs yq '.<field>'
```

### Find Code Patterns
```bash
ast-grep --pattern '<pattern>' -c
```

## Installation Check

Run this to check which tools are installed:
```bash
for tool in fd rg ast-grep fzf jq yq; do
  command -v $tool && echo "✓ $tool available" || echo "✗ $tool not installed"
done
```

## Get Expert Help

For detailed guidance, ask the CLI expert agent:
```bash
@agent-cli-expert <your question>
```

Examples:
- `@agent-cli-expert How do I find all TypeScript files?`
- `@agent-cli-expert Help me parse this JSON response`
- `@agent-cli-expert Show me how to combine fd and fzf`

## Learn More

See the [CLI Tools README](../README.md) for comprehensive documentation and examples.
