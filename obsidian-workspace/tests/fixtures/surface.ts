// A stand-in for the engine's ClientSurface: elements return plain nodes, onKey is captured,
// posts are recorded, and setState stores the state, counts the call and draws again.
export function fakeSurface(module: (props: any, surface: any) => any, first: any) {
  const surface: any = {
    elements: {
      Box: (props: any) => ({ type: 'Box', props }),
      Text: (props: any) => ({ type: 'Text', props }),
    },
    state: undefined,
    rows: 0,
    columns: 0,
    posts: [] as any[],
    setStateCalls: 0,
    keyHandler: null as null | ((event: any) => void),
    props: first,
    tree: null as any,
    onKey(fn: (event: any) => void) {
      surface.keyHandler = fn
      return () => {}
    },
    onPointer: () => () => {},
    every: () => () => {},
    post(data: any) {
      surface.posts.push(data)
    },
    setState(next: any) {
      surface.state = next
      surface.setStateCalls += 1
      surface.draw()
    },
    draw() {
      surface.tree = module(surface.props, surface)
      return surface.tree
    },
    render(props: any) {
      surface.props = props
      return surface.draw()
    },
    key(key: string) {
      surface.keyHandler?.({ key })
      return surface.tree
    },
  }
  surface.draw()
  return surface
}

export const textsOf = (node: any): any[] => {
  if (!node || typeof node !== 'object') return []
  if (node.type === 'Text') return [node]
  return (node.props?.children ?? []).flatMap(textsOf)
}

// Each drawn Text as the string it reads.
export const linesOf = (tree: any): string[] => textsOf(tree).map((text) => (text.props.children ?? []).join(''))
