import { register } from '../../hooks/register.ts'

export const BAND = {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'above-prompt',
  viewport: { columns: 160, rows: 40 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 9 },
    view: {},
  },
} as const

// Every string drawn: Text children.
export function stringsIn(node: any): string[] {
  if (typeof node === 'string') return node === '' ? [] : [node]
  if (!node || typeof node !== 'object') return []
  return [...(node.children ?? []), ...(node.props?.children ?? [])].flatMap(stringsIn)
}

export function nodesOf(node: any, type: string): any[] {
  if (!node || typeof node !== 'object') return []
  const kids = [...(node.children ?? []), ...(node.props?.children ?? [])]
  return [...(node.type === type ? [node] : []), ...kids.flatMap((kid) => nodesOf(kid, type))]
}

// The band's rows that show: the empty Box the engine draws beneath the band takes none.
export const bandRows = (tree: any): any[] => (tree.props?.children ?? tree.children).filter((row: any) => !(row?.type === 'Box' && !(row.children ?? row.props?.children)?.length))
export const bandLines = async ($: any) => bandRows(await $.ui.render(BAND)).map((row: any) => stringsIn(row).join(''))

// The kit returns the lower result when a hook throws, so a hook's own catch is seen only by calling
// the handler itself.
export function handlerOf(name: string, matcher?: object) {
  let found: any
  register(((...args: any[]) => { if (args[0] === name && JSON.stringify(args[1] ?? undefined) === JSON.stringify(matcher)) found = args.at(-1) }) as any)
  return found
}
