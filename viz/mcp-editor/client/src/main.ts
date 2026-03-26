import { marked } from 'marked';
import DOMPurify from 'dompurify';
import mermaid from 'mermaid';
import hljs from 'highlight.js';
import katex from 'katex';

// Import CSS
import 'highlight.js/styles/atom-one-dark.css';
import 'katex/dist/katex.min.css';

// DOM elements
const editor = document.getElementById('editor') as HTMLTextAreaElement;
const preview = document.getElementById('preview') as HTMLDivElement;
const doneBtn = document.getElementById('done-btn') as HTMLButtonElement;
const successMsg = document.getElementById('success-msg') as HTMLDivElement;

// Debounce timer
let previewDebounceTimer: number | null = null;

// Base64 UTF-8 decoder
function base64DecodeUTF8(base64: string): string {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new TextDecoder('utf-8').decode(bytes);
}

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: false,
});

// Mermaid render counter for unique IDs
let mermaidCounter = 0;

// Rendering function - ported from viz-mcp-app with DOMPurify sanitization
async function renderPreview(content: string): Promise<void> {
  // Render markdown with highlight.js
  const html = await marked.parse(content, {
    async: true,
    highlight: function (code: string, lang: string) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  } as any);

  // Sanitize with DOMPurify - all innerHTML assignments use DOMPurify
  const cleanHtml = DOMPurify.sanitize(html, {
    ADD_TAGS: ['pre', 'span'],
    ADD_ATTR: ['class', 'language', 'style'],
  });
  preview.innerHTML = cleanHtml;

  // KaTeX: block math $$...$$ (using DOMPurify)
  preview.querySelectorAll('p, li, td, th, blockquote').forEach((el) => {
    if (!el.textContent?.includes('$$')) return;
    el.innerHTML = DOMPurify.sanitize(
      el.innerHTML.replace(/\$\$([\s\S]*?)\$\$/g, (_match, tex: string) => {
        try {
          return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
        } catch { return _match; }
      }),
    );
  });

  // KaTeX: inline math $...$ (using DOMPurify)
  preview.querySelectorAll('p, li, td, th, blockquote').forEach((el) => {
    if (!el.textContent?.includes('$')) return;
    el.innerHTML = DOMPurify.sanitize(
      el.innerHTML.replace(/(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g, (_match, tex: string) => {
        try {
          return katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
        } catch { return _match; }
      }),
    );
  });

  // Wrap code blocks with language header + copy button
  preview.querySelectorAll('pre').forEach((pre) => {
    if (pre.closest('.mermaid-shell')) return;
    if (pre.parentElement?.classList.contains('code-block')) return;

    const code = pre.querySelector('code');
    let lang = '';
    if (code) {
      const m = code.className.match(/language-(\w+)/);
      if (m) lang = m[1];
    }

    if (lang && lang !== 'mermaid') {
      const wrapper = document.createElement('div');
      wrapper.className = 'code-block';
      const header = document.createElement('div');
      header.className = 'code-header';
      const langSpan = document.createElement('span');
      langSpan.textContent = lang;
      header.appendChild(langSpan);
      const copyBtn = document.createElement('button');
      copyBtn.className = 'copy-btn';
      copyBtn.textContent = 'copy';
      copyBtn.addEventListener('click', () => {
        const text = code ? code.textContent : pre.textContent;
        navigator.clipboard.writeText(text || '').then(() => {
          copyBtn.textContent = 'copied!';
          setTimeout(() => { copyBtn.textContent = 'copy'; }, 1500);
        });
      });
      header.appendChild(copyBtn);
      wrapper.appendChild(header);
      pre.parentNode!.insertBefore(wrapper, pre);
      wrapper.appendChild(pre);
    }
  });

  // Zoom controls factory
  function createZoomControls(): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'zoom-controls';
    [
      { action: 'zoom-in', title: 'Zoom in', label: '+' },
      { action: 'zoom-out', title: 'Zoom out', label: '\u2212' },
      { action: 'zoom-reset', title: 'Reset', label: '1:1' },
    ].forEach((item) => {
      const btn = document.createElement('button');
      btn.dataset.action = item.action;
      btn.title = item.title;
      btn.textContent = item.label;
      controls.appendChild(btn);
    });
    return controls;
  }

  // Convert mermaid code blocks to interactive shells
  preview.querySelectorAll('code.language-mermaid').forEach((codeBlock) => {
    const pre = codeBlock.parentElement!;
    const wrapper = pre.closest('.code-block');
    const shell = document.createElement('div');
    shell.className = 'mermaid-shell';
    shell.appendChild(createZoomControls());
    const viewport = document.createElement('div');
    viewport.className = 'mermaid-viewport';
    const mermaidDiv = document.createElement('div');
    mermaidDiv.className = 'mermaid';
    mermaidDiv.id = `mermaid-${++mermaidCounter}`;
    mermaidDiv.textContent = codeBlock.textContent || '';
    viewport.appendChild(mermaidDiv);
    shell.appendChild(viewport);
    if (wrapper) {
      wrapper.replaceWith(shell);
    } else {
      pre.replaceWith(shell);
    }
  });

  // Wrap tables
  preview.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.parentNode!.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  // Initialize mermaid rendering
  mermaid.initialize({
    startOnLoad: false,
    theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
    securityLevel: 'strict',
  });

  const mermaidNodes = Array.from(preview.querySelectorAll('.mermaid'));
  if (mermaidNodes.length > 0) {
    try {
      await mermaid.run({ nodes: mermaidNodes as HTMLElement[] });
    } catch (e) {
      console.error('Mermaid render error:', e);
    }
  }

  // Add zoom/pan to mermaid shells
  preview.querySelectorAll('.mermaid-shell').forEach((shell) => {
    const viewport = shell.querySelector('.mermaid-viewport') as HTMLElement;
    const canvas = viewport?.querySelector('.mermaid') as HTMLElement;
    if (!canvas) return;

    let scale = 1, panX = 0, panY = 0, startX = 0, startY = 0;

    function apply() {
      canvas.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
    }

    shell.querySelectorAll('.zoom-controls button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = (btn as HTMLElement).dataset.action;
        if (act === 'zoom-in') scale = Math.min(scale * 1.3, 5);
        else if (act === 'zoom-out') scale = Math.max(scale / 1.3, 0.2);
        else if (act === 'zoom-reset') { scale = 1; panX = 0; panY = 0; }
        apply();
      });
    });

    viewport.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        scale = Math.max(0.2, Math.min(5, scale * (e.deltaY > 0 ? 0.9 : 1.1)));
        apply();
      }
    }, { passive: false });

    viewport.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      startX = e.clientX - panX;
      startY = e.clientY - panY;

      function onMove(ev: MouseEvent) {
        panX = ev.clientX - startX;
        panY = ev.clientY - startY;
        canvas.style.transition = 'none';
        apply();
      }

      function onUp() {
        canvas.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// Debounced preview update
function updatePreview(): void {
  if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
  previewDebounceTimer = window.setTimeout(() => {
    renderPreview(editor.value);
  }, 300);
}

// Editor input handler
editor.addEventListener('input', () => {
  updatePreview();
});

// Done button handler
doneBtn.addEventListener('click', async () => {
  try {
    doneBtn.disabled = true;
    doneBtn.textContent = 'Sending...';

    const response = await fetch('/done', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: editor.value }),
    });

    if (response.ok) {
      editor.disabled = true;
      successMsg.classList.add('show');
    } else {
      doneBtn.disabled = false;
      doneBtn.textContent = 'Done — Send back to AI';
      alert('Failed to send content. Please try again.');
    }
  } catch (error) {
    doneBtn.disabled = false;
    doneBtn.textContent = 'Done — Send back to AI';
    alert('Failed to send content. Please try again.');
  }
});

// Initialize content from Base64
const contentBase64 = (window as any).__CONTENT_BASE64__;
if (contentBase64 && contentBase64 !== '__CONTENT_BASE64__') {
  const decodedContent = base64DecodeUTF8(contentBase64);
  editor.value = decodedContent;
  renderPreview(decodedContent);
}
