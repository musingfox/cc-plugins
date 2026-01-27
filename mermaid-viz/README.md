# Mermaid Visualization Plugin

A Claude Code plugin that enables high-quality diagram visualization using Mermaid. Generate flowcharts, sequence diagrams, class diagrams, state machines, and more—all automatically rendered as PNG images and displayed in your default viewer.

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
2. **Automatic rendering** - Claude generates Mermaid code and renders it to PNG
3. **Instant display** - Image opens automatically in your default viewer
4. **High quality** - Professional PNG output with transparent background

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
- 🎨 **High quality** - PNG output with customizable resolution and background
- 🔄 **Stay in flow** - No need to leave your terminal or switch tools
- 📝 **Comprehensive** - Supports all major Mermaid diagram types
- 🎯 **Simple** - Natural language requests, no manual rendering

## Installation

### Prerequisites

This plugin requires [mermaid-cli](https://github.com/mermaid-js/mermaid-cli) to render diagrams:

```bash
npm install -g @mermaid-js/mermaid-cli
```

Verify installation:
```bash
mmdc --version
```

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
3. Render it to a PNG image using `mmdc`
4. Automatically open the image in your default viewer (Preview on macOS)
5. Inform you that the diagram is ready

The temporary files are saved in `/tmp` and will be automatically cleaned up by your system.

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

### Issue: "mmdc: command not found"

**Cause:** mermaid-cli is not installed

**Solution:**
```bash
npm install -g @mermaid-js/mermaid-cli
```

If you don't have npm:
```bash
# Install Node.js and npm first
brew install node
```

### Issue: Diagram renders but looks incorrect

**Cause:** Invalid Mermaid syntax

**Solution:**
- Ask Claude to fix the syntax
- Test syntax at https://mermaid.live
- Check the [Mermaid documentation](https://mermaid.js.org/)

### Issue: Image doesn't open automatically

**Cause:** macOS `open` command issue

**Solution:**
```bash
# Manually open the diagram
open /tmp/mermaid-diagram-*.png
```

Check that you have a default app for PNG files:
```bash
# Set Preview as default
duti -s com.apple.Preview public.png all
```

### Issue: Diagram is too small or text is hard to read

**Cause:** Default resolution may be too low

**Solution:** Request a larger diagram:
```
Create a large, high-resolution flowchart...
```

Claude will adjust rendering parameters for better readability.

### Issue: Diagram disappears when viewer closes

**Cause:** Files are in `/tmp` which may be cleaned periodically

**Solution:** If you need to keep the diagram, ask Claude:
```
Save the diagram to ~/Downloads instead of /tmp
```

## Technical Details

### How It Works

1. **Mermaid Code Generation**: Claude generates appropriate Mermaid syntax based on your request
2. **File Creation**: Code is written to `/tmp/mermaid-diagram-{timestamp}.mmd`
3. **PNG Rendering**: `mmdc` CLI tool converts Mermaid to PNG with these defaults:
   - Transparent background (`-b transparent`)
   - Automatic dimensions based on content
   - High-quality output
4. **Display**: macOS `open` command launches the PNG in your default image viewer
5. **Cleanup**: Files remain in `/tmp` for reference but are automatically cleaned by the system

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

**Currently supported:**
- ✅ macOS (using `open` command)

**Future support planned:**
- 🔄 Linux (using `xdg-open`)
- 🔄 Windows (using `start`)

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
