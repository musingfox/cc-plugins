#!/usr/bin/env node
import { spawn } from 'node:child_process';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test utilities
let testCount = 0;
let passCount = 0;

async function test(name, fn) {
  testCount++;
  console.log(`\n[Test ${testCount}] ${name}`);
  try {
    await fn();
    passCount++;
    console.log('✓ PASS');
  } catch (error) {
    console.log(`✗ FAIL: ${error.message}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

// Base64 encoding function (same as server)
function encodeBase64UTF8(text) {
  return Buffer.from(text, 'utf-8').toString('base64');
}

// HTTP Server start function (same as server)
async function startHTTPServer(html) {
  let resolvePromise;
  const waitForDone = new Promise((resolve) => {
    resolvePromise = resolve;
  });

  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

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
          setImmediate(() => server.close());
        } catch (err) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON' }));
        }
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  // Wait for server to start listening
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const port = server.address().port;

  return { port, server, waitForDone };
}

// Test suite
async function runTests() {
  console.log('=== viz-editor Test Suite ===\n');

  // TC4: Base64 encode "中文" → "5Lit5paH"
  test('TC4: Base64 UTF-8 encoding (Chinese)', () => {
    const result = encodeBase64UTF8('中文');
    assertEqual(result, '5Lit5paH', 'Chinese text encoding failed');
  });

  // TC4: Base64 encode "Hello" → "SGVsbG8="
  test('TC4: Base64 UTF-8 encoding (English)', () => {
    const result = encodeBase64UTF8('Hello');
    assertEqual(result, 'SGVsbG8=', 'English text encoding failed');
  });

  // TC2: HTTP server starts on dynamic port → port > 0
  await test('TC2: HTTP server starts on dynamic port', async () => {
    const { port, server } = await startHTTPServer('<html>test</html>');
    assert(port > 0, 'Port should be greater than 0');
    server.close();
  });

  // TC8: Two servers start → different ports
  await test('TC8: Two servers get different ports', async () => {
    const server1 = await startHTTPServer('<html>server1</html>');
    const server2 = await startHTTPServer('<html>server2</html>');
    assert(server1.port !== server2.port, 'Servers should have different ports');
    server1.server.close();
    server2.server.close();
  });

  // TC3: POST /done with valid JSON → Promise resolves
  await test('TC3: POST /done with valid content resolves Promise', async () => {
    const { port, server, waitForDone } = await startHTTPServer('<html>test</html>');

      // Send POST request
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/done',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        assertEqual(res.statusCode, 200, 'Response should be 200');
      });

    req.write(JSON.stringify({ content: 'edited text' }));
    req.end();

    const result = await waitForDone;
    assertEqual(result, 'edited text', 'Promise should resolve with edited text');
  });

  // TC4: POST /done with empty object → 400 error
  await test('TC4: POST /done with missing content field returns 400', async () => {
    const { port, server } = await startHTTPServer('<html>test</html>');

    await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/done',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        assertEqual(res.statusCode, 400, 'Response should be 400');
        server.close();
        resolve();
      });

      req.write(JSON.stringify({}));
      req.end();
    });
  });

  // TC5: POST /done with malformed JSON → 400 error
  await test('TC5: POST /done with malformed JSON returns 400', async () => {
    const { port, server } = await startHTTPServer('<html>test</html>');

    await new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        path: '/done',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }, (res) => {
        assertEqual(res.statusCode, 400, 'Response should be 400');
        server.close();
        resolve();
      });

      req.write('not valid json{');
      req.end();
    });
  });

  // Test HTML template rendering
  await test('TC7: HTML template contains placeholder replacement markers', async () => {
    const templatePath = join(__dirname, 'dist', 'client', 'index.html');
    const html = await readFile(templatePath, 'utf-8');
    assert(html.includes('window.__CONTENT_BASE64__'), 'HTML should contain Base64 placeholder');
  });

  // MCP Server integration test - start server and check tool list
  console.log('\n[Integration Test] Starting MCP server and checking tool list...');
  const mcpProcess = spawn('node', ['dist/index.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  let responseBuffer = '';

  mcpProcess.stdout.on('data', (data) => {
    responseBuffer += data.toString();
  });

  // Send initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' },
    },
  };

  mcpProcess.stdin.write(JSON.stringify(initRequest) + '\n');

  // Wait for initialize response
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Send tools/list request
  const toolsListRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  };

  mcpProcess.stdin.write(JSON.stringify(toolsListRequest) + '\n');

  // Wait for response
  await new Promise((resolve) => setTimeout(resolve, 500));

  await test('MCP Server exposes edit-document tool', () => {
    assert(responseBuffer.includes('edit-document'), 'Server should expose edit-document tool');
    assert(responseBuffer.includes('visual markdown editor'), 'Tool description should be present');
  });

  mcpProcess.kill();

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testCount}`);
  console.log(`Passed: ${passCount}`);
  console.log(`Failed: ${testCount - passCount}`);

  if (passCount === testCount) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed.');
    process.exit(1);
  }
}

runTests().catch((error) => {
  console.error('Test suite error:', error);
  process.exit(1);
});
