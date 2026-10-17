import { test, expect, describe, spyOn } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { renderDiagrams, makeLogosResolver, LOGOS_ICONS_URL } = require('../lib/pele-glue.js');

// Element stand-in: innerHTML is a setter spy, textContent and classList are plain.
function fakeNode(src) {
    const classes = new Set();
    const node = {
        dataset: src === undefined ? {} : { src },
        textContent: '',
        htmlWrites: [],
        classList: { add: c => classes.add(c), contains: c => classes.has(c) },
    };
    let html = src === undefined ? '' : src;
    Object.defineProperty(node, 'innerHTML', {
        get: () => html,
        set: v => { html = v; node.htmlWrites.push(v); },
    });
    return node;
}

const SVG = '<svg class="pele"></svg>';

function fakePele(impl) {
    const calls = [];
    return {
        calls,
        render(src, opts) {
            calls.push([src, opts]);
            return impl ? impl(src, opts) : { svg: SVG };
        },
    };
}

const PACK = { width: 256, height: 256, icons: { 'aws-lambda': { body: '<path d="M1"/>' } } };

describe('DiagramRender', () => {
    test('T1: a node takes Pele svg verbatim and render gets the source unchanged', async () => {
        const node = fakeNode('graph TD\nA-->B');
        const pele = fakePele();
        await renderDiagrams([node], { pele, fontFamily: 'x' });
        expect(node.innerHTML).toBe(SVG);
        expect(pele.calls.length).toBe(1);
        expect(pele.calls[0][0]).toBe('graph TD\nA-->B');
    });

    test('T2: options hold exactly icons, idPrefix and the given fontFamily, never config', async () => {
        const node = fakeNode('graph TD\nA-->B');
        const pele = fakePele();
        await renderDiagrams([node], { pele, fontFamily: 'Fira Code' });
        const opts = pele.calls[0][1];
        expect(Object.keys(opts).sort()).toEqual(['fontFamily', 'icons', 'idPrefix']);
        expect(opts.fontFamily).toBe('Fira Code');
        expect(opts.config).toBeUndefined();
    });

    test('T3: idPrefix is distinct for every node across two calls', async () => {
        const pele = fakePele();
        await renderDiagrams([fakeNode('a'), fakeNode('b')], { pele, fontFamily: 'f' });
        await renderDiagrams([fakeNode('c'), fakeNode('d')], { pele, fontFamily: 'f' });
        const ids = new Set(pele.calls.map(([, opts]) => opts.idPrefix));
        expect(ids.size).toBe(4);
    });

    test('T4: a node without dataset.src is not rendered and stays unchanged', async () => {
        const node = fakeNode(undefined);
        const pele = fakePele();
        await renderDiagrams([node], { pele, fontFamily: 'f' });
        expect(pele.calls.length).toBe(0);
        expect(node.htmlWrites.length).toBe(0);
    });

    test('T5: a non-logos node is drawn before renderDiagrams returns its promise', async () => {
        const node = fakeNode('graph TD\nA-->B');
        const pele = fakePele();
        const done = renderDiagrams([node], { pele, fontFamily: 'f' });
        expect(node.innerHTML).toBe(SVG);
        await done;
    });

    test('T6: without deps.pele the promise resolves, nodes stay unchanged, console.error runs once', async () => {
        const node = fakeNode('graph TD\nA-->B');
        const err = spyOn(console, 'error').mockImplementation(() => {});
        try {
            await expect(renderDiagrams([node], {})).resolves.toBeUndefined();
            expect(node.innerHTML).toBe('graph TD\nA-->B');
            expect(node.htmlWrites.length).toBe(0);
            expect(err).toHaveBeenCalledTimes(1);
        } finally {
            err.mockRestore();
        }
    });

    test('T7: with no fontFamily and no getComputedStyle, opts has no fontFamily key and render still runs', async () => {
        const node = fakeNode('graph TD\nA-->B');
        const pele = fakePele();
        await renderDiagrams([node], { pele });
        expect(pele.calls.length).toBe(1);
        expect('fontFamily' in pele.calls[0][1]).toBe(false);
    });

    test('R1: a plain non-iterable ArrayLike of nodes renders and never rejects', async () => {
        const node = fakeNode('graph TD\nA-->B');
        const pele = fakePele();
        await renderDiagrams({ length: 1, 0: node }, { pele, fontFamily: 'f' });
        expect(node.innerHTML).toBe(SVG);
    });

    test('R2: an empty-string source reaches pele and its error is shown', async () => {
        const node = fakeNode('');
        const pele = fakePele(() => { throw new Error('No diagram type detected for the given text.'); });
        await renderDiagrams([node], { pele, fontFamily: 'f' });
        expect(pele.calls.length).toBe(1);
        expect(node.classList.contains('pele-error')).toBe(true);
        expect(node.textContent).toBe('No diagram type detected for the given text.');
    });
});

describe('DiagramErrorIsolation', () => {
    test('T1: a throwing diagram shows its message as text and the others still render', async () => {
        const nodes = [fakeNode('a'), fakeNode('b'), fakeNode('c')];
        const msg = 'Parse error on line 3:\n\n^\nExpecting NODE_STRING';
        const pele = fakePele((src) => {
            if (src === 'b') throw new Error(msg);
            return { svg: SVG };
        });
        await renderDiagrams(nodes, { pele, fontFamily: 'f' });
        expect(nodes[0].innerHTML).toBe(SVG);
        expect(nodes[2].innerHTML).toBe(SVG);
        expect(nodes[1].textContent).toBe(msg);
        expect(nodes[1].classList.contains('pele-error')).toBe(true);
        expect(nodes[1].htmlWrites.length).toBe(0);
    });

    test('T2: a message containing markup is written only through textContent', async () => {
        const node = fakeNode('a');
        const pele = fakePele(() => { throw new Error('<img src=x onerror=alert(1)>'); });
        await renderDiagrams([node], { pele, fontFamily: 'f' });
        expect(node.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(node.htmlWrites.length).toBe(0);
    });

    test('T3: a thrown string is shown as the string', async () => {
        const node = fakeNode('a');
        const pele = fakePele(() => { throw 'boom'; });
        await renderDiagrams([node], { pele, fontFamily: 'f' });
        expect(node.textContent).toBe('boom');
    });

    test('T4: when every diagram throws, the promise resolves and every node is marked', async () => {
        const nodes = [fakeNode('a'), fakeNode('b')];
        const pele = fakePele(() => { throw new Error('bad'); });
        await expect(renderDiagrams(nodes, { pele, fontFamily: 'f' })).resolves.toBeUndefined();
        expect(nodes.every(n => n.classList.contains('pele-error'))).toBe(true);
    });
});

describe('LogosIconResolver', () => {
    const svgOf = (w, h, body) =>
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}</svg>`;

    test('T1: a logos name resolves to a complete svg sized from the pack', () => {
        const resolve = makeLogosResolver({ width: 256, height: 256, icons: { lambda: { body: '<path d="M0"/>' } } });
        expect(resolve('logos:lambda')).toBe(svgOf(256, 256, '<path d="M0"/>'));
    });

    test('T2: an icon width overrides the pack width', () => {
        const resolve = makeLogosResolver({ width: 256, height: 256, icons: { lambda: { body: '<g/>', width: 512 } } });
        expect(resolve('logos:lambda')).toContain('viewBox="0 0 512 256"');
    });

    test('T3: an alias resolves to its parent icon', () => {
        const resolve = makeLogosResolver({
            width: 256, height: 256,
            icons: { lambda: { body: '<path d="M0"/>' } },
            aliases: { lambda2: { parent: 'lambda' } },
        });
        expect(resolve('logos:lambda2')).toBe(resolve('logos:lambda'));
    });

    test('T4: names without the logos: prefix, unknown names, and wrong case give null', () => {
        const resolve = makeLogosResolver(PACK);
        expect(resolve('nonexist:lambda')).toBeNull();
        expect(resolve('lambda')).toBeNull();
        expect(resolve('LOGOS:lambda')).toBeNull();
    });

    test('T5: inherited Object names are never icons', () => {
        const resolve = makeLogosResolver(PACK);
        expect(resolve('logos:constructor')).toBeNull();
        expect(resolve('logos:__proto__')).toBeNull();
        expect(resolve('logos:toString')).toBeNull();
    });

    test('T6: an alias cycle gives null without hanging', () => {
        const resolve = makeLogosResolver({ icons: {}, aliases: { a: { parent: 'b' }, b: { parent: 'a' } } });
        expect(resolve('logos:a')).toBeNull();
    });

    test('R1: two resolutions of an icon with an element id give different ids, and every reference follows its id', () => {
        const body = '<linearGradient id="SVGeyciVcvH"/><path fill="url(#SVGeyciVcvH)" d="M0"/><use href="#SVGeyciVcvH"/>';
        const resolve = makeLogosResolver({ icons: { lambda: { body } } });
        const first = resolve('logos:lambda');
        const second = resolve('logos:lambda');
        const ids = s => [...s.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
        expect(ids(first).length).toBe(1);
        expect(ids(first)[0]).not.toBe(ids(second)[0]);
        expect(first).toContain(`url(#${ids(first)[0]})`);
        expect(first).toContain(`href="#${ids(first)[0]}"`);
        expect(second).toContain(`url(#${ids(second)[0]})`);
        expect(second).not.toContain('SVGeyciVcvH');
    });

    test('T7: a missing name or an alias with a missing parent gives null', () => {
        const resolve = makeLogosResolver({ icons: {}, aliases: { orphan: { parent: 'gone' } } });
        expect(resolve('logos:missing')).toBeNull();
        expect(resolve('logos:orphan')).toBeNull();
    });

    test('T8: a pack that is null or has no icons object gives null without throwing', () => {
        expect(makeLogosResolver(null)('logos:lambda')).toBeNull();
        expect(makeLogosResolver({ icons: null })('logos:lambda')).toBeNull();
    });
});

describe('LogosFetchFailureTolerated', () => {
    const LOGOS_SRC = 'graph TD\nA-->B logos:aws-lambda';

    test('T1: a rejected fetch draws the logos node with empty icons and one warning', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const node = fakeNode(LOGOS_SRC);
            const pele = fakePele();
            await renderDiagrams([node], { pele, fetchJson: () => Promise.reject(new Error('net')), fontFamily: 'f' });
            expect(node.innerHTML).toBe(SVG);
            expect(node.classList.contains('pele-error')).toBe(false);
            expect(pele.calls[0][1].icons('logos:aws-lambda')).toBeNull();
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });

    test('T2: a fetch resolving null behaves like T1', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const node = fakeNode(LOGOS_SRC);
            const pele = fakePele();
            await renderDiagrams([node], { pele, fetchJson: async () => null, fontFamily: 'f' });
            expect(node.innerHTML).toBe(SVG);
            expect(node.classList.contains('pele-error')).toBe(false);
            expect(pele.calls[0][1].icons('logos:aws-lambda')).toBeNull();
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });

    test('T3: a fetch resolving {icons:null} behaves like T1', async () => {
        const warn = spyOn(console, 'warn').mockImplementation(() => {});
        try {
            const node = fakeNode(LOGOS_SRC);
            const pele = fakePele();
            await renderDiagrams([node], { pele, fetchJson: async () => ({ icons: null }), fontFamily: 'f' });
            expect(node.innerHTML).toBe(SVG);
            expect(node.classList.contains('pele-error')).toBe(false);
            expect(pele.calls[0][1].icons('logos:aws-lambda')).toBeNull();
            expect(warn).toHaveBeenCalledTimes(1);
        } finally {
            warn.mockRestore();
        }
    });
});

describe('LogosPrefetchGate', () => {
    test('T1: no logos: source means no fetch', async () => {
        const fetchJson = () => Promise.resolve(PACK);
        const spy = { n: 0 };
        await renderDiagrams([fakeNode('graph TD\nA-->B')], {
            pele: fakePele(), fontFamily: 'f', fetchJson: url => { spy.n++; return fetchJson(url); },
        });
        expect(spy.n).toBe(0);
    });

    test('T2: one logos source fetches LOGOS_ICONS_URL once and icons resolve through the pack', async () => {
        const urls = [];
        const node = fakeNode('graph TD\nA-->B logos:aws-lambda');
        const pele = fakePele((src, opts) => ({ svg: `<svg>${opts.icons('logos:aws-lambda')}</svg>` }));
        await renderDiagrams([node], {
            pele, fontFamily: 'f', fetchJson: async url => { urls.push(url); return PACK; },
        });
        expect(urls).toEqual([LOGOS_ICONS_URL]);
        expect(node.innerHTML).toContain('viewBox="0 0 256 256"');
    });

    test('T3: two logos nodes cause exactly one fetch', async () => {
        const urls = [];
        const pele = fakePele();
        await renderDiagrams([fakeNode('logos:aws-lambda'), fakeNode('logos:aws-lambda')], {
            pele, fontFamily: 'f', fetchJson: async url => { urls.push(url); return PACK; },
        });
        expect(urls.length).toBe(1);
    });

    test('T4: a never-settling fetch does not hold back plain nodes; logos node keeps its source', () => {
        const plain = fakeNode('graph TD\nA-->B');
        const logos = fakeNode('logos:aws-lambda');
        const pele = fakePele();
        renderDiagrams([plain, logos], { pele, fontFamily: 'f', fetchJson: () => new Promise(() => {}) });
        expect(plain.innerHTML).toBe(SVG);
        expect(logos.innerHTML).toBe('logos:aws-lambda');
    });

    test('T5: LOGOS_ICONS_URL pins an exact @x.y.z version', () => {
        expect(LOGOS_ICONS_URL).toMatch(/@iconify-json\/logos@\d+\.\d+\.\d+\/icons\.json$/);
    });
});
