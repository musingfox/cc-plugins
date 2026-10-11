import { bandLines } from './band.ts'

export const first = async ($: any) => (await bandLines($))[0]
export const colorOf = (node: any) => node.props?.color ?? node.color
export const ASYNC = { result: { status: 'async_launched', agentId: 'a1', description: 'd', prompt: 'p', outputFile: '/o' } }

export const bash = async ($: any, w: any, command: string, extra: object = {}) => {
  const result = await $.tool.call({ tool: 'Bash', command, ...extra })
  await w.clock.settle()
  return result
}
