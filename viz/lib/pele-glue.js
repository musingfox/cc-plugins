'use strict';

const MAX_ALIAS_HOPS = 10;

function ownValue(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function hasIcons(pack) {
    return !!pack && typeof pack === 'object' && !!pack.icons && typeof pack.icons === 'object';
}

function makeLogosResolver(pack) {
    if (!hasIcons(pack)) return () => null;
    const { icons, aliases } = pack;

    function findIcon(key) {
        const seen = new Set();
        let current = key;
        for (let hop = 0; hop <= MAX_ALIAS_HOPS; hop++) {
            if (seen.has(current)) return null;
            seen.add(current);
            const icon = ownValue(icons, current);
            if (icon !== undefined) return icon;
            const alias = aliases && typeof aliases === 'object' ? ownValue(aliases, current) : undefined;
            if (!alias || typeof alias.parent !== 'string') return null;
            current = alias.parent;
        }
        return null;
    }

    return function resolve(name) {
        if (typeof name !== 'string' || !name.startsWith('logos:')) return null;
        const icon = findIcon(name.slice('logos:'.length));
        if (!icon || typeof icon !== 'object' || typeof icon.body !== 'string') return null;
        const width = icon.width ?? pack.width ?? 256;
        const height = icon.height ?? pack.height ?? 256;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${icon.body}</svg>`;
    };
}

let idCounter = 0;

function fontFor(node, explicit) {
    if (explicit) return explicit;
    if (typeof getComputedStyle !== 'function') return undefined;
    return getComputedStyle(node).getPropertyValue('--pele-font').trim() || undefined;
}

function drawNode(node, src, deps, icons) {
    const opts = { icons, idPrefix: `pele${++idCounter}-` };
    const font = fontFor(node, deps.fontFamily);
    if (font) opts.fontFamily = font;
    try {
        node.innerHTML = deps.pele.render(src, opts).svg;
    } catch (err) {
        node.textContent = err && err.message ? err.message : String(err);
        node.classList.add('pele-error');
    }
}

const LOGOS_ICONS_URL = 'https://cdn.jsdelivr.net/npm/@iconify-json/logos@1.2.16/icons.json';

const defaultFetchJson = url => fetch(url).then(r => r.json());

async function renderDiagrams(nodes, deps = {}) {
    if (!deps.pele) {
        console.error('pele-glue: pele is not loaded; diagrams are left as source');
        return;
    }
    const sources = [];
    for (const node of nodes) {
        const src = node.dataset && node.dataset.src;
        if (src) sources.push([node, src]);
    }
    const logos = sources.filter(([, src]) => src.includes('logos:'));
    for (const [node, src] of sources) {
        if (!src.includes('logos:')) drawNode(node, src, deps, () => null);
    }
    if (logos.length === 0) return;
    const fetchJson = deps.fetchJson || defaultFetchJson;
    const pack = await fetchJson(LOGOS_ICONS_URL);
    const icons = makeLogosResolver(pack);
    for (const [node, src] of logos) drawNode(node, src, deps, icons);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderDiagrams, makeLogosResolver, LOGOS_ICONS_URL };
}
