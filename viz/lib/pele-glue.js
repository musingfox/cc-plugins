// Page scripts share one global scope; everything here stays inside this
// function and is exported as `vizPele` (module.exports under bun test).
(function () {
    'use strict';

    const MAX_ALIAS_HOPS = 10;

    function ownValue(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
    }

    function hasIcons(pack) {
        return !!pack && typeof pack === 'object' && !!pack.icons && typeof pack.icons === 'object';
    }

    let logosIdCounter = 0;

    function scopeIds(body) {
        const ids = new Set([...body.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
        if (ids.size === 0) return body;
        const prefix = `logos${++logosIdCounter}-`;
        return body.replace(/(\sid="|url\(#|url\('#|url\("#|href="#)([^"')\s]+)/g,
            (match, lead, id) => (ids.has(id) ? lead + prefix + id : match));
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
            return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">${scopeIds(icon.body)}</svg>`;
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
        const logos = [];
        for (const node of Array.from(nodes)) {
            const src = node.dataset && node.dataset.src;
            if (src == null) continue;
            if (src.includes('logos:')) logos.push([node, src]);
            else drawNode(node, src, deps, () => null);
        }
        if (logos.length === 0) return;
        const fetchJson = deps.fetchJson || defaultFetchJson;
        let pack = null;
        try {
            pack = await fetchJson(LOGOS_ICONS_URL);
        } catch (err) {
            pack = null;
        }
        if (!hasIcons(pack)) console.warn('pele-glue: logos icon pack unavailable; logos icons are drawn empty');
        const icons = makeLogosResolver(pack);
        for (const [node, src] of logos) drawNode(node, src, deps, icons);
    }

    const api = { renderDiagrams, makeLogosResolver, LOGOS_ICONS_URL };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else globalThis.vizPele = api;
})();
