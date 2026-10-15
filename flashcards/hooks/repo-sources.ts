import type { EngineInterface } from 'claude-code'
import { hashText, reviewableText } from './hash.ts'
import type { Detection, Source, SourceType } from '../types'

const SPEC_DIR = 'docs/spec'
const ADR_DIRS = ['docs/decisions', 'docs/adr', 'adr', 'decisions']
const SPEC_NAME = /\.md$/
const ADR_NAME = /^[0-9]{4}-.*\.md$/

function directories(): { dir: string; type: SourceType; name: RegExp }[] {
  return [
    { dir: SPEC_DIR, type: 'spec', name: SPEC_NAME },
    ...ADR_DIRS.map((dir) => ({ dir, type: 'adr' as const, name: ADR_NAME })),
  ]
}

// Only the files directly in each directory count; a directory that does not exist contributes nothing.
export async function repoSources($: EngineInterface, root: string): Promise<Detection> {
  const sources: Source[] = []
  const unreadable: string[] = []
  let failure: string | undefined
  for (const { dir, type, name } of directories()) {
    const absolute = `${root}/${dir}`
    if (!(await $.fs.exists(absolute))) continue
    let entries
    try {
      entries = await $.fs.list(absolute)
    } catch (error) {
      failure ??= error instanceof Error ? error.message : String(error)
      continue
    }
    for (const entry of entries.filter((item) => item.kind === 'file' && name.test(item.name))) {
      const path = `${dir}/${entry.name}`
      let raw: string
      try {
        raw = await $.fs.read(`${absolute}/${entry.name}`)
      } catch {
        unreadable.push(path)
        continue
      }
      const text = reviewableText(type, raw)
      sources.push({ path, type, text, hash: await hashText(text), completed: null })
    }
  }
  const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  sources.sort((a, b) => byPath(a.path, b.path))
  unreadable.sort(byPath)
  return failure ? { sources, unreadable, status: 'error', message: failure } : { sources, unreadable, status: 'ok' }
}
