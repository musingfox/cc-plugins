#!/usr/bin/env node
/**
 * Manual integration test - starts MCP server and calls edit-document tool
 * This will open a browser window for you to test the editor manually
 */

import { spawn } from 'node:child_process';

console.log('Starting viz-editor MCP server...\n');

const mcpProcess = spawn('node', ['dist/index.js'], {
  cwd: import.meta.dirname,
  stdio: ['pipe', 'pipe', 'inherit'],
});

let responseId = 0;

mcpProcess.stdout.on('data', (data) => {
  console.log('[Server response]', data.toString());
});

function sendRequest(method, params = {}) {
  const id = ++responseId;
  const request = {
    jsonrpc: '2.0',
    id,
    method,
    params,
  };
  console.log(`[Sending] ${method}`, JSON.stringify(params, null, 2));
  mcpProcess.stdin.write(JSON.stringify(request) + '\n');
}

// Wait a bit for server to start
setTimeout(() => {
  console.log('\n1. Sending initialize request...');
  sendRequest('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'manual-test', version: '1.0.0' },
  });
}, 500);

setTimeout(() => {
  console.log('\n2. Calling edit-document tool...');
  console.log('   Browser should open with the editor.\n');

  const testContent = `# Test Document

This is a **test** document for the viz-editor.

## Features to test

- [ ] Edit markdown on the left
- [ ] See live preview on the right
- [ ] Syntax highlighting for code blocks
- [ ] Math rendering: $E = mc^2$
- [ ] Mermaid diagrams

## Code Example

\`\`\`javascript
function hello(name) {
  console.log(\`Hello, \${name}!\`);
}
\`\`\`

## Math

Block math:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$

## Diagram

\`\`\`mermaid
graph TD
    A[Start] --> B{Test?}
    B -->|Yes| C[Edit]
    B -->|No| D[Done]
    C --> D
\`\`\`

## Instructions

1. Edit this content in the left pane
2. Watch the preview update in real-time
3. Test zoom controls on the diagram
4. Click "Done — Send back to AI" when finished
5. Check the terminal for the edited output
`;

  sendRequest('tools/call', {
    name: 'edit-document',
    arguments: {
      content: testContent,
      title: 'Manual Test Document',
    },
  });
}, 1500);

// Auto-kill after 5 minutes (in case user forgets to close)
setTimeout(() => {
  console.log('\n[Timeout] Killing server after 5 minutes...');
  mcpProcess.kill();
  process.exit(0);
}, 300000);

process.on('SIGINT', () => {
  console.log('\n[Interrupted] Killing server...');
  mcpProcess.kill();
  process.exit(0);
});
