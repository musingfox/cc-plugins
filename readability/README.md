# Readability Formatting Plugin

A Claude Code plugin that enhances AI-generated text readability through proper alignment and formatting of markdown tables, ASCII art, and text-based diagrams.

## Problem Statement

AI assistants often generate technically correct markdown tables and ASCII diagrams that render properly in viewers, but are difficult to read in their raw text form. This creates problems for developers who:

- Edit markdown files directly in text editors
- Review code and documentation in pull requests
- Work with plain text files in terminal environments
- Need to quickly scan table data without rendering

### Examples of the Problem

**Unaligned Markdown Table** (hard to read):
```markdown
| Name | Age | Occupation |
|---|---|---|
| Alice | 30 | Software Engineer |
| Bob | 25 | Designer |
| Christopher | 45 | Product Manager |
```

**Misaligned ASCII Box** (borders don't line up):
```
┌─────────────┐
│ Title Here │
│             │
│ Some content that is longer │
└─────────────┘
```

## Solution

This plugin provides a comprehensive skill that teaches Claude how to generate properly aligned, human-readable formatted text.

### After Using This Plugin

**Aligned Markdown Table** (easy to scan):
```markdown
| Name        | Age | Occupation         |
|-------------|-----|--------------------|
| Alice       | 30  | Software Engineer  |
| Bob         | 25  | Designer           |
| Christopher | 45  | Product Manager    |
```

**Properly Aligned ASCII Box** (clean borders):
```
┌──────────────────────────────┐
│ Title Here                   │
│                              │
│ Some content that is longer  │
└──────────────────────────────┘
```

## Installation

### Using Claude Code CLI

```bash
# Clone the plugin repository
git clone https://github.com/musingfox/cc-plugins.git
cd cc-plugins/readability-formatting

# Install the plugin
claude-code install .
```

### Manual Installation

1. Copy the `readability-formatting` directory to your Claude Code plugins folder
2. Restart Claude Code or reload plugins

## Usage

### Invoking the Skill

The plugin provides a skill called `readable-text-formatting` that you can explicitly invoke or that Claude will use automatically when generating formatted text.

**Explicit invocation:**
```
Claude, use the readable-text-formatting skill to create a table showing...
```

**Automatic usage:**
Once installed, Claude should automatically apply formatting best practices when you request:
- Markdown tables
- ASCII diagrams or boxes
- Text-based flowcharts
- Any formatted text output

### Example Requests

**Create a formatted table:**
```
Create a markdown table comparing different database options with columns for name, type, and use case.
```

**Create ASCII diagrams:**
```
Draw an ASCII diagram showing the architecture of a three-tier web application.
```

**Create flowcharts:**
```
Create a text-based flowchart showing the user authentication process.
```

## Features

### Markdown Table Formatting

- ✅ Properly aligned columns
- ✅ Consistent column widths
- ✅ Clean separator lines
- ✅ Support for mixed text and number alignment
- ✅ Handles varying content lengths

### ASCII Art & Diagrams

- ✅ Perfectly aligned borders
- ✅ Consistent box dimensions
- ✅ Support for nested structures
- ✅ Unicode and ASCII-safe character sets
- ✅ Flowcharts with proper arrow alignment

### General Text Formatting

- ✅ Monospace font optimization
- ✅ Width calculation formulas
- ✅ Padding strategies
- ✅ Best practices and common patterns

## Skill Contents

The `readable-text-formatting` skill includes:

1. **Core Principles** - Fundamental alignment concepts
2. **Markdown Tables** - Step-by-step table creation guide
3. **ASCII Diagrams** - Border alignment techniques
4. **Common Patterns** - Ready-to-use templates
5. **Troubleshooting** - Common mistakes and fixes
6. **Advanced Patterns** - Complex diagrams and hierarchies

## Examples

### Example 1: Data Table

**Request:**
```
Create a table showing quarterly sales data for three products.
```

**Output:**
```markdown
| Product   | Q1 Sales | Q2 Sales | Q3 Sales | Q4 Sales | Total    |
|-----------|----------|----------|----------|----------|----------|
| Widget    | $45,000  | $52,000  | $48,000  | $61,000  | $206,000 |
| Gadget    | $32,000  | $35,000  | $38,000  | $42,000  | $147,000 |
| Tool      | $28,000  | $30,000  | $33,000  | $37,000  | $128,000 |
| **Total** | $105,000 | $117,000 | $119,000 | $140,000 | $481,000 |
```

### Example 2: System Architecture Diagram

**Request:**
```
Show me a text diagram of a microservices architecture.
```

**Output:**
```
┌─────────────────────────────────────────────────────┐
│                   API Gateway                       │
└──────────────┬──────────────────────┬───────────────┘
               │                      │
       ┌───────▼──────┐       ┌──────▼────────┐
       │   Auth       │       │   User        │
       │   Service    │       │   Service     │
       └───────┬──────┘       └──────┬────────┘
               │                     │
               └──────────┬──────────┘
                          │
                  ┌───────▼────────┐
                  │   Database     │
                  │   PostgreSQL   │
                  └────────────────┘
```

### Example 3: Decision Flow

**Request:**
```
Create a flowchart for processing user registration.
```

**Output:**
```
        ┌─────────────────┐
        │  User submits   │
        │  registration   │
        └────────┬────────┘
                 │
                 ▼
        ┌─────────────────┐
        │  Validate input │
        └────────┬────────┘
                 │
            ┌────▼────┐
            │ Valid?  │
            └────┬────┘
                 │
         ┌───────┴────────┐
         │                │
        YES               NO
         │                │
         ▼                ▼
┌──────────────┐   ┌──────────────┐
│ Create user  │   │ Show error   │
│ account      │   │ message      │
└──────┬───────┘   └──────┬───────┘
       │                  │
       ▼                  │
┌──────────────┐          │
│ Send welcome │          │
│ email        │          │
└──────┬───────┘          │
       │                  │
       └────────┬─────────┘
                │
                ▼
        ┌──────────────┐
        │     Done     │
        └──────────────┘
```

## Technical Details

### How It Works

The plugin provides a markdown skill file that includes:

- **Formatting algorithms**: Step-by-step instructions for calculating column widths and border dimensions
- **Pattern templates**: Ready-to-use structures for common use cases
- **Character sets**: Unicode box-drawing characters and ASCII-safe alternatives
- **Best practices**: Guidelines for maintaining consistency and readability

### Skill File Structure

```
skills/readable-text-formatting.md
├── When to Use
├── Core Principles
├── Markdown Tables
│   ├── Problem & Solution
│   ├── Step-by-step Guide
│   └── Advanced Patterns
├── ASCII Art & Diagrams
│   ├── Problem & Solution
│   ├── Alignment Techniques
│   └── Common Patterns
├── Workflows
├── Common Mistakes
└── Best Practices
```

## Configuration

No configuration is required. The skill is automatically available once the plugin is installed.

### Optional: Custom Width Preferences

If you prefer specific column widths or box dimensions, you can specify them in your requests:

```
Create a table with minimum column width of 15 characters.
```

```
Draw a box exactly 40 characters wide.
```

## Troubleshooting

### Issue: Tables still appear unaligned

**Solution**: Ensure you're viewing the file in a monospace font. Proportional fonts will break alignment.

### Issue: Unicode box characters don't display correctly

**Solution**: Request ASCII-safe alternatives:
```
Create an ASCII box using only ASCII characters (-, |, +).
```

### Issue: Complex diagrams are still misaligned

**Solution**: Request simpler structures first, then build complexity:
```
Create a simple two-box diagram first, then add connections.
```

## Contributing

Contributions are welcome! To improve the plugin:

1. Fork the repository
2. Create a feature branch
3. Add improvements to the skill file or documentation
4. Submit a pull request

### Areas for Contribution

- Additional formatting patterns
- Language-specific formatting guides
- Integration examples
- Performance optimizations

## License

MIT License - see LICENSE file for details

## Author

**Nick Huang**
- Email: nick12703990@gmail.com
- GitHub: [@musingfox](https://github.com/musingfox)

## Changelog

### Version 1.0.0 (2026-01-20)

- Initial release
- Markdown table formatting skill
- ASCII art alignment guidelines
- Common pattern templates
- Best practices documentation

## Related Resources

- [Claude Code Documentation](https://docs.anthropic.com/claude/docs)
- [Markdown Guide](https://www.markdownguide.org/)
- [ASCII Art Tutorial](https://www.asciiart.eu/)
- [Box Drawing Characters Reference](https://en.wikipedia.org/wiki/Box-drawing_character)

## Support

For issues, questions, or suggestions:

- Open an issue on [GitHub](https://github.com/musingfox/cc-plugins/issues)
- Check existing issues for solutions
- Review the skill file for detailed guidance

---

**Make your AI-generated text human-readable!** 🎯
