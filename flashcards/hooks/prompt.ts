import type { Kind, Source, SourceType } from '../types'

export const KINDS: Record<SourceType, Kind[]> = { spec: ['rule'], adr: ['why'], task: ['why', 'what-for'] }

function blockOf(source: Source): string {
  return [
    `=== SOURCE path="${source.path}" type="${source.type}" kinds="${KINDS[source.type].join(', ')}" ===`,
    source.text,
    '=== END SOURCE ===',
  ].join('\n')
}

// Self-contained so the subagent needs no tools: the rules, the output shape and every source inline.
export function batchPrompt(sources: Source[]): string {
  return [
    'You write review flashcards so a developer can remember what their own project built and why.',
    '',
    'Input: the sources delimited below. Each is one source: a finished task card, an architecture spec, or a decision record.',
    'Output: reply with only a JSON array, one element per card, and no prose before or after it:',
    '[{ "source": "<the path given in that source\'s header>", "kind": "why" | "what-for" | "rule", "q": "...", "a": "...", "quote": "<verbatim sentence from the source that supports the answer>" }]',
    '',
    'Rules:',
    '- 1 to 3 cards per source. Fewer good cards beat more weak ones; skip a source with nothing worth remembering.',
    '- Use only the kinds the source header allows: a spec takes rule, a decision record takes why, a task takes why or what-for.',
    '  - why: why was it decided this way, what was rejected, what went wrong before.',
    '  - what-for: what problem does this feature solve, for whom.',
    '  - rule: what must never happen or must always hold, and the reason.',
    '- Never ask for names, file paths, version numbers, dates, counts, or command spellings. Never ask a question whose answer is a single identifier.',
    '- The question must stand alone: name the plugin or feature it is about, so it makes sense shuffled among others.',
    '- The answer is one or two short sentences, answerable from the source alone. Do not add outside knowledge.',
    '- "quote" must be copied verbatim from its source; if you cannot find one, drop the card.',
    '- Write q and a in Traditional Chinese, with technical terms in English. Keep quote in the source language.',
    '',
    'Use no tools. Everything you need is below.',
    '',
    ...sources.map(blockOf),
  ].join('\n')
}
