import { test, expect, describe } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { marked } from 'marked';

const require = createRequire(import.meta.url);
const { createFeedbackModel } = require('../lib/recipes/feedback.model.js');
const M = createFeedbackModel();

function projectMd(md) {
    const model = M.parse(md);
    return M.project(marked.lexer(model.body), M.questions(model));
}

const P = projectMd(readFileSync(join(import.meta.dir, 'fixtures', 'feedback', 'cards.md'), 'utf-8'));
const section = title => P.sections.find(s => s.title === title);
const blockTypes = s => s.blocks.map(b => b.type === 'token' ? b.token.type : b.type);

describe('card projection: layout', () => {
    test('a doc with a matched decision is usable', () => {
        expect(P.usable).toBe(true);
    });

    test('everything before the first h2 is the hero', () => {
        expect(P.hero.map(t => t.type).filter(t => t !== 'space')).toEqual(['heading', 'paragraph']);
    });

    test('an h2 equal to a question title becomes that decision; others stay sections', () => {
        expect(P.sections.map(s => [s.kind, s.id || null, s.title])).toEqual([
            ['section', null, '已經查清楚的事實'],
            ['decision', 'd1', '資料要存在哪裡？'],
            ['decision', 'd2', '匯出用什麼格式？'],
        ]);
    });

    test('a doc whose h2s match no question is not usable', () => {
        const p = projectMd('---\nd1.title: 甲\nd1.options: A | B\n---\n## 乙\n\ntext\n');
        expect(p.usable).toBe(false);
    });
});

describe('card projection: option cards', () => {
    const d1 = section('資料要存在哪裡？');
    const cards = d1.blocks.find(b => b.type === 'cards').cards;
    const card = label => cards.find(c => c.label === label);

    test('the option table is replaced in place; prose and the verdict keep their order', () => {
        expect(blockTypes(d1).filter(t => t !== 'space')).toEqual(['paragraph', 'cards', 'paragraph', 'verdict']);
    });

    test('cards follow the frontmatter option order and flag the recommendation', () => {
        expect(cards.map(c => [c.label, c.recommend])).toEqual([
            ['留在 SQLite', false], ['換 Postgres', true], ['兩個都支援', false],
        ]);
    });

    test('好處 and 代價 cells split on ；', () => {
        expect(card('留在 SQLite').pros).toEqual(['零維運', '不用改程式']);
        expect(card('留在 SQLite').cons).toEqual(['無法多機寫入']);
    });

    test('a cell opening with a level word becomes a cost meter with its reason', () => {
        expect(card('換 Postgres').cost).toEqual({ label: '改回成本', word: '高', level: 5, why: '資料要搬' });
        expect(card('兩個都支援').cost).toEqual({ label: '改回成本', word: '中', level: 3, why: '' });
        expect(card('留在 SQLite').cost.level).toBe(1);
    });

    test('an h3 equal to an option label is that card\'s detail, pulled out of the flow', () => {
        expect(card('換 Postgres').detail.map(t => t.raw).join('')).toContain('docker compose');
        expect(card('留在 SQLite').detail).toBe(null);
        expect(d1.blocks.some(b => b.type === 'token' && b.token.type === 'heading')).toBe(false);
    });

    test('columns that are neither pros, cons nor a level stay as labelled extras', () => {
        const d2 = section('匯出用什麼格式？');
        const c = d2.blocks.find(b => b.type === 'cards').cards;
        expect(c.map(x => [x.label, x.pros, x.extras])).toEqual([
            ['CSV', [], [{ label: '說明', text: '試算表直接開' }]],
            ['JSON', [], [{ label: '說明', text: '保留巢狀欄位' }]],
        ]);
    });

    test('a decision with no option table still gets bare cards, after its prose', () => {
        const p = projectMd('---\nd1.title: 甲\nd1.options: A | B\n---\n## 甲\n\n說明\n');
        const s = p.sections[0];
        expect(blockTypes(s).filter(t => t !== 'space')).toEqual(['paragraph', 'cards']);
        expect(s.blocks.find(b => b.type === 'cards').cards.map(c => [c.label, c.cost, c.detail])).toEqual([
            ['A', null, null], ['B', null, null],
        ]);
    });
});

describe('card projection: fact tiles', () => {
    const facts = section('已經查清楚的事實');
    const tiles = facts.blocks.find(b => b.type === 'tiles').tiles;

    test('a table outside a decision becomes one tile per row, fields labelled by header', () => {
        expect(tiles.map(t => t.title)).toEqual(['寫入量很小', '已有備份流程', '部署只有一台']);
        expect(tiles[0].fields).toEqual([
            { label: '證據', text: '每天 200 筆' }, { label: '後果', text: '效能不是考量' },
        ]);
    });

    test('an h3 equal to a tile title is its detail; an unmatched h3 stays in the flow', () => {
        expect(tiles[0].detail.map(t => t.raw).join('')).toContain('212');
        expect(tiles[1].detail).toBe(null);
        const headings = facts.blocks.filter(b => b.type === 'token' && b.token.type === 'heading');
        expect(headings.map(b => b.token.text)).toEqual(['沒有對應的卡片']);
    });

    test('a table wider than four columns stays a table', () => {
        const p = projectMd('---\nd1.title: 甲\nd1.options: A\n---\n## 背景\n\n| a | b | c | d | e |\n|---|---|---|---|---|\n| 1 | 2 | 3 | 4 | 5 |\n\n## 甲\n');
        expect(blockTypes(p.sections[0]).filter(t => t !== 'space')).toEqual(['table']);
    });
});
