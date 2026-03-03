#!/usr/bin/env bun
/**
 * Pre-render mermaid code blocks in a markdown file to inline SVGs.
 *
 * Usage:
 *   bun run render-beauty.ts <input.md>
 *
 * Reads the markdown file, replaces all ```mermaid code blocks with
 * <div class="mermaid-rendered">SVG</div>, and writes the result to stdout.
 *
 * Environment variables:
 *   MERMAID_COLOR_SCHEME  — built-in theme key (default: tokyo-night)
 *   MERMAID_PRIMARY_COLOR — bg color when scheme=custom
 *   MERMAID_TEXT_COLOR    — fg color when scheme=custom
 */

import { renderMermaidSVG, THEMES } from "beautiful-mermaid";
import { readFileSync } from "node:fs";

const inputFile = process.argv[2];
if (!inputFile) {
  console.error("Usage: bun run render-beauty.ts <input.md>");
  process.exit(1);
}

// Read markdown source
const markdown = readFileSync(inputFile, "utf-8");

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
  console.error(`Unknown color scheme "${scheme}", falling back to tokyo-night`);
  theme = THEMES["tokyo-night"];
}

// Replace ```mermaid ... ``` blocks with rendered SVGs
const processed = markdown.replace(
  /```mermaid\n([\s\S]*?)```/g,
  (_match, code: string) => {
    try {
      const svg = renderMermaidSVG(code.trim(), theme);
      return `<div class="mermaid-rendered">${svg}</div>`;
    } catch (err) {
      // If rendering fails, keep the original code block
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Warning: failed to render mermaid block: ${message}`);
      return _match;
    }
  }
);

// Write processed markdown to stdout
process.stdout.write(processed);
