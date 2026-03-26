#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Base64 UTF-8 encoding
function encodeBase64UTF8(text) {
    return Buffer.from(text, 'utf-8').toString('base64');
}
async function startHTTPServer(html) {
    let resolvePromise;
    const waitForDone = new Promise((resolve) => {
        resolvePromise = resolve;
    });
    const server = http.createServer((req, res) => {
        // GET / -> serve HTML
        if (req.method === 'GET' && req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
            return;
        }
        // POST /done -> receive edited content
        if (req.method === 'POST' && req.url === '/done') {
            let body = '';
            req.on('data', (chunk) => { body += chunk; });
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (!data.content) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing content field' }));
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: true }));
                    resolvePromise(data.content);
                    // Close server after response is sent
                    setImmediate(() => server.close());
                }
                catch (err) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
            return;
        }
        // All other routes -> 404
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
    });
    // Listen on dynamic port and wait for it to be ready
    await new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const port = server.address().port;
    return { port, server, waitForDone };
}
// Open browser
function openBrowser(url) {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
}
// Create MCP server
const server = new McpServer({
    name: 'viz-editor',
    version: '0.1.0',
});
// Register edit-document tool
server.registerTool('edit-document', {
    description: 'Open a visual markdown editor in the browser. Blocks until user clicks Done.',
    inputSchema: z.object({
        content: z.string().describe('The markdown content to edit'),
        title: z.string().optional().describe('The document title (optional)'),
    }),
}, async ({ content, title }) => {
    try {
        // Read HTML template
        const templatePath = join(__dirname, 'client', 'index.html');
        let html = await readFile(templatePath, 'utf-8');
        // Replace placeholders
        const encodedContent = encodeBase64UTF8(content);
        const docTitle = title || 'Edit Document';
        html = html.replace(/__CONTENT_BASE64__/g, encodedContent);
        html = html.replace(/__TITLE__/g, docTitle);
        // Start HTTP server
        const { port, waitForDone } = await startHTTPServer(html);
        // Open browser
        const url = `http://127.0.0.1:${port}/`;
        openBrowser(url);
        // Wait for user to click Done
        const editedContent = await waitForDone;
        // Return edited content
        return {
            content: [{ type: 'text', text: editedContent }],
        };
    }
    catch (error) {
        throw new Error(`Failed to start editor: ${error}`);
    }
});
// Start server
const transport = new StdioServerTransport();
server.connect(transport);
