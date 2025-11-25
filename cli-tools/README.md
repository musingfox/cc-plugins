# CLI Tools - Modern Command-Line Productivity

Master powerful command-line tools for lightning-fast development workflows. This plugin provides expert guidance on using modern CLI utilities that are 3-10x faster than traditional Unix tools.

## 🚀 Quick Start

Install the plugin:
```bash
/plugin install cli-tools
```

Use the CLI expert agent:
```bash
@agent-cli-expert
```

## 🛠️ Tools Covered

### 🔥 fd - Fast File Finder
- **Speed**: 3-10x faster than `find`
- **Smart**: Automatically respects `.gitignore`
- **Simple**: Intuitive syntax, colored output

**Use cases**:
- Quickly locate configuration files
- Find source files by extension
- Build file lists for processing

**Example**:
```bash
fd config.json          # Find config file
fd -e js -e ts          # All JS/TS files
fd pattern src/         # Search in specific dir
```

### ⚡ ripgrep (rg) - Blazing Fast Search
- **Speed**: Significantly faster than `grep`
- **Smart**: Recursive, respects `.gitignore`
- **Powerful**: Regex support, context lines

**Use cases**:
- Find function/class usage
- Locate TODOs and FIXMEs
- Search API calls and imports
- Code archaeology

**Example**:
```bash
rg "function getName"   # Find function
rg -t js "export"       # Search JS files only
rg -C 3 "api_key"       # Show 3 lines context
```

### 💡 ast-grep - Structural Code Search
- **Power**: Search by AST, not text
- **Language-aware**: Understands code structure
- **Refactoring**: Structural find & replace

**Use cases**:
- Find outdated API patterns
- Locate security vulnerabilities
- Structural refactoring
- Code quality analysis

**Example**:
```bash
ast-grep --pattern 'console.log($$$)'
ast-grep --pattern 'var $NAME = $VALUE'
ast-grep --pattern 'useEffect(() => { $$$ }, $DEPS)'
```

### 🎯 fzf - Interactive Fuzzy Finder
- **Interactive**: Real-time fuzzy search
- **Flexible**: Works with any list input
- **Productive**: Multi-select, preview windows

**Use cases**:
- Interactive file selection
- Navigate directory structures
- Select from command output
- Build interactive workflows

**Example**:
```bash
fd | fzf                      # Select files interactively
fd | fzf -m | xargs $EDITOR   # Multi-select and edit
rg -l "TODO" | fzf            # Select from search results
```

### 🔮 jq - JSON Processing Wizard
- **Transform**: Filter and reshape JSON
- **Extract**: Pull out specific data
- **Powerful**: Complex queries and transformations

**Use cases**:
- Parse API responses
- Extract data from JSON files
- Transform JSON structure
- Debug JSON data

**Example**:
```bash
jq '.'                                    # Pretty print
jq '.user.name' data.json                 # Extract field
jq '.[] | select(.price > 0.5)'          # Filter
curl api.example.com | jq '.results[]'   # Parse API
```

### 📝 yq - YAML/XML Processing Expert
- **Like jq**: But for YAML and XML
- **Editing**: In-place file modifications
- **Convert**: Between YAML/JSON/XML

**Use cases**:
- Edit Kubernetes configs
- Modify CI/CD files
- Process Docker Compose files
- Update application configs

**Example**:
```bash
yq '.spec.replicas' deployment.yaml       # Read value
yq -i '.version = "2.0"' config.yaml      # Update in-place
yq -o json config.yaml                    # Convert to JSON
```

## 🔄 Powerful Combinations

### Find + Select + Edit
```bash
fd -e md | fzf -m | xargs $EDITOR
```
Find markdown files, select multiple interactively, then edit them.

### Search + Preview + Select
```bash
rg -l "TODO" | fzf --preview 'rg -C 5 "TODO" {}'
```
Find files with TODOs, preview matches, then select file to edit.

### API + Extract + Filter
```bash
curl -s api.example.com/users | jq '.data[] | select(.role == "admin") | {name, email}'
```
Fetch API data, filter by role, extract specific fields.

### Config Find + Transform
```bash
fd "config.*.yaml" | xargs yq '.database.host'
```
Find all config files and extract database host from each.

## 📚 Agent Capabilities

The `@agent-cli-expert` provides:

- ✅ **Tool Selection**: Choose the right tool for your task
- ✅ **Command Examples**: Concrete, working examples
- ✅ **Flag Explanations**: Understand what each flag does
- ✅ **Workflow Design**: Build powerful command pipelines
- ✅ **Debugging Help**: Fix commands that don't work
- ✅ **Best Practices**: Learn productivity patterns
- ✅ **Performance Tips**: Optimize your workflows

## 🎓 Learning Path

### Beginner
1. Start with `fd` for file finding
2. Use `rg` for text search
3. Try `fzf` for interactive selection

### Intermediate
4. Combine tools with pipes: `fd | fzf`
5. Use `jq` for JSON processing
6. Edit YAML configs with `yq`

### Advanced
7. Use `ast-grep` for structural search
8. Build complex pipelines
9. Create custom workflows with fzf

## 🔧 Installation

### macOS (Homebrew)
```bash
brew install fd ripgrep ast-grep fzf jq yq
```

### Linux (Ubuntu/Debian)
```bash
# fd
apt install fd-find

# ripgrep
apt install ripgrep

# ast-grep
cargo install ast-grep

# fzf
apt install fzf

# jq
apt install jq

# yq
wget https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64 -O /usr/local/bin/yq
chmod +x /usr/local/bin/yq
```

### Check Installation
```bash
command -v fd && echo "✓ fd available"
command -v rg && echo "✓ ripgrep available"
command -v ast-grep && echo "✓ ast-grep available"
command -v fzf && echo "✓ fzf available"
command -v jq && echo "✓ jq available"
command -v yq && echo "✓ yq available"
```

## 💡 Example Workflows

### Find All TODOs
```bash
rg -n "TODO|FIXME" | fzf --preview 'bat {1} --highlight-line {2}'
```

### Select and Edit Config
```bash
fd "config" -e yaml -e json | fzf | xargs $EDITOR
```

### Debug API Response
```bash
curl -s https://api.example.com/data | jq '.' | fzf
```

### Update Multiple YAML Files
```bash
fd -e yaml | fzf -m | xargs -I {} yq -i '.version = "2.0"' {}
```

### Find Large Files
```bash
fd -t f -x stat -f "%z %N" {} | sort -rn | head -20 | fzf
```

## 🤝 Integration with Claude Code

The CLI tools expert agent integrates seamlessly with Claude Code workflows:

- **File Operations**: Use `fd` instead of `Glob` for complex searches
- **Code Search**: Use `rg` for fast, comprehensive code search
- **Data Processing**: Process JSON/YAML files with `jq`/`yq`
- **Interactive Workflows**: Build interactive tool chains with `fzf`
- **Structural Analysis**: Use `ast-grep` for code pattern analysis

## 📖 Documentation

For detailed documentation on each tool, visit:
- [fd](https://github.com/sharkdp/fd)
- [ripgrep](https://github.com/BurntSushi/ripgrep)
- [ast-grep](https://ast-grep.github.io/)
- [fzf](https://github.com/junegunn/fzf)
- [jq](https://stedolan.github.io/jq/)
- [yq](https://github.com/mikefarah/yq)

## 🆘 Getting Help

Ask the CLI expert agent:
```bash
@agent-cli-expert How do I find all TypeScript files excluding tests?
@agent-cli-expert Help me parse this JSON response
@agent-cli-expert Show me how to combine fd and fzf
```

## 🌟 Pro Tips

1. **Use aliases** for common commands:
   ```bash
   alias fdf="fd --type f | fzf"
   alias rgf="rg -l | fzf --preview 'bat {}'"
   ```

2. **Add to shell config** for persistent improvements:
   ```bash
   export FZF_DEFAULT_COMMAND='fd --type f'
   export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'
   ```

3. **Combine with other tools**:
   - `fd | xargs bat` - Find and preview files
   - `rg pattern | cut -d: -f1 | sort -u` - Unique files with matches
   - `ast-grep --pattern 'pattern' --json | jq` - Parse AST results

## 📝 License

MIT License - See [LICENSE](../LICENSE) file for details

## 🙏 Credits

This plugin provides guidance on using these excellent open-source tools:
- fd by [@sharkdp](https://github.com/sharkdp)
- ripgrep by [@BurntSushi](https://github.com/BurntSushi)
- ast-grep by [@HerringtonDarkholme](https://github.com/HerringtonDarkholme)
- fzf by [@junegunn](https://github.com/junegunn)
- jq by [@stedolan](https://github.com/stedolan)
- yq by [@mikefarah](https://github.com/mikefarah)
