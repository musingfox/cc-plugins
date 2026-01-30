# Mermaid Visualization Plugin

A Claude Code plugin that enables high-quality diagram visualization using Mermaid. Generate flowcharts, sequence diagrams, class diagrams, state machines, and more—all automatically rendered as **PNG or SVG images** with **beautiful color themes** and displayed in your default viewer.

## Problem Statement

While AI assistants can generate Mermaid diagram code, viewing the actual rendered diagrams requires:

- Manually copying code to external tools like [mermaid.live](https://mermaid.live)
- Using browser extensions or IDE plugins
- Switching between terminal and web browser repeatedly
- Breaking your development flow

This creates friction when you need to quickly visualize:
- System architecture and data flows
- API interactions and sequences
- State machines and workflows
- Database schemas and relationships
- Process flows and decision trees

## Solution

This plugin provides a seamless workflow for generating and viewing Mermaid diagrams directly from Claude Code:

1. **Request a diagram** - Ask Claude to create a flowchart, sequence diagram, etc.
2. **Automatic rendering** - Claude generates Mermaid code and renders it to PNG or SVG
3. **Instant display** - Image opens automatically in your default viewer (cross-platform)
4. **Beautiful themes** - Choose from 8 color schemes or create your own
5. **High quality** - Professional PNG/SVG output with transparent background

No manual steps, no context switching, no friction.

## Features

### Supported Diagram Types

- ✅ **Flowcharts** - Process flows, decision trees, algorithms
- ✅ **Sequence Diagrams** - API interactions, system communications
- ✅ **Class Diagrams** - Object-oriented design, data models
- ✅ **State Diagrams** - State machines, workflow states
- ✅ **ER Diagrams** - Database schemas, entity relationships
- ✅ **Gantt Charts** - Project timelines, task scheduling
- ✅ **Pie Charts** - Data distribution, proportions

### Key Benefits

- 🚀 **Zero friction** - Diagrams open automatically in your viewer
- 🎨 **Beautiful themes** - 8 built-in color schemes (Tokyo Night, Nord, Catppuccin, etc.)
- 📐 **SVG & PNG** - Vector format for docs, raster for sharing
- 🌍 **Cross-platform** - Works on macOS, Linux, and Windows
- 🔄 **Stay in flow** - No need to leave your terminal or switch tools
- 📝 **Comprehensive** - Supports all major Mermaid diagram types
- 🎯 **Simple** - Natural language requests, no manual rendering
- ⚙️ **Customizable** - Interactive theme selection or environment variables

## Installation

### Prerequisites

**Minimal requirements**: Just Node.js/npm (which you likely already have)

```bash
# Check if you have npm
npm --version
```

If not installed:
```bash
# macOS
brew install node

# Ubuntu/Debian
sudo apt install nodejs npm

# Windows
# Download from https://nodejs.org
```

The plugin automatically uses `npx` to run mermaid-cli without global installation.

### Optional: Install mermaid-cli for faster execution

For instant diagram generation (skips ~10-20s first-time download):

```bash
npm install -g @mermaid-js/mermaid-cli
```

Verify installation:
```bash
mmdc --version
```

**When to install globally:**
- ✅ You create diagrams frequently (multiple times per day)
- ✅ You want instant execution without initial download wait
- ❌ Don't install if you only occasionally need diagrams - npx auto-caching is sufficient

### Installing the Plugin

#### Using Claude Code CLI

```bash
# Clone the plugin repository
git clone https://github.com/musingfox/cc-plugins.git
cd cc-plugins/mermaid-viz

# Install the plugin
claude-code install .
```

#### Manual Installation

1. Copy the `mermaid-viz` directory to your Claude Code plugins folder
2. Restart Claude Code or reload plugins

## Usage

### Quick Command: `/diagram`

The fastest way to create diagrams! Use the interactive `/diagram` command:

```
/diagram
```

Claude will ask you two simple questions:
1. **What type of diagram?** (Flowchart, Sequence, Class, State, ER, etc.)
2. **What should it show?** (Describe in natural language)

Then automatically generates and displays your diagram!

**Example:**
```
User: /diagram

Claude: What type of diagram would you like to create?
User: Sequence Diagram

Claude: Please describe what you want to visualize:
User: Show the checkout process with payment gateway

[Diagram automatically generated and opened]
```

### Basic Examples

**Create a flowchart:**
```
Claude, show me a flowchart for the user authentication process.
```

**Create a sequence diagram:**
```
Create a sequence diagram showing how a REST API handles a request.
```

**Create a class diagram:**
```
Draw a class diagram for a blog system with User, Post, and Comment entities.
```

### Invoking the Skill

The plugin provides the `mermaid-display` skill that Claude uses automatically when you request diagrams.

**Explicit invocation:**
```
Use the mermaid-display skill to create a state diagram for order processing.
```

**Automatic usage:**
Once installed, Claude will automatically use this skill when you request any supported diagram type.

### Workflow

When you request a diagram, Claude will:

1. Generate appropriate Mermaid syntax based on your requirements
2. Save the Mermaid code to a temporary file
3. Automatically detect the best rendering tool:
   - Use `mmdc` if installed (fastest, ~50ms)
   - Use `npx -y @mermaid-js/mermaid-cli` as fallback (fast after cache, ~300ms)
4. Apply your configuration from environment variables (theme, background, size, etc.)
5. Render to PNG image (first time with npx: 10-20s download, then cached)
6. Automatically open the image in your default viewer (Preview on macOS)
7. Inform you that the diagram is ready

**Customization**: Set environment variables like `MERMAID_THEME=dark` to change defaults. See Configuration section below

### Advanced Options

**Request specific diagram characteristics:**
```
Create a large, high-resolution flowchart showing the deployment pipeline.
```

**Specify background color:**
```
Create a sequence diagram with a white background for printing.
```

**Request multiple related diagrams:**
```
Create three diagrams: 1) system architecture flowchart, 2) authentication sequence diagram, 3) database ER diagram.
```

## Configuration

### Quick Setup: Interactive Theme Selection

The easiest way to configure themes is using the `mermaid-theme` skill:

```
Ask Claude: "I want to configure mermaid themes"
```

Claude will:
1. Show you 8 color schemes with descriptions
2. Let you select one interactively
3. Generate `~/.mermaid-theme.sh` configuration file
4. Provide instructions to load it permanently

### Available Color Schemes

Choose from **8 beautiful built-in themes**:

| Theme | Description | Best For |
|-------|-------------|----------|
| **tokyo-night** | Deep blue-purple tones | Dark terminals, modern aesthetic |
| **nord** | Ice blue tones | Arctic-inspired, cool palette |
| **catppuccin-mocha** | Warm purple tones | Cozy dark theme with pastels |
| **catppuccin-latte** | Warm light tones | Light mode, soft colors |
| **dracula** | Purple-pink tones | High contrast, vibrant |
| **github-dark** | Deep blue tones | Familiar GitHub colors |
| **github-light** | Light blue tones | Clean, professional |
| **solarized-dark** | Amber-blue tones | Precision colors for technical work |

### Simplified Environment Variables

**Only 2 variables** (no complex configuration needed):

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `MERMAID_OUTPUT_FORMAT` | `png`, `svg` | `png` | Output format |
| `MERMAID_COLOR_SCHEME` | See table above | `default` | Color scheme name |

### Configuration Examples

**Quick Start (Recommended - Interactive)**:

Use the mermaid-theme skill for interactive configuration:
```
Ask Claude: "Configure mermaid themes"
```

Then load the generated configuration:
```bash
source ~/.mermaid-theme.sh
```

**Manual Configuration**:

**Use a color scheme**:
```bash
export MERMAID_COLOR_SCHEME=tokyo-night
claude
```

**Output as SVG** (vector format, infinite zoom):
```bash
export MERMAID_OUTPUT_FORMAT=svg
claude
```

**Permanent configuration**:

Add to your shell config file (`~/.zshrc` or `~/.bashrc`):
```bash
# Mermaid diagram preferences
export MERMAID_COLOR_SCHEME=nord
export MERMAID_OUTPUT_FORMAT=png

# Load theme configuration
source ~/.mermaid-theme.sh
```

Then reload:
```bash
source ~/.zshrc  # or ~/.bashrc
```

**Temporary (one-time use)**:
```bash
MERMAID_COLOR_SCHEME=dracula MERMAID_OUTPUT_FORMAT=svg claude
```

### Common Use Cases

**Dark terminal users**:
```bash
export MERMAID_COLOR_SCHEME=tokyo-night
# Or: nord, catppuccin-mocha, dracula, github-dark, solarized-dark
```

**Light terminal users**:
```bash
export MERMAID_COLOR_SCHEME=catppuccin-latte
# Or: github-light
```

**Documentation (SVG format)**:
```bash
export MERMAID_OUTPUT_FORMAT=svg
export MERMAID_COLOR_SCHEME=github-light
```

**Sharing diagrams (PNG format)**:
```bash
export MERMAID_OUTPUT_FORMAT=png
export MERMAID_COLOR_SCHEME=github-dark
```

**Custom colors (advanced)**:
```bash
export MERMAID_COLOR_SCHEME=custom
export MERMAID_PRIMARY_COLOR=#7aa2f7
export MERMAID_SECONDARY_COLOR=#bb9af7
export MERMAID_TEXT_COLOR=#c0caf5
```

### SVG vs PNG

**SVG (Vector Format)**:
- ✅ Infinite zoom without quality loss
- ✅ Smaller file size (typically 30-50% of PNG)
- ✅ Perfect for documentation and web
- ❌ Less universal compatibility

**PNG (Raster Format)**:
- ✅ Universal compatibility
- ✅ Works everywhere (email, chat, screenshots)
- ❌ Fixed resolution
- ❌ Larger file size

**Recommendation**: Use SVG for documentation, PNG for sharing.

## Examples

### Example 1: System Architecture Flowchart

**Request:**
```
Show me a flowchart of a microservices architecture with API gateway, auth service, user service, and database.
```

**Result:**
Claude generates and opens a flowchart showing:
- API Gateway as entry point
- Branching to Auth Service and User Service
- Both services connecting to Database
- Clear directional arrows and labels

### Example 2: Authentication Sequence Diagram

**Request:**
```
Create a sequence diagram for JWT authentication flow.
```

**Result:**
Claude generates and opens a sequence diagram showing:
- User → Browser: Enter credentials
- Browser → API: POST /login
- API → AuthService: Validate
- AuthService → Database: Query user
- Database → AuthService: User data
- AuthService → API: JWT token
- API → Browser: Set cookie
- Browser → User: Redirect

### Example 3: Order State Machine

**Request:**
```
Draw a state diagram for an e-commerce order lifecycle.
```

**Result:**
Claude generates and opens a state diagram showing:
- States: Pending, Processing, Shipped, Delivered, Cancelled
- Transitions: payment, ship, deliver, cancel, retry
- Start and end states clearly marked

### Example 4: Database ER Diagram

**Request:**
```
Create an ER diagram for a social media database with Users, Posts, Comments, and Likes.
```

**Result:**
Claude generates and opens an ER diagram showing:
- User entity (id, username, email)
- Post entity (id, user_id, content, created_at)
- Comment entity (id, post_id, user_id, text)
- Like entity (id, user_id, post_id)
- Relationships with cardinality markers

## Diagram Types Reference

### Flowchart (Graph)
**Use for:** Process flows, decision trees, system architecture

**Example request:**
```
Create a flowchart showing the CI/CD pipeline from code commit to deployment.
```

### Sequence Diagram
**Use for:** API interactions, system communications, time-based flows

**Example request:**
```
Show me a sequence diagram of OAuth 2.0 authorization code flow.
```

### Class Diagram
**Use for:** Object-oriented design, data models, entity relationships

**Example request:**
```
Create a class diagram for a payment processing system.
```

### State Diagram
**Use for:** State machines, workflow states, status transitions

**Example request:**
```
Draw a state diagram for a pull request lifecycle in GitHub.
```

### Entity Relationship Diagram
**Use for:** Database schemas, data relationships

**Example request:**
```
Create an ER diagram for a hospital management system.
```

### Gantt Chart
**Use for:** Project timelines, task scheduling

**Example request:**
```
Create a Gantt chart for a 3-month software development project.
```

### Pie Chart
**Use for:** Data distribution, proportions

**Example request:**
```
Show a pie chart of web traffic by browser (Chrome 45%, Safari 30%, Firefox 15%, Other 10%).
```

## Troubleshooting

### Issue: "No mermaid renderer available"

**Cause:** Neither npm nor mmdc is installed

**Solution:**
Install Node.js (includes npm):

```bash
# macOS
brew install node

# Ubuntu/Debian
sudo apt install nodejs npm

# Or install mermaid-cli directly
npm install -g @mermaid-js/mermaid-cli
```

Verify:
```bash
npm --version  # Should show version number
```

### Issue: First diagram generation is slow

**Cause:** npx downloading mermaid-cli package (~100MB) on first use

**Solution:**
- This only happens once per machine - package is cached in `~/.npm/_npx`
- Subsequent diagrams generate in ~300ms using the cached package
- Optional: Install globally for instant execution: `npm install -g @mermaid-js/mermaid-cli`

**Check cache**:
```bash
ls ~/.npm/_npx/@mermaid-js/mermaid-cli/
```

### Issue: Environment variables not applied

**Cause:** Variables not exported or not visible to Claude process

**Solution:**

1. Verify variable is set:
```bash
echo $MERMAID_THEME  # Should show your value
```

2. If empty, export it:
```bash
export MERMAID_THEME=dark
```

3. For permanent configuration, add to shell config:
```bash
echo 'export MERMAID_THEME=dark' >> ~/.zshrc
source ~/.zshrc
```

4. Restart Claude Code to pick up new environment

### Issue: Custom config file not working

**Cause:** File path incorrect or invalid JSON

**Solution:**

1. Verify file exists:
```bash
cat $MERMAID_CONFIG  # Should show your config
```

2. Validate JSON syntax:
```bash
cat $MERMAID_CONFIG | jq .  # Should pretty-print without errors
```

3. Use absolute path:
```bash
export MERMAID_CONFIG="$HOME/.config/mermaid/config.json"
```

### Issue: Diagram looks different than expected

**Cause:** Environment variables overriding your request

**Solution:**
Check current settings:
```bash
env | grep MERMAID
```

Temporarily unset to use defaults:
```bash
unset MERMAID_THEME
unset MERMAID_BG
/diagram
```

### Issue: "mmdc: command not found" (legacy)

**Cause:** Old plugin version that required global installation

**Solution:**
```bash
# Update plugin
cd /path/to/cc-plugins/mermaid-viz
git pull

# Or continue using global installation (still supported)
npm install -g @mermaid-js/mermaid-cli
```

## Technical Details

### How It Works

1. **Mermaid Code Generation**: Claude generates appropriate Mermaid syntax based on your request
2. **File Creation**: Code is written to `/tmp/mermaid-diagram-{timestamp}.mmd`
3. **Tool Detection**: Automatically selects rendering tool:
   - Priority 1: `mmdc` (if installed globally) - Direct execution, ~50ms
   - Priority 2: `npx -y @mermaid-js/mermaid-cli` (universal fallback) - ~300ms after cache
4. **Configuration Loading**: Reads environment variables:
   - `MERMAID_THEME` (default: `default`)
   - `MERMAID_BG` (default: `transparent`)
   - `MERMAID_CONFIG`, `MERMAID_WIDTH`, `MERMAID_HEIGHT`, `MERMAID_SCALE` (optional)
5. **PNG Rendering**: Selected tool converts Mermaid to PNG with user configuration:
   - Theme and background from environment variables
   - Custom config file if specified
   - Size and scale adjustments if specified
6. **Auto-caching**: npx automatically caches mermaid-cli after first download (~100MB in `~/.npm/_npx`)
7. **Display**: macOS `open` command launches the PNG in your default image viewer
8. **Cleanup**: Files remain in `/tmp` for reference but are automatically cleaned by the system

### Configuration Precedence

When multiple configuration sources exist, they are applied in this order (later overrides earlier):

1. mermaid-cli defaults (built-in)
2. Custom config file (if `MERMAID_CONFIG` is set)
3. Environment variables (e.g., `MERMAID_THEME`, `MERMAID_BG`)
4. Command-line arguments (from skill/command logic)

Example: If your config file sets `theme: "forest"` but `MERMAID_THEME=dark` is set, dark theme is used

### File Locations

Generated files follow this pattern:
```
/tmp/mermaid-diagram-{unix-timestamp}.mmd  # Mermaid source
/tmp/mermaid-diagram-{unix-timestamp}.png  # Rendered image
```

Example:
```
/tmp/mermaid-diagram-1706382451.mmd
/tmp/mermaid-diagram-1706382451.png
```

### Customization Options

The plugin supports these rendering customizations through natural language:

- **Background color**: "white background" → `-b white`
- **Size**: "large diagram" → `-w 1600 -s 2`
- **Resolution**: "high resolution" → `-s 2` or `-s 3`

### Platform Support

**Fully supported:**
- ✅ macOS (using `open` command)
- ✅ Linux (using `xdg-open` command)
- ✅ Windows (using `start` command via Git Bash/Cygwin/WSL)

Diagrams automatically open in your default image viewer on all platforms.

## Configuration

No configuration is required. The skill is automatically available once the plugin is installed.

### Optional: Custom Rendering Preferences

You can customize rendering by specifying preferences in your requests:

```
Create a flowchart with white background and high resolution.
```

```
Generate a sequence diagram optimized for dark mode viewing.
```

## Best Practices

### DO ✓

- Use descriptive node labels for clarity
- Keep diagrams focused (5-15 nodes optimal)
- Choose the right diagram type for your content
- Request transparent backgrounds for versatility
- Ask Claude to fix syntax errors rather than manual editing

### DON'T ✗

- Create overly complex diagrams (>20 nodes) - split into multiple diagrams instead
- Use very long text in labels - keep under 30 characters
- Mix multiple diagram types in one chart
- Manually edit generated Mermaid code - ask Claude to regenerate instead

## Contributing

Contributions are welcome! To improve the plugin:

1. Fork the repository
2. Create a feature branch
3. Add improvements to the skill file or documentation
4. Submit a pull request

### Areas for Contribution

- Linux and Windows platform support
- Additional rendering options
- Diagram templates and patterns
- Performance optimizations
- Integration with other tools

## License

MIT License - see LICENSE file for details

## Author

**Nick Huang**
- Email: nick12703990@gmail.com
- GitHub: [@musingfox](https://github.com/musingfox)

## Changelog

### Version 2.0.0 (2026-01-30)

**Major Features:**
- ✨ **8 Beautiful Color Schemes** - Tokyo Night, Nord, Catppuccin (Mocha/Latte), Dracula, GitHub (Dark/Light), Solarized Dark
- ✨ **Interactive Theme Selection** - New `mermaid-theme` skill for easy configuration
- ✨ **SVG Output Support** - Vector format with infinite zoom and smaller file sizes
- ✨ **Cross-Platform Support** - Works on macOS, Linux, and Windows
- 🔧 **Simplified Configuration** - Only 2 environment variables (down from 6)
- 🔧 **Dynamic Theme Generation** - No manual JSON config files needed
- 🎨 **Custom Color Support** - Define your own primary/secondary/text colors
- 📚 **Updated Documentation** - Complete guide for themes and SVG output

**Breaking Changes:**
- Old environment variables (`MERMAID_THEME`, `MERMAID_BG`, `MERMAID_CONFIG`, `MERMAID_WIDTH`, `MERMAID_HEIGHT`, `MERMAID_SCALE`) are deprecated
- Use `MERMAID_COLOR_SCHEME` and `MERMAID_OUTPUT_FORMAT` instead
- Backward compatibility: Unset variables use sensible defaults

### Version 1.0.0 (2026-01-27)

- Initial release
- Support for all major Mermaid diagram types
- Automatic PNG rendering and display
- macOS support with `open` command
- Comprehensive documentation and examples

## Related Resources

- [Mermaid Documentation](https://mermaid.js.org/)
- [Mermaid Live Editor](https://mermaid.live)
- [mermaid-cli on GitHub](https://github.com/mermaid-js/mermaid-cli)
- [Claude Code Documentation](https://docs.anthropic.com/claude/docs)

## Support

For issues, questions, or suggestions:

- Open an issue on [GitHub](https://github.com/musingfox/cc-plugins/issues)
- Check existing issues for solutions
- Review the skill file for detailed guidance

---

**Visualize your ideas instantly!** 🎯📊
