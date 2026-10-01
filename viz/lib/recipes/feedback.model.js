'use strict';

// Round-trippable markdown model for the generic `feedback` recipe.
// Single source of truth: inlined into feedback.html at render time
// (see render.sh @inline directive) and required by tests in viz/tests/.
//
// The recipe makes NO assumption about the document — the BODY is rendered
// read-only and kept verbatim, never re-serialized. Only the human's feedback
// round-trips through frontmatter: `choice` (one selected option) and `notes`
// (free text). Canonical frontmatter form is `key: value`, or `key:` when empty.
//
// Round mode: a DOTTED key (`q1.options`, `q1.choice`, …) declares a field of a
// per-question block, so one document can carry several independent decisions.
// Any dotted key switches the recipe into round mode, where the top-level
// `options`/`recommend`/`choice` are ignored. A question's `choice` is always a
// LIST — pipe-joined on disk, one element for a single-select question — so
// serialization never needs to know whether `multi` was set; that flag only
// decides how the UI toggles.

function createFeedbackModel() {
    // Split `---\n<fm>\n---\n<body>`; body is captured VERBATIM. A doc without
    // a leading frontmatter block is treated as all-body (no controls panel).
    function parse(md) {
        var m = md.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        var fm = {}, order = [], body = md;
        if (m) {
            body = m[2];
            m[1].split('\n').forEach(function (line) {
                var kv = line.match(/^([^:]+?):\s*(.*)$/);
                if (kv) {
                    var k = kv[1].trim();
                    fm[k] = kv[2].trim().replace(/^["']|["']$/g, '');
                    order.push(k);
                }
            });
        }
        return { fm: fm, fmOrder: order, body: body };
    }

    var Q_KEY = /^([^.\s]+)\.(title|options|recommend|multi|choice|notes)$/;

    function splitPipes(v) {
        return String(v || '')
            .split(/[｜|]/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
    }

    function unescapeNotes(v) {
        return String(v || '').replace(/\\n/g, '\n');
    }

    function escapeNotes(v) {
        return String(v || '').replace(/\r?\n/g, '\\n');
    }

    // Question ids in document order, deduped by first appearance.
    function questionIds(model) {
        var ids = [], seen = {};
        model.fmOrder.forEach(function (k) {
            var m = k.match(Q_KEY);
            if (m && !seen[m[1]]) { seen[m[1]] = true; ids.push(m[1]); }
        });
        return ids;
    }

    function questions(model) {
        return questionIds(model).map(function (id) {
            return {
                id: id,
                title: String(model.fm[id + '.title'] || '').trim(),
                options: splitPipes(model.fm[id + '.options']),
                recommend: String(model.fm[id + '.recommend'] || '').trim(),
                multi: String(model.fm[id + '.multi'] || '').trim().toLowerCase() === 'true',
                choice: splitPipes(model.fm[id + '.choice']),
                notes: unescapeNotes(model.fm[id + '.notes'])
            };
        });
    }

    // Selectable option labels, pipe-separated (full-width ｜ or ASCII |).
    // Round mode owns the whole panel, so the top-level list stays out of it.
    function options(model) {
        if (questionIds(model).length) return [];
        return splitPipes(model.fm.options);
    }

    // Notes round-trip through a single frontmatter line: newlines stored as
    // the literal two-char sequence \n, restored on read.
    function getNotes(model) {
        return unescapeNotes(model.fm.notes);
    }

    // Which labels a click leaves selected. Multi accumulates; single replaces,
    // and re-clicking the sole selection keeps it.
    function toggle(choices, label, multi) {
        var cur = (choices || []).slice();
        var i = cur.indexOf(label);
        if (!multi) return [label];
        if (i === -1) cur.push(label); else cur.splice(i, 1);
        return cur;
    }

    // A written key lands inside its own question block, never at the end of
    // the frontmatter — otherwise q1's answer drifts below q2's title.
    function setQuestionKey(model, id, field, value) {
        var key = id + '.' + field;
        model.fm[key] = value;
        if (model.fmOrder.indexOf(key) !== -1) return;
        var last = -1;
        model.fmOrder.forEach(function (k, i) {
            var m = k.match(Q_KEY);
            if (m && m[1] === id) last = i;
        });
        if (last === -1) model.fmOrder.push(key);
        else model.fmOrder.splice(last + 1, 0, key);
    }

    // Round-level free text, without touching the single-question `choice`.
    function setNotes(model, notes) {
        model.fm.notes = escapeNotes(notes);
        if (model.fmOrder.indexOf('notes') === -1) model.fmOrder.push('notes');
    }

    function setAnswer(model, id, choices, notes) {
        setQuestionKey(model, id, 'choice', (choices || []).join(' | '));
        setQuestionKey(model, id, 'notes', escapeNotes(notes));
    }

    function setFeedback(model, choice, notes) {
        model.fm.choice = choice || '';
        model.fm.notes = escapeNotes(notes);
        if (model.fmOrder.indexOf('choice') === -1) model.fmOrder.push('choice');
        if (model.fmOrder.indexOf('notes') === -1) model.fmOrder.push('notes');
    }

    function serialize(model) {
        var out = '---\n';
        model.fmOrder.forEach(function (k) {
            var v = model.fm[k];
            out += (v == null || v === '') ? (k + ':\n') : (k + ': ' + v + '\n');
        });
        out += '---\n' + model.body;
        return out;
    }

    // Card view: a read-only projection of the body's lexer tokens (marked's
    // `lexer` output) onto the round's questions. It never feeds serialize —
    // the body stays verbatim — so a section it cannot read is passed through
    // as tokens, not dropped. `usable` is false when no h2 matches a question
    // title; the page then keeps the plain markdown view.
    var LEVELS = { '低': 1, '中低': 2, '中': 3, '中高': 4, '高': 5 };
    var LEVEL_CELL = /^(中高|中低|高|中|低)(?:\s*[：:]\s*([\s\S]*))?$/;
    var PROS = /好處|優點|pros?$/i;
    var CONS = /代價|缺點|cons?$/i;

    function plainCell(text) {
        return String(text || '').replace(/\*\*/g, '').trim();
    }

    function splitPhrases(text) {
        return String(text || '').split('；').map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function asLevel(label, text) {
        var m = plainCell(text).match(LEVEL_CELL);
        return m ? { label: label, word: m[1], level: LEVELS[m[1]], why: (m[2] || '').trim() } : null;
    }

    // An h3 whose text equals one of `keys` owns the tokens up to the next
    // heading of depth ≤ 3; every other token stays in the flow.
    function pullDetails(tokens, keys) {
        var flow = [], details = {}, cur = null;
        tokens.forEach(function (t) {
            if (t.type === 'heading' && t.depth <= 3) cur = null;
            var key = t.type === 'heading' && t.depth === 3 ? t.text.trim() : null;
            if (key !== null && keys.indexOf(key) !== -1 && !details[key]) {
                cur = details[key] = [];
                return;
            }
            (cur || flow).push(t);
        });
        return { flow: flow, details: details };
    }

    function card(q, label, header, row, details) {
        var c = {
            label: label, recommend: label === q.recommend,
            pros: [], cons: [], extras: [], cost: null, detail: details[label] || null
        };
        (row || []).slice(1).forEach(function (cell, i) {
            var head = plainCell(header[i + 1] && header[i + 1].text);
            var level = !c.cost && asLevel(head, cell.text);
            if (level) c.cost = level;
            else if (PROS.test(head)) c.pros = c.pros.concat(splitPhrases(cell.text));
            else if (CONS.test(head)) c.cons = c.cons.concat(splitPhrases(cell.text));
            else c.extras.push({ label: head, text: cell.text.trim() });
        });
        return c;
    }

    function decisionBlocks(q, tokens) {
        var pulled = pullDetails(tokens, q.options);
        var optionTable = pulled.flow.filter(function (t) {
            return t.type === 'table' && t.rows.some(function (r) {
                return q.options.indexOf(plainCell(r[0].text)) !== -1;
            });
        })[0] || null;
        var rowFor = {};
        if (optionTable) optionTable.rows.forEach(function (r) { rowFor[plainCell(r[0].text)] = r; });
        var cards = {
            type: 'cards',
            cards: q.options.map(function (label) {
                return card(q, label, optionTable ? optionTable.header : [], rowFor[label], pulled.details);
            })
        };
        var blocks = pulled.flow.map(function (t) {
            if (t === optionTable) return cards;
            if (t.type === 'blockquote') return { type: 'verdict', token: t };
            return { type: 'token', token: t };
        });
        if (!optionTable) blocks.push(cards);
        return blocks;
    }

    function sectionBlocks(tokens) {
        var isTiles = function (t) {
            return t.type === 'table' && t.header.length >= 2 && t.header.length <= 4;
        };
        var keys = [];
        tokens.forEach(function (t) {
            if (isTiles(t)) t.rows.forEach(function (r) { keys.push(plainCell(r[0].text)); });
        });
        var pulled = pullDetails(tokens, keys);
        return pulled.flow.map(function (t) {
            if (!isTiles(t)) return { type: 'token', token: t };
            return {
                type: 'tiles',
                tiles: t.rows.map(function (r) {
                    var title = plainCell(r[0].text);
                    return {
                        title: title,
                        fields: r.slice(1).map(function (cell, i) {
                            return { label: plainCell(t.header[i + 1].text), text: cell.text.trim() };
                        }),
                        detail: pulled.details[title] || null
                    };
                })
            };
        });
    }

    function project(tokens, qs) {
        var hero = [], parts = [], cur = null;
        (tokens || []).forEach(function (t) {
            if (t.type === 'heading' && t.depth === 2) {
                cur = { title: t.text.trim(), tokens: [] };
                parts.push(cur);
            } else (cur ? cur.tokens : hero).push(t);
        });
        var usable = false;
        var sections = parts.map(function (p) {
            var q = (qs || []).filter(function (x) { return x.title === p.title; })[0];
            if (!q) return { kind: 'section', title: p.title, blocks: sectionBlocks(p.tokens) };
            usable = true;
            return { kind: 'decision', id: q.id, title: p.title, blocks: decisionBlocks(q, p.tokens) };
        });
        return { usable: usable, hero: hero, sections: sections };
    }

    return {
        parse: parse,
        project: project,
        options: options,
        questions: questions,
        toggle: toggle,
        getNotes: getNotes,
        setFeedback: setFeedback,
        setNotes: setNotes,
        setAnswer: setAnswer,
        serialize: serialize
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createFeedbackModel: createFeedbackModel };
}
if (typeof window !== 'undefined') {
    window.FeedbackModel = createFeedbackModel();
}
