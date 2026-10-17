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
