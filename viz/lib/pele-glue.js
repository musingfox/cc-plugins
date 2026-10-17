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

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { makeLogosResolver };
}
