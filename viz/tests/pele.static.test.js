import { test, expect, describe } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

const LIB = join(import.meta.dir, '../lib');
const read = rel => readFileSync(join(LIB, rel), 'utf8');
// The three served pages, keyed by path under viz/lib.
const PAGES = Object.fromEntries(['template.html', 'recipes/feedback.html', 'recipes/pr-review.html'].map(file => [file, read(file)]));

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

// Series 1..8 follow the Musingfox hue order; each series token is a page token of the same name.
const flip = hex => hex.slice(0, -1) + (hex.at(-1) === '0' ? '1' : '0');
const SERIES = ['--orange', '--cyan', '--magenta', '--yellow', '--blue', '--red', '--green', '--purple'];

// Theme literal -> page token it must equal. The first declaration wins, so the
// print block (declared later) does not shadow the screen palette.
const PALETTE = [
    ['--pele-fg', '--fg'], ['--pele-muted', '--muted'], ['--pele-line', '--muted'],
    ['--pele-surface', '--surface-warm'], ['--pele-surface-alt', '--surface'], ['--pele-bg', '--surface'],
    ['--pele-border', '--accent'], ['--pele-accent', '--accent'],
    ['--pele-error', '--danger'], ['--pele-critical', '--danger'],
    ...SERIES.map((hue, i) => [`--pele-series-${i + 1}`, hue]),
];
const RULES = [['.pele-cluster > rect', 'stroke', '--border'], ['.pele-error', 'color', '--danger']];

// Musingfox tokens, Flexoki-based: vendored from musingfox-design-system tokens.css at DESIGN_TOKENS_COMMIT.
// The design system is a separate private repo, so the pages are checked against this copy, and
// DesignTokensMatchSource checks the copy against a local design-system checkout when there is one.
const DESIGN_TOKENS_COMMIT = 'ace204d';
const DESIGN_TOKENS = {
    '--bg': '#100f0f', '--surface': '#1c1b1a', '--surface-warm': '#282726',
    '--fg': '#f2f0e5', '--fg-2': '#cecdc3', '--muted': '#878580', '--meta': '#575653',
    '--border': '#343331', '--border-soft': '#282726',
    '--accent': '#da702c', '--accent-on': '#100f0f', '--accent-hover': '#ec8b49', '--accent-active': '#cb6120',
    '--success': '#87d3c3', '--warn': '#dfb431', '--danger': '#ce5d97',
    '--red': '#ff9baf', '--orange': '#da702c', '--yellow': '#e4b808', '--green': '#46a069',
    '--cyan': '#0fcedd', '--blue': '#098eca', '--purple': '#b491ff', '--magenta': '#bd579a',
};

// Hexes of the palette before the Musingfox adoption (screen and print); #1f1f1f is left out because the print fg keeps it.
const OLD_PALETTE = [
    '#07080a', '#181818', '#222222', '#e8e8e5', '#c4c5b5', '#75715e', '#49483e', '#2e2e2e',
    '#fd971f', '#ffb85a', '#c97608', '#98e024', '#e0d561', '#f4005f',
    '#985b13', '#5b8616', '#920039', '#86803a', '#4c2d09', '#2e430b', '#49001d', '#43401d',
];
const oldPaletteHits = text => OLD_PALETTE.filter(hex => text.toLowerCase().includes(hex));

const rootTokens = html => {
    const block = html.match(/:root\s*\{([^}]*)\}/)[1];
    return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
};
const lastHex = value => (value.match(/#[0-9a-fA-F]{6}\b/g) || []).at(-1)?.toLowerCase();

// Design-system checkout: $MUSINGFOX_DESIGN_SYSTEM, else a musingfox-design-system clone beside this repo.
const DESIGN_SYSTEM = resolve(process.env.MUSINGFOX_DESIGN_SYSTEM || join(import.meta.dir, '../../../musingfox-design-system'));
const TOKENS_CSS = join(DESIGN_SYSTEM, 'tokens.css');
const NO_DESIGN_SYSTEM = existsSync(TOKENS_CSS) ? '' : ` [skipped: no ${TOKENS_CSS}; set MUSINGFOX_DESIGN_SYSTEM to the design-system checkout]`;

// Color tokens of a tokens.css text: the :root properties whose value is a hex.
const colorTokens = css => Object.fromEntries(Object.entries(rootTokens(css))
    .filter(([, value]) => /^#[0-9a-fA-F]{6}$/.test(value)).map(([token, value]) => [token, value.toLowerCase()]));

// One message per color the design system and the vendored copy disagree on, including a token only one side has.
const sourceDrift = (source, vendored = DESIGN_TOKENS) => [...new Set([...Object.keys(vendored), ...Object.keys(source)])].flatMap(token => {
    if (!(token in source)) return [`${token} is vendored but not in tokens.css`];
    if (!(token in vendored)) return [`${token} is in tokens.css but not vendored`];
    return source[token] === vendored[token] ? [] : [`${token} is ${source[token]} in tokens.css but vendored as ${vendored[token]}`];
});

// Value of the first `prop: value;` in a CSS text, or undefined when the text does not declare it.
const decl = (css, prop) => css.match(new RegExp(`${prop}:\\s*([^;]+);`))?.[1].trim();
// Screen and print halves of pele-theme.css; print is '' when there is no print block.
const blocks = css => {
    const [screen, print = ''] = css.split('@media print');
    return { screen, print };
};

function themeDrift(tokens, themeCss) {
    const messages = [];
    const { screen } = blocks(themeCss);
    const check = (name, literal, token) => {
        if (literal === undefined) return messages.push(`${name} is missing from the screen block`);
        if (!(token in tokens)) return messages.push(`${token} is missing from :root, so ${name} cannot be checked`);
        if (literal !== lastHex(tokens[token])) messages.push(`${name} is ${literal} but ${token} is ${tokens[token]}`);
    };
    for (const [prop, token] of PALETTE) {
        const value = decl(screen, prop);
        check(prop, value === undefined ? undefined : lastHex(value), token);
    }
    for (const [selector, prop, token] of RULES) {
        const rule = screen.match(new RegExp(`${selector.replace(/[.>]/g, c => '\\' + c)}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
        const literal = (rule.match(new RegExp(`${prop}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1]?.toLowerCase();
        check(`${selector} ${prop}`, literal, token);
    }
    return messages;
}

const tokenDrift = tokens => Object.entries(DESIGN_TOKENS).flatMap(([token, pinned]) => {
    if (!(token in tokens)) return [`${token} is missing from :root`];
    return tokens[token].toLowerCase() === pinned ? [] : [`${token} is ${tokens[token]} but the pinned value is ${pinned}`];
});

// Print ink rule: each print series channel is round(0.6 x) of the screen channel.
const printInk = hex => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.6).toString(16).padStart(2, '0')).join('');
function printDrift(css) {
    const { screen, print } = blocks(css);
    return SERIES.map((_, i) => `--pele-series-${i + 1}`).flatMap(name => {
        const base = decl(screen, name)?.toLowerCase();
        const actual = decl(print, name)?.toLowerCase();
        if (!base) return [`${name} is missing from the screen block`];
        if (!actual) return [`${name} is missing from the print block`];
        return actual === printInk(base) ? [] : [`${name} is ${actual} but 0.6 of the screen value is ${printInk(base)}`];
    });
}

const PELE_TAG = '<script src="https://cdn.jsdelivr.net/npm/pele@1.6.0/dist/pele.global.js"></script>';

describe('TemplateRendersDiagramsOnLoad', () => {
    test('T7: legacy tokens are reported on the old loader and absent from the real files', () => {
        expect(legacyHits('<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>')).toEqual(['mermaid@']);
        expect(legacyHits("addEventListener('beforeprint'")).toEqual(['beforeprint']);
        const template = PAGES['template.html'];
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
        const template = PAGES['template.html'];
        expect(pinViolations(template)).toEqual([]);
        expect(pinViolations(read('pele-glue.js'))).toEqual([]);
        expect(template.split(PELE_TAG).length - 1).toBe(1);
        expect(template).not.toMatch(/<script[^>]*pele\.global\.js[^>]*(type|async|defer)=/);
        expect(template.indexOf(PELE_TAG)).toBeLessThan(template.indexOf('// @inline pele-glue.js'));
    });

    test('T9: every @inline target in the template exists under viz/lib', () => {
        const targets = inlineTargets(PAGES['template.html'], LIB);
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) expect(existsSync(target)).toBe(true);
    });
});

describe('FeedbackRendersDiagrams', () => {
    const RECIPES = join(LIB, 'recipes');

    test('T4: the feedback page has no legacy token and pins the same Pele tag as the viewer', () => {
        const feedback = PAGES['recipes/feedback.html'];
        expect(legacyHits(feedback)).toEqual([]);
        expect(pinViolations(feedback)).toEqual([]);
        expect(feedback.split(PELE_TAG).length - 1).toBe(1);
        expect(feedback.indexOf(PELE_TAG)).toBeLessThan(feedback.indexOf('// @inline ../pele-glue.js'));
    });

    test('T5: the feedback page keeps the mermaid fence hook and every @inline target exists', () => {
        const feedback = PAGES['recipes/feedback.html'];
        expect(feedback).toContain('code.language-mermaid');
        const targets = inlineTargets(feedback, RECIPES);
        expect(targets.length).toBeGreaterThan(0);
        for (const target of targets) expect(existsSync(target)).toBe(true);
    });
});

describe('DesignTokensMatchSource', () => {
    // bun test lists skipped tests only on a terminal, so the reason is also printed.
    if (NO_DESIGN_SYSTEM) console.warn(`DesignTokensMatchSource T2, T3${NO_DESIGN_SYSTEM}`);

    // A tokens.css text with the vendored colors plus overrides (undefined drops a token) and two non-color tokens.
    const tokensCss = (overrides = {}) => `:root {\n${Object.entries({ ...DESIGN_TOKENS, ...overrides })
        .filter(([, value]) => value !== undefined).map(([token, value]) => `  ${token}: ${value};\n`).join('')}  --font-mono: "Fira Code", monospace;\n  --space-1: 4px;\n}\n`;

    test('T1: a changed, an added and a removed color are each one message naming the token; a wrong vendored value is too', () => {
        expect(sourceDrift(colorTokens(tokensCss()))).toEqual([]);
        for (const [overrides, token] of [[{ '--accent': '#ec8b49' }, '--accent'], [{ '--teal': '#3aa99f' }, '--teal'], [{ '--cyan': undefined }, '--cyan']]) {
            const messages = sourceDrift(colorTokens(tokensCss(overrides)));
            expect(messages.length).toBe(1);
            expect(messages[0]).toContain(token);
        }
        const misCopied = sourceDrift(colorTokens(tokensCss()), { ...DESIGN_TOKENS, '--fg-2': '#b7b5ac' });
        expect(misCopied.length).toBe(1);
        expect(misCopied[0]).toContain('--fg-2');
    });

    test.skipIf(!!NO_DESIGN_SYSTEM)(`T2: the vendored copy equals every color in the design-system checkout's tokens.css${NO_DESIGN_SYSTEM}`, () => {
        const drift = sourceDrift(colorTokens(readFileSync(TOKENS_CSS, 'utf8')));
        expect({ tokensCss: TOKENS_CSS, vendoredFrom: DESIGN_TOKENS_COMMIT, drift }).toEqual({ tokensCss: TOKENS_CSS, vendoredFrom: DESIGN_TOKENS_COMMIT, drift: [] });
    });

    test.skipIf(!!NO_DESIGN_SYSTEM)(`T3: the vendored copy equals tokens.css at the recorded commit ${DESIGN_TOKENS_COMMIT}${NO_DESIGN_SYSTEM}`, () => {
        const shown = Bun.spawnSync(['git', '-C', DESIGN_SYSTEM, 'show', `${DESIGN_TOKENS_COMMIT}:tokens.css`]);
        expect({ exitCode: shown.exitCode, stderr: shown.stderr.toString().trim() }).toEqual({ exitCode: 0, stderr: '' });
        expect(sourceDrift(colorTokens(shown.stdout.toString()))).toEqual([]);
    });
});

describe('PageTokensMatchDesignSystem', () => {

    test('T1: each page :root carries the pinned Musingfox values for all 24 tokens', () => {
        const template = rootTokens(PAGES['template.html']);
        expect([template['--bg'], template['--accent'], template['--danger'], template['--orange'], template['--magenta']])
            .toEqual([DESIGN_TOKENS['--bg'], DESIGN_TOKENS['--accent'], DESIGN_TOKENS['--danger'], DESIGN_TOKENS['--orange'], DESIGN_TOKENS['--magenta']]);
        for (const [file, html] of Object.entries(PAGES)) expect({ file, drift: tokenDrift(rootTokens(html)) }).toEqual({ file, drift: [] });
    });

    test('T2: each of the three pages has exactly one :root block', () => {
        for (const [file, html] of Object.entries(PAGES)) expect({ file, roots: (html.match(/:root\s*\{/g) || []).length }).toEqual({ file, roots: 1 });
    });

    test('T3: a drifted accent and a missing cyan are each one message naming the token', () => {
        const pinned = rootTokens(PAGES['template.html']);
        const drifted = tokenDrift({ ...pinned, '--accent': '#fd971f' });
        expect(drifted.length).toBe(1);
        expect(drifted[0]).toContain('--accent');
        const missing = tokenDrift(Object.fromEntries(Object.entries(pinned).filter(([k]) => k !== '--cyan')));
        expect(missing.length).toBe(1);
        expect(missing[0]).toContain('--cyan');
    });

    test('T4: feedback and pr-review carry the same 24 token values as the template', () => {
        const a = rootTokens(PAGES['template.html']);
        for (const page of [PAGES['recipes/feedback.html'], PAGES['recipes/pr-review.html']]) {
            const b = rootTokens(page);
            for (const token of Object.keys(DESIGN_TOKENS)) {
                expect(a[token]).toBeDefined();
                expect(b[token]).toBe(a[token]);
            }
        }
    });
});

describe('PageLiteralsFollowTokens', () => {

    test('T1: the template expanded-tab background literal equals its --bg', () => {
        const literal = PAGES['template.html'].match(/var bg = '(#[0-9a-fA-F]{6})'/)[1].toLowerCase();
        expect(literal).toBe(DESIGN_TOKENS['--bg']);
        expect(literal).toBe(rootTokens(PAGES['template.html'])['--bg']);
    });

    test('T2: the feedback diagram shell takes its --surface-warm, which equals the design token', () => {
        expect(PAGES['recipes/feedback.html']).toMatch(/--viz-diagram-bg:\s*var\(--surface-warm\);/);
        expect(rootTokens(PAGES['recipes/feedback.html'])['--surface-warm']).toBe(DESIGN_TOKENS['--surface-warm']);
    });

    test('T3: the inline error color on feedback and pr-review equals --danger on each page', () => {
        for (const file of ['recipes/feedback.html', 'recipes/pr-review.html']) {
            const html = PAGES[file];
            const literal = html.match(/color:\s*(#[0-9a-fA-F]{6})/)[1].toLowerCase();
            expect({ file, literal }).toEqual({ file, literal: rootTokens(html)['--danger'] });
        }
    });

    test('T4: the sweep reports the old hexes it is given', () => {
        expect(oldPaletteHits('color:#f4005f')).toEqual(['#f4005f']);
        expect(oldPaletteHits('--bg: #07080a')).toEqual(['#07080a']);
    });

    test('T5: none of the three pages still carries an old-palette hex', () => {
        for (const [file, html] of Object.entries(PAGES)) {
            expect({ file, hits: oldPaletteHits(html) }).toEqual({ file, hits: [] });
        }
    });
});

describe('DiagramScreenPalette', () => {
    const THEME = read('pele-theme.css');
    const SCREEN = blocks(THEME).screen;

    test('T1: screen series are the eight hues in order and the neutrals follow the new tokens', () => {
        expect(SERIES.map((_, i) => decl(SCREEN, `--pele-series-${i + 1}`)))
            .toEqual(SERIES.map(hue => DESIGN_TOKENS[hue]));
        expect(decl(SCREEN, '--pele-fg')).toBe(DESIGN_TOKENS['--fg']);
        expect(decl(SCREEN, '--pele-muted')).toBe(DESIGN_TOKENS['--muted']);
        expect(decl(SCREEN, '--pele-line')).toBe(DESIGN_TOKENS['--muted']);
        expect(decl(SCREEN, '--pele-surface')).toBe(DESIGN_TOKENS['--surface-warm']);
        expect(decl(SCREEN, '--pele-surface-alt')).toBe(DESIGN_TOKENS['--surface']);
        expect(decl(SCREEN, '--pele-bg')).toBe(`var(--viz-diagram-bg, ${DESIGN_TOKENS['--surface']})`);
        expect(decl(SCREEN, '--pele-border')).toBe(DESIGN_TOKENS['--accent']);
        expect(decl(SCREEN, '--pele-accent')).toBe(DESIGN_TOKENS['--accent']);
        expect(decl(SCREEN, '--pele-error')).toBe(DESIGN_TOKENS['--danger']);
        expect(decl(SCREEN, '--pele-critical')).toBe(DESIGN_TOKENS['--danger']);
        expect(THEME).toContain(`.pele-cluster > rect { stroke: ${DESIGN_TOKENS['--border']}; }`);
        expect(THEME).toContain(`color: ${DESIGN_TOKENS['--danger']};`);
    });

    test('T2: the theme matches the page tokens of template and feedback', () => {
        expect(themeDrift(rootTokens(PAGES['template.html']), THEME)).toEqual([]);
        expect(themeDrift(rootTokens(PAGES['recipes/feedback.html']), THEME)).toEqual([]);
    });

    test('T3: a flipped border literal is one message naming --pele-border and --accent; a flipped series 6 is one naming --pele-series-6 and --red', () => {
        const border = decl(SCREEN, '--pele-border');
        const series6 = decl(SCREEN, '--pele-series-6');
        const drifted = THEME.replace(`--pele-border: ${border};`, `--pele-border: ${flip(border)};`)
            .replace(`--pele-series-6: ${series6};`, `--pele-series-6: ${flip(series6)};`);
        const messages = themeDrift(rootTokens(PAGES['template.html']), drifted);
        expect(messages.length).toBe(2);
        expect(messages.filter(m => m.includes('--pele-border') && m.includes('--accent')).length).toBe(1);
        expect(messages.filter(m => m.includes('--pele-series-6') && m.includes('--red')).length).toBe(1);
    });

    test('T4: a token deleted from the supplied map is reported, not thrown', () => {
        const tokens = rootTokens(PAGES['template.html']);
        delete tokens['--danger'];
        const messages = themeDrift(tokens, THEME);
        expect(messages.length).toBeGreaterThan(0);
        expect(messages.some(m => m.includes('--danger'))).toBe(true);
    });

    test('T5: the theme carries no old-palette hex and no color-mix()', () => {
        expect(oldPaletteHits(THEME)).toEqual([]);
        expect(THEME).not.toContain('color-mix(');
    });

    test('T6: red and magenta sit at least two series positions apart', () => {
        expect(Math.abs(SERIES.indexOf('--red') - SERIES.indexOf('--magenta'))).toBeGreaterThanOrEqual(2);
    });
});

describe('DiagramPrintPalette', () => {
    const THEME = read('pele-theme.css');
    const PRINT = blocks(THEME).print;

    test('T1: print series are the screen series at 0.6 per channel, in order', () => {
        expect(SERIES.map((_, i) => decl(PRINT, `--pele-series-${i + 1}`)))
            .toEqual(SERIES.map(hue => printInk(DESIGN_TOKENS[hue])));
    });

    test('T2: one changed print series is exactly one message naming --pele-series-3', () => {
        const series3 = decl(PRINT, '--pele-series-3');
        const messages = printDrift(THEME.replace(`--pele-series-3: ${series3};`, `--pele-series-3: ${flip(series3)};`));
        expect(messages.length).toBe(1);
        expect(messages[0]).toContain('--pele-series-3');
    });

    test('T3: the theme passes the print check and the print neutrals stay unchanged', () => {
        expect(printDrift(THEME)).toEqual([]);
        expect(decl(PRINT, '--pele-bg')).toBe('#ffffff');
        expect(decl(PRINT, '--pele-fg')).toBe('#1f1f1f');
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

// highlight.js: pinned script, colors from page tokens via the inlined hljs-theme.css.
const HLJS_PIN = '11.12.0';
const HLJS_TAG = `<script src="https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@${HLJS_PIN}/highlight.min.js"></script>`;
// Every highlight.js CDN reference must carry an exact x.y.z version.
const hljsPinViolations = text =>
    [...text.matchAll(/(?:highlightjs\/cdn-release|@highlightjs\/cdn-assets|highlight\.js)@([^\s"'`/)]*)/g)]
        .filter(m => !/^\d+\.\d+\.\d+$/.test(m[1]))
        .map(m => m[0]);

// WCAG contrast ratio of two #rrggbb colors.
const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

// Problems with the screen colors of a highlight theme: each `color:` must be var(--token)
// of a :root token that reaches 4.5:1 on --surface, the pre background.
function codePaletteDrift(tokens, themeCss) {
    const { screen } = blocks(themeCss);
    const values = [...screen.matchAll(/(?<![-\w])color:\s*([^;}]+)/g)].map(m => m[1].trim());
    if (!values.length) return ['the theme declares no color'];
    return values.flatMap(value => {
        const token = value.match(/^var\((--[\w-]+)\)$/)?.[1];
        if (!token) return [`color ${value} is not a page token`];
        if (!(token in tokens)) return [`${token} is missing from :root`];
        const ratio = contrast(lastHex(tokens[token]), lastHex(tokens['--surface']));
        return ratio >= 4.5 ? [] : [`${token} is ${ratio.toFixed(2)}:1 on --surface, under 4.5:1`];
    });
}

describe('CodeBlocksUseMusingfoxPalette', () => {
    const THEME = read('hljs-theme.css');
    const template = PAGES['template.html'];

    test('T1: no page loads a highlight.js stylesheet or names monokai', () => {
        for (const [file, html] of Object.entries(PAGES)) {
            expect({ file, links: html.match(/<link[^>]*highlight[^>]*>/gi) || [] }).toEqual({ file, links: [] });
            expect({ file, monokai: /monokai/i.test(html) }).toEqual({ file, monokai: false });
        }
    });

    test('T2: unpinned highlight.js references are reported; the template loads the pinned script once', () => {
        for (const bad of ['highlightjs/cdn-release@latest', '@highlightjs/cdn-assets@11', 'highlight.js@^11.12.0']) {
            expect(hljsPinViolations(bad).length).toBe(1);
        }
        expect(hljsPinViolations(`@highlightjs/cdn-assets@${HLJS_PIN}`)).toEqual([]);
        for (const [file, html] of Object.entries(PAGES)) expect({ file, bad: hljsPinViolations(html) }).toEqual({ file, bad: [] });
        expect(template.split(HLJS_TAG).length - 1).toBe(1);
        expect(template).not.toContain('@latest');
    });

    test('T3: the template inlines hljs-theme.css once, inside a style element', () => {
        expect(template.split('// @inline hljs-theme.css').length - 1).toBe(1);
        expect(template).toMatch(/<style id="viz-hljs-theme">\s*\/\/ @inline hljs-theme\.css\s*<\/style>/);
        expect(existsSync(join(LIB, 'hljs-theme.css'))).toBe(true);
    });

    test('T4: the recipes do not load highlight.js, so the theme is needed only by the template', () => {
        for (const file of ['recipes/feedback.html', 'recipes/pr-review.html']) {
            expect({ file, hljs: /highlight(\.min)?\.js|hljs/.test(PAGES[file]) }).toEqual({ file, hljs: false });
        }
    });

    test('T5: every screen color in the theme is a page token readable on --surface', () => {
        expect(codePaletteDrift(rootTokens(template), THEME)).toEqual([]);
    });

    test('T6: the theme uses the seven hues readable on --surface and leaves out --magenta', () => {
        const used = new Set([...blocks(THEME).screen.matchAll(/var\((--[\w-]+)\)/g)].map(m => m[1]));
        for (const hue of ['--red', '--orange', '--yellow', '--green', '--cyan', '--blue', '--purple']) expect(used.has(hue)).toBe(true);
        expect(used.has('--magenta')).toBe(false);
    });

    test('T7: a hex color and a --magenta color are each one message', () => {
        const tokens = rootTokens(template);
        const hex = codePaletteDrift(tokens, '.hljs-keyword { color: #f92672; }');
        expect(hex.length).toBe(1);
        expect(hex[0]).toContain('#f92672');
        const magenta = codePaletteDrift(tokens, '.hljs-keyword { color: var(--magenta); }');
        expect(magenta.length).toBe(1);
        expect(magenta[0]).toContain('--magenta');
    });

    test('T8: the theme carries no old-palette hex and its screen block no hex at all', () => {
        expect(oldPaletteHits(THEME)).toEqual([]);
        expect(blocks(THEME).screen.match(/#[0-9a-fA-F]{3,6}\b/g)).toBeNull();
    });
});
