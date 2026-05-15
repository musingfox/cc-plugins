'use strict';

// Round-trippable markdown model for the pr-review recipe.
// Single source of truth: inlined into pr-review.html at render time
// (see render.sh @inline directive) and required by tests in viz/tests/.

function createPRReviewModel(marked) {
    function parseFrontmatter(md) {
        var m = md.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        if (!m) return { fm: {}, fmOrder: [], body: md };
        var fm = {}, order = [];
        m[1].split('\n').forEach(function(line) {
            var kv = line.match(/^([^:]+?):\s*(.*)$/);
            if (kv) {
                var k = kv[1].trim();
                fm[k] = kv[2].trim().replace(/^["']|["']$/g, '');
                order.push(k);
            }
        });
        return { fm: fm, fmOrder: order, body: m[2] };
    }

    function extractItemText(item) {
        if (item.text) return item.text.split('\n')[0];
        if (item.tokens) {
            for (var i = 0; i < item.tokens.length; i++) {
                var t = item.tokens[i];
                if (t.type === 'text' || t.type === 'paragraph') return t.text;
            }
        }
        return '';
    }

    function parseModel(md) {
        var fm = parseFrontmatter(md);
        var tokens = marked.lexer(fm.body);
        var model = {
            fm: fm.fm, fmOrder: fm.fmOrder,
            summary: '', sections: []
        };
        var curSection = null, curFinding = null, inSummary = false;
        var summaryParts = [];

        tokens.forEach(function(tok) {
            if (tok.type === 'heading' && tok.depth === 1) {
                inSummary = tok.text.toLowerCase().indexOf('summary') !== -1;
                curFinding = null;
            } else if (tok.type === 'heading' && tok.depth === 2) {
                curSection = { severity: tok.text, findings: [] };
                model.sections.push(curSection);
                curFinding = null;
                inSummary = false;
            } else if (tok.type === 'heading' && tok.depth === 3 && curSection) {
                curFinding = { title: tok.text, meta: {}, metaOrder: [] };
                curSection.findings.push(curFinding);
                inSummary = false;
            } else if (tok.type === 'list' && curFinding) {
                tok.items.forEach(function(item) {
                    var text = extractItemText(item);
                    var kv = text.match(/^([^:]+?):\s*(.*)$/);
                    if (kv) {
                        var k = kv[1].trim(), v = kv[2].trim();
                        if (!(k in curFinding.meta)) curFinding.metaOrder.push(k);
                        curFinding.meta[k] = v;
                    }
                });
            } else if ((tok.type === 'paragraph' || tok.type === 'text') && inSummary) {
                summaryParts.push(tok.text);
            }
        });
        model.summary = summaryParts.join('\n\n');
        return model;
    }

    function serializeModel(model) {
        var out = '---\n';
        model.fmOrder.forEach(function(k) {
            out += k + ': ' + model.fm[k] + '\n';
        });
        out += '---\n\n';
        if (model.summary && model.summary.trim()) {
            out += '# Summary\n\n' + model.summary.trim() + '\n\n';
        }
        model.sections.forEach(function(sec) {
            out += '## ' + sec.severity + '\n\n';
            sec.findings.forEach(function(f) {
                out += '### ' + f.title + '\n';
                if (f.meta.status && f.metaOrder.indexOf('status') === -1) {
                    f.metaOrder.push('status');
                }
                f.metaOrder.forEach(function(k) {
                    if (k in f.meta) out += '- ' + k + ': ' + f.meta[k] + '\n';
                });
                out += '\n';
            });
        });
        return out.replace(/\n+$/, '') + '\n';
    }

    return {
        parseFrontmatter: parseFrontmatter,
        extractItemText: extractItemText,
        parseModel: parseModel,
        serializeModel: serializeModel
    };
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createPRReviewModel: createPRReviewModel };
}
if (typeof window !== 'undefined' && window.marked) {
    window.PRReviewModel = createPRReviewModel(window.marked);
}
