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

    test('single-question doc exposes no questions', () => {
        expect(M.questions(M.parse(md))).toEqual([]);
    });
});

describe('feedback round mode', () => {
    const md = readFileSync(join(FIXTURES_DIR, 'round.md'), 'utf-8');

    test('dotted keys become questions in document order', () => {
        const qs = M.questions(M.parse(md));
        expect(qs.map(q => q.id)).toEqual(['q1', 'q2', 'q3']);
        expect(qs[0].title).toBe('儲存層');
        expect(qs[0].options).toEqual(['留在 SQLite', '換 Postgres', '兩個都探']);
        expect(qs[0].recommend).toBe('換 Postgres');
        expect(qs[0].multi).toBe(true);
        expect(qs[1].multi).toBe(false);
        expect(qs[2].options).toEqual([]);
    });

    test('round mode suppresses the top-level option list', () => {
        expect(M.options(M.parse(md))).toEqual([]);
    });

    test('answers serialize pipe-joined and parse back as an array', () => {
        const m = M.parse(md);
        M.setAnswer(m, 'q1', ['留在 SQLite', '兩個都探'], '兩條都想探一下');
        const out = M.serialize(m);
        expect(out).toContain('q1.choice: 留在 SQLite | 兩個都探');
        const qs = M.questions(M.parse(out));
        expect(qs[0].choice).toEqual(['留在 SQLite', '兩個都探']);
        expect(qs[0].notes).toBe('兩條都想探一下');
        expect(qs[1].choice).toEqual([]);
    });

    test('a missing answer key is inserted inside its own question block', () => {
        const m = M.parse(md);
        M.setAnswer(m, 'q3', [], 'nothing else');
        const lines = M.serialize(m).split('\n');
        const at = k => lines.findIndex(l => l.startsWith(k));
        expect(at('q3.notes:')).toBeGreaterThan(at('q3.title:'));
        expect(at('q3.notes:')).toBeLessThan(at('notes:'));
    });

    test('answer keys are written once, not duplicated on re-answer', () => {
        const m = M.parse(md);
        M.setAnswer(m, 'q2', ['CSV'], '');
        M.setAnswer(m, 'q2', ['JSON'], '');
        const out = M.serialize(m);
        expect(out.match(/^q2\.choice:/gm).length).toBe(1);
        expect(out).toContain('q2.choice: JSON');
    });

    test('per-question notes round-trip multi-line on one line', () => {
        const m = M.parse(md);
        M.setAnswer(m, 'q1', [], 'line one\nline two');
        const reparsed = M.parse(M.serialize(m));
        expect(M.questions(reparsed)[0].notes).toBe('line one\nline two');
        expect(reparsed.fm['q1.notes'].indexOf('\n')).toBe(-1);
    });

    test('body survives answers byte-for-byte', () => {
        const m = M.parse(md);
        const bodyBefore = m.body;
        M.setAnswer(m, 'q1', ['換 Postgres'], 'x');
        M.setAnswer(m, 'q2', ['JSON'], '');
        expect(m.body).toBe(bodyBefore);
        expect(M.serialize(m).endsWith(bodyBefore)).toBe(true);
    });

    test('round-level notes write without introducing a top-level choice', () => {
        const m = M.parse(md);
        M.setNotes(m, 'round-level remark');
        const out = M.serialize(m);
        expect(out).toContain('notes: round-level remark');
        expect(out.match(/^choice:/gm)).toBe(null);
    });

    test('toggle: multi accumulates, single replaces', () => {
        expect(M.toggle(['a'], 'b', true)).toEqual(['a', 'b']);
        expect(M.toggle(['a', 'b'], 'a', true)).toEqual(['b']);
        expect(M.toggle(['a'], 'b', false)).toEqual(['b']);
        expect(M.toggle(['a'], 'a', false)).toEqual([]);
    });

    // '#' is an ordinary character in a value, so a template written with trailing
    // "# leave empty" annotations produces a brief whose every decision already reads
    // as answered. Authors keep templates comment-free; the parser stays literal so a
    // title or an answer may contain '#' without being truncated.
    test('a trailing # is part of the value, not a comment', () => {
        const m = M.parse([
            '---',
            'viz: feedback',
            'q1.title: which #tag wins?',
            'q1.options: A | B',
            'q1.multi: true  # optional',
            'q1.choice:  # leave empty',
            '---',
            'body'
        ].join('\n'));
        const q = M.questions(m)[0];
        expect(q.title).toBe('which #tag wins?');
        expect(q.multi).toBe(false);
        expect(q.choice).toEqual(['# leave empty']);
    });
});
