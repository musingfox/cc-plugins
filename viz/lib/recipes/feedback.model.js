'use strict';

// Round-trippable markdown model for the generic `feedback` recipe.
// Single source of truth: inlined into feedback.html at render time
// (see render.sh @inline directive) and required by tests in viz/tests/.
//
// The recipe makes NO assumption about the document — the BODY is rendered
// read-only and kept verbatim, never re-serialized. Only the human's feedback
// round-trips through frontmatter: `choice` (one selected option) and `notes`
// (free text). Canonical frontmatter form is `key: value`, or `key:` when empty.

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

    // Selectable option labels, pipe-separated (full-width ｜ or ASCII |).
    function options(model) {
        return String(model.fm.options || '')
            .split(/[｜|]/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
    }

    // Notes round-trip through a single frontmatter line: newlines stored as
    // the literal two-char sequence \n, restored on read.
    function getNotes(model) {
        return String(model.fm.notes || '').replace(/\\n/g, '\n');
    }

    function setFeedback(model, choice, notes) {
        model.fm.choice = choice || '';
        model.fm.notes = String(notes || '').replace(/\r?\n/g, '\\n');
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

    return {
        parse: parse,
        options: options,
        getNotes: getNotes,
        setFeedback: setFeedback,
        serialize: serialize
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createFeedbackModel: createFeedbackModel };
}
if (typeof window !== 'undefined') {
    window.FeedbackModel = createFeedbackModel();
}
