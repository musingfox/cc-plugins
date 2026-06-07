import { test, expect, describe } from 'bun:test';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createFeedbackModel } = require('../lib/recipes/feedback.model.js');
const M = createFeedbackModel();

const FIXTURES_DIR = join(import.meta.dir, 'fixtures', 'feedback');
const FIXTURES = readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.md')).sort();

describe('feedback fixture preservation', () => {
    for (const f of FIXTURES) {
        const md = readFileSync(join(FIXTURES_DIR, f), 'utf-8');
        test(`${f}: serialize(parse(md)) === md`, () => {
            expect(M.serialize(M.parse(md))).toBe(md);
        });
        test(`${f}: second pass is stable`, () => {
            const a = M.serialize(M.parse(md));
            expect(M.serialize(M.parse(a))).toBe(a);
        });
    }
});

describe('feedback contract', () => {
    const md = readFileSync(join(FIXTURES_DIR, 'sample.md'), 'utf-8');

    test('parses pipe-separated options', () => {
        expect(M.options(M.parse(md))).toEqual(['收工', '實跑驗證', '補缺口']);
    });

    test('body survives a feedback write byte-for-byte', () => {
        const before = M.parse(md);
        const bodyBefore = before.body;
        M.setFeedback(before, '收工', 'looks complete');
        expect(before.body).toBe(bodyBefore);
        const out = M.serialize(before);
        expect(out).toContain('choice: 收工');
        expect(out).toContain('notes: looks complete');
        expect(out.endsWith(bodyBefore)).toBe(true);
    });

    test('notes round-trip multi-line through a single frontmatter line', () => {
        const m = M.parse(md);
        M.setFeedback(m, '收工', 'line one\nline two');
        const reparsed = M.parse(M.serialize(m));
        expect(M.getNotes(reparsed)).toBe('line one\nline two');
        expect(reparsed.fm.notes.indexOf('\n')).toBe(-1);
    });

    test('choice/notes keys appended once, not duplicated on re-set', () => {
        const m = M.parse(md);
        M.setFeedback(m, '收工', 'a');
        M.setFeedback(m, '補缺口', 'b');
        const out = M.serialize(m);
        expect(out.match(/^choice:/gm).length).toBe(1);
        expect(out.match(/^notes:/gm).length).toBe(1);
        expect(out).toContain('choice: 補缺口');
    });

    test('notes-only doc (no options) parses to empty option list', () => {
        const noOpts = '---\nviz: feedback\ntitle: T\nnotes:\n---\n\nbody\n';
        expect(M.options(M.parse(noOpts))).toEqual([]);
    });
});
