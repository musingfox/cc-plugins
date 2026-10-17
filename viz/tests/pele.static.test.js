import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LIB = join(import.meta.dir, '../lib');
const read = rel => readFileSync(join(LIB, rel), 'utf8');

// Tokens of the Mermaid and ELK pipeline; none may survive in the viewer or the glue.
const LEGACY = [
    'mermaid@', 'layout-elk', 'registerIconPacks', 'registerLayoutLoaders', '__mermaidReady',
    'mermaidThemeConfig', 'mermaidQueue', 'mermaidQueuedPrinting', 'tagMermaidEdges', 'viz-flow',
    'beforeprint', 'afterprint', 'mermaid.initialize', 'mermaid.run', 'window.mermaid',
];

const legacyHits = text => LEGACY.filter(token => text.includes(token));

// Every pele / logos icon-pack reference must carry an exact x.y.z version.
const pinViolations = text =>
    [...text.matchAll(/(pele|@iconify-json\/logos)@([^\s"'`/)]*)/g)]
        .filter(m => !/^\d+\.\d+\.\d+$/.test(m[2]))
        .map(m => m[0]);

const inlineTargets = (text, dir) =>
    [...text.matchAll(/^[ \t]*\/\/[ \t]*@inline[ \t]+(\S+)[ \t]*$/gm)].map(m => join(dir, m[1]));

// Theme literal -> page token it must equal. The first declaration wins, so the
// print block (declared later) does not shadow the screen palette.
const PALETTE = [
    ['--pele-fg', '--fg'], ['--pele-muted', '--muted'], ['--pele-line', '--muted'],
    ['--pele-surface', '--surface-warm'], ['--pele-surface-alt', '--surface'], ['--pele-bg', '--surface'],
    ['--pele-border', '--accent'], ['--pele-accent', '--accent'],
    ['--pele-series-1', '--accent'], ['--pele-series-2', '--success'],
    ['--pele-series-3', '--danger'], ['--pele-series-4', '--warn'],
];
const RULES = [['.pele-cluster > rect', 'stroke', '--border'], ['.pele-error', 'color', '--danger']];
const TOKENS_SHARED = [...new Set(PALETTE.map(([, token]) => token))];

const rootTokens = html => {
    const block = html.match(/:root\s*\{([^}]*)\}/)[1];
    return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
};
const lastHex = value => (value.match(/#[0-9a-fA-F]{6}\b/g) || []).at(-1)?.toLowerCase();

function themeDrift(tokens, themeCss) {
    const messages = [];
    const declared = prop => {
        const m = themeCss.match(new RegExp(`${prop}:\\s*([^;]+);`));
        return m ? m[1].trim() : undefined;
    };
    const check = (name, literal, token) => {
        if (!(token in tokens)) return messages.push(`${token} is missing from :root, so ${name} cannot be checked`);
        if (literal !== lastHex(tokens[token])) messages.push(`${name} is ${literal} but ${token} is ${tokens[token]}`);
    };
    for (const [prop, token] of PALETTE) {
        const value = declared(prop);
        check(prop, value === undefined ? undefined : lastHex(value), token);
    }
    for (const [selector, prop, token] of RULES) {
        const rule = themeCss.match(new RegExp(`${selector.replace(/[.>]/g, c => '\\' + c)}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
        const literal = (rule.match(new RegExp(`${prop}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1]?.toLowerCase();
        check(`${selector} ${prop}`, literal, token);
    }
    return messages;
}

const PELE_TAG = '<script src="https://cdn.jsdelivr.net/npm/pele@1.6.0/dist/pele.global.js"></script>';

describe('TemplateRendersDiagramsOnLoad', () => {
    test('T7: legacy tokens are reported on the old loader and absent from the real files', () => {
        expect(legacyHits('<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>')).toEqual(['mermaid@']);
        expect(legacyHits("addEventListener('beforeprint'")).toEqual(['beforeprint']);
        const template = read('template.html');
        expect(legacyHits(template)).toEqual([]);
        expect(legacyHits(read('pele-glue.js'))).toEqual([]);
        expect(template).toContain('code.language-mermaid');
        expect(template).toContain('mermaid-shell');
    });

    test('T8: unpinned pele and logos references are reported; the pinned Pele tag appears once, before the glue', () => {
        for (const bad of ['pele@1', 'pele@latest', 'pele@^1.6.0', '@iconify-json/logos@1']) {
            expect(pinViolations(bad).length).toBe(1);
        }
        expect(pinViolations('pele@1.6.0')).toEqual([]);
        const template = read('template.html');
        expect(pinViolations(template)).toEqual([]);
        expect(pinViolations(read('pele-glue.js'))).toEqual([]);
        expect(template.split(PELE_TAG).length - 1).toBe(1);
        expect(template).not.toMatch(/<script[^>]*pele\.global\.js[^>]*(type|async|defer)=/);
        expect(template.indexOf(PELE_TAG)).toBeLessThan(template.indexOf('// @inline pele-glue.js'));
    });

    test('T9: every @inline target in the template exists under viz/lib', () => {
        const targets = inlineTargets(read('template.html'), LIB);
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) expect(existsSync(target)).toBe(true);
    });
});

describe('FeedbackRendersDiagrams', () => {
    const RECIPES = join(LIB, 'recipes');

    test('T4: the feedback page has no legacy token and pins the same Pele tag as the viewer', () => {
        const feedback = read('recipes/feedback.html');
        expect(legacyHits(feedback)).toEqual([]);
        expect(pinViolations(feedback)).toEqual([]);
        expect(feedback.split(PELE_TAG).length - 1).toBe(1);
        expect(feedback.indexOf(PELE_TAG)).toBeLessThan(feedback.indexOf('// @inline ../pele-glue.js'));
    });

    test('T5: the feedback page keeps the mermaid fence hook and every @inline target exists', () => {
        const feedback = read('recipes/feedback.html');
        expect(feedback).toContain('code.language-mermaid');
        const targets = inlineTargets(feedback, RECIPES);
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) expect(existsSync(target)).toBe(true);
    });
});

describe('DiagramPalette', () => {
    const TEMPLATE = read('template.html');
    const FEEDBACK = read('recipes/feedback.html');
    const THEME = read('pele-theme.css');

    test('T7: the real page tokens and theme css agree', () => {
        expect(themeDrift(rootTokens(TEMPLATE), THEME)).toEqual([]);
        expect(themeDrift(rootTokens(FEEDBACK), THEME)).toEqual([]);
    });

    test('T8: a changed border literal is one drift message naming --pele-border and --accent', () => {
        const drifted = THEME.replace('--pele-border: #fd971f;', '--pele-border: #fd971e;');
        const messages = themeDrift(rootTokens(TEMPLATE), drifted);
        expect(messages.length).toBe(1);
        expect(messages[0]).toContain('--pele-border');
        expect(messages[0]).toContain('--accent');
    });

    test('T9: a token missing from the supplied map is reported, not thrown', () => {
        const tokens = rootTokens(TEMPLATE);
        delete tokens['--danger'];
        const messages = themeDrift(tokens, THEME);
        expect(messages.length).toBeGreaterThan(0);
        expect(messages.some(m => m.includes('--danger'))).toBe(true);
    });

    test('T10: the shared :root tokens have equal values in template.html and feedback.html', () => {
        const a = rootTokens(TEMPLATE), b = rootTokens(FEEDBACK);
        for (const token of TOKENS_SHARED) {
            expect(a[token]).toBeDefined();
            expect(b[token]).toBe(a[token]);
        }
    });
});

describe('DiagramTypesGuidance', () => {
    const TYPES = readFileSync(join(import.meta.dir, '../skills/viz-render/references/diagram-types.md'), 'utf8');
    const SKILL = readFileSync(join(import.meta.dir, '../skills/viz-render/SKILL.md'), 'utf8');
    const README = readFileSync(join(import.meta.dir, '../../README.md'), 'utf8');

    test('T1: the diagram reference has no ELK mention and no init directive', () => {
        expect(TYPES).not.toMatch(/elk/i);
        expect(TYPES).not.toContain('%%{init');
    });

    test('T2: the Contents line names the flowchart without ELK', () => {
        const contents = TYPES.split('\n').find(line => line.startsWith('1. Flowchart'));
        expect(contents).toContain('Flowchart / Graph');
        expect(contents).not.toContain('ELK');
    });

    test('T3: the diagram reference still documents Pele and keeps at least 10 mermaid fences', () => {
        expect(TYPES).toContain('Pele');
        expect((TYPES.match(/^```mermaid/gm) || []).length).toBeGreaterThanOrEqual(10);
    });

    test('T4: the skill names Pele and has no ELK mention', () => {
        expect(SKILL).toContain('Pele');
        expect(SKILL).not.toMatch(/elk/i);
    });

    test('T5: the README lists Pele instead of Mermaid.js', () => {
        expect(README).not.toContain('Mermaid.js');
        expect(README).toContain('Pele');
    });
});
