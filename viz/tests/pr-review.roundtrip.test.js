import { test, expect, describe } from 'bun:test';
import { marked } from 'marked';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createPRReviewModel } = require('../lib/recipes/pr-review.model.js');
const { parseModel, serializeModel } = createPRReviewModel(marked);

const FIXTURES_DIR = join(import.meta.dir, 'fixtures', 'pr-review');
const FIXTURES = readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.md'))
    .sort();

describe('pr-review fixture preservation', () => {
    for (const f of FIXTURES) {
        const md = readFileSync(join(FIXTURES_DIR, f), 'utf-8');
        test(`${f}: serialize(parse(md)) === md`, () => {
            expect(serializeModel(parseModel(md))).toBe(md);
        });
        test(`${f}: second pass is stable`, () => {
            const a = serializeModel(parseModel(md));
            const b = serializeModel(parseModel(a));
            expect(b).toBe(a);
        });
    }
});

describe('pr-review structural invariants', () => {
    test('preserves frontmatter key order', () => {
        const md = [
            '---',
            'viz: pr-review',
            'zzz: aaa',
            'alpha: beta',
            'title: T',
            '---',
            '',
            '## High',
            '',
            '### Foo',
            '- a: 1',
            ''
        ].join('\n');
        const model = parseModel(md);
        expect(model.fmOrder).toEqual(['viz', 'zzz', 'alpha', 'title']);
        const out = serializeModel(model);
        expect(out.indexOf('viz: pr-review\nzzz: aaa\nalpha: beta\ntitle: T'))
            .toBeGreaterThan(-1);
    });

    test('preserves meta key order within finding', () => {
        const md = [
            '---', 'viz: pr-review', '---', '',
            '## High', '',
            '### Foo',
            '- z: 1',
            '- a: 2',
            '- m: 3',
            ''
        ].join('\n');
        const model = parseModel(md);
        expect(model.sections[0].findings[0].metaOrder).toEqual(['z', 'a', 'm']);
    });

    test('preserves section order across severities', () => {
        const md = [
            '---', 'viz: pr-review', '---', '',
            '## Critical', '', '### A', '- status: open', '',
            '## Low', '', '### B', '- status: open', '',
            '## High', '', '### C', '- status: open', ''
        ].join('\n');
        const model = parseModel(md);
        expect(model.sections.map(s => s.severity)).toEqual(['Critical', 'Low', 'High']);
    });

    test('preserves finding order within a section', () => {
        const md = [
            '---', 'viz: pr-review', '---', '',
            '## High', '',
            '### Third', '- status: open', '',
            '### First', '- status: open', '',
            '### Second', '- status: open', ''
        ].join('\n');
        const model = parseModel(md);
        expect(model.sections[0].findings.map(f => f.title))
            .toEqual(['Third', 'First', 'Second']);
    });

    test('status defaults are appended to metaOrder when meta.status is set', () => {
        // serializer pushes 'status' to metaOrder if it is in meta but not in
        // metaOrder. Round-trip should still match a fixture with status last.
        const md = [
            '---', 'viz: pr-review', '---', '',
            '## High', '',
            '### Foo',
            '- file: a.ts',
            '- status: open',
            ''
        ].join('\n');
        expect(serializeModel(parseModel(md))).toBe(md);
    });

    test('status edit reflects in serialized output', () => {
        const md = [
            '---', 'viz: pr-review', '---', '',
            '## High', '',
            '### Foo',
            '- status: open',
            ''
        ].join('\n');
        const model = parseModel(md);
        model.sections[0].findings[0].meta.status = 'fixed';
        const out = serializeModel(model);
        expect(out).toContain('- status: fixed');
        expect(out).not.toContain('- status: open');
    });

    test('handles missing frontmatter gracefully', () => {
        const md = '## High\n\n### Foo\n- a: 1\n';
        const model = parseModel(md);
        expect(model.fmOrder).toEqual([]);
        expect(model.sections.length).toBe(1);
    });

    test('summary content survives a round-trip', () => {
        const md = [
            '---', 'viz: pr-review', '---', '',
            '# Summary', '',
            'A short summary.',
            ''
        ].join('\n');
        const model = parseModel(md);
        expect(model.summary).toBe('A short summary.');
        expect(serializeModel(model)).toBe(md);
    });
});
