import type { Register } from 'claude-code'
import {
  fitLines,
  inlineTextOf,
  leftToRightOf,
  mermaidBlocksOf,
  pickLayout,
  renderOf,
  withoutPseudoStates,
  type Rendered,
} from './diagrams.ts'

// Every ```mermaid block Claude writes is drawn as box art where the fence
// was, in the transcript. /mermaid-inline sets the glyph set and whether
// top-down diagrams may be laid out sideways. The art is plain text: the
// engine skips a rewrite that carries escape sequences.

const COMMAND = 'mermaid-inline'
const PREFS_KEY = 'prefs'
// the transcript's code block has a gutter and margins the art must clear
const INLINE_MARGIN = 6

type Prefs = { ascii: boolean; lr: boolean }
const DEFAULT_PREFS: Prefs = { ascii: false, lr: true }

let prefs: Prefs = DEFAULT_PREFS
const cache = new Map<string, Rendered>()

const isPrefs = (value: unknown): value is Partial<Prefs> => typeof value === 'object' && value !== null

const rendered = (source: string): Rendered => {
  const key = `${prefs.ascii ? 'a' : 'u'}:${source}`
  let out = cache.get(key)
  if (!out) {
    out = renderOf(source, prefs.ascii)
    cache.set(key, out)
  }
  return out
}

const drawn = (source: string, columns: number): Rendered => {
  const prepared = withoutPseudoStates(source)
  const base = rendered(prepared)
  const sideways = prefs.lr ? leftToRightOf(prepared) : null
  return sideways ? pickLayout(base, rendered(sideways), columns) : base
}

const onOff = (word: string): boolean | undefined =>
  word === 'on' || word === 'true' ? true : word === 'off' || word === 'false' ? false : undefined

const status = () => `mermaid-inline: ascii ${prefs.ascii ? 'on' : 'off'} · lr ${prefs.lr ? 'on' : 'off'}`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    const saved = await $.store.get(PREFS_KEY).catch(() => undefined)
    if (isPrefs(saved)) prefs = { ...DEFAULT_PREFS, ...saved }
    await $.command
      .register({
        name: COMMAND,
        description: 'Mermaid diagrams drawn in the transcript: ascii|lr on|off, reset (mermaid-inline)',
        argumentHint: '[ascii|lr on|off | reset]',
        immediate: true,
      })
      .catch(err => $.ui.log(`mermaid-inline: /${COMMAND} not registered: ${err}`))
    return r
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const blocks = mermaidBlocksOf(e.props.text)
    if (blocks.length === 0) return next(e)
    const columns = (e.viewport?.columns ?? 80) - INLINE_MARGIN
    const text = inlineTextOf(e.props.text, blocks, block => {
      const room = columns - block.indent.length
      const art = drawn(block.source, room)
      if (!('lines' in art)) return null
      const fit = fitLines(art.lines, room)
      return fit.overflow > 0 ? [...fit.lines, `… ${fit.overflow} columns cut · widen the terminal`] : fit.lines
    })
    return next({ ...e, props: { ...e.props, text } })
  })

  on('command.run', { command: COMMAND }, async ($, e, next) => {
    const [word = '', value = ''] = e.args.trim().toLowerCase().split(/\s+/)
    const save = async () => {
      await $.store.set(PREFS_KEY, prefs).catch(err => $.ui.log(`mermaid-inline: store write failed: ${err}`))
      cache.clear()
      $.ui.invalidate('ui.render')
    }
    if (word === 'reset') {
      prefs = DEFAULT_PREFS
      await save()
      return { text: status() }
    }
    if (word === 'ascii' || word === 'lr') {
      const flag = onOff(value)
      prefs = { ...prefs, [word]: flag ?? !prefs[word] }
      await save()
      const why = {
        ascii: 'plain ASCII art',
        lr: 'top-down flowcharts and state diagrams laid out left to right when nothing is lost',
      }[word]
      return { text: `mermaid-inline ${word} ${prefs[word] ? 'on' : 'off'} · ${why}` }
    }
    return { text: `${status()} · /mermaid-inline ascii|lr on|off · reset` }
  })
}
