#!/usr/bin/env bun
/**
 * Render a .mmd file to SVG using beautiful-mermaid.
 *
 * Usage:
 *   bun run render-beauty.ts <input.mmd>
 *
 * Environment variables:
 *   MERMAID_COLOR_SCHEME  — built-in theme key (default: tokyo-night)
 *   MERMAID_PRIMARY_COLOR — bg color when scheme=custom
 *   MERMAID_TEXT_COLOR    — fg color when scheme=custom
 */

import { renderMermaidSVG, THEMES } from "beautiful-mermaid";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: bun run render-beauty.ts <input.mmd>");
  process.exit(1);
}

// Read mermaid source
const code = readFileSync(inputFile, "utf-8");

// Resolve theme from environment
const scheme = process.env.MERMAID_COLOR_SCHEME || "tokyo-night";

let theme: Parameters<typeof renderMermaidSVG>[1];
if (scheme === "custom") {
  const bg = process.env.MERMAID_PRIMARY_COLOR || "#1a1b26";
  const fg = process.env.MERMAID_TEXT_COLOR || "#a9b1d6";
  theme = { bg, fg };
} else if (scheme in THEMES) {
  theme = THEMES[scheme as keyof typeof THEMES];
} else {
  // Unknown scheme — fall back to tokyo-night
  console.error(`Unknown color scheme "${scheme}", falling back to tokyo-night`);
  theme = THEMES["tokyo-night"];
}

// Render SVG
const svg = renderMermaidSVG(code, theme);

// Write output
const timestamp = Math.floor(Date.now() / 1000);
const outputFile = `/tmp/mermaid-diagram-${timestamp}.svg`;
writeFileSync(outputFile, svg, "utf-8");
console.log(outputFile);

// Open in viewer (platform detection)
const platform = process.platform;
try {
  if (platform === "darwin") {
    execFileSync("open", [outputFile]);
  } else if (platform === "linux") {
    execFileSync("xdg-open", [outputFile]);
  } else if (platform === "win32") {
    execFileSync("cmd", ["/c", "start", "", outputFile]);
  }
} catch {
  // Viewer open is best-effort; file path already printed
}
