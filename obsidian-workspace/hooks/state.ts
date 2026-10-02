import { groupKey } from './list.ts'
import type { ObwList, ObwPane, ObwRing } from '../types/index.d.ts'

export const LOADING: ObwPane = {
  request: 0,
  trail: [],
  message: { kind: 'notice', text: 'Reading the vault…' },
  hint: null,
  listing: null,
  loading: true,
  scope: null,
  views: [],
  chosen: null,
  cards: [],
  allTasks: null,
  selected: null,
  card: null,
}

export const LIST_START: ObwList = { query: '', priority: null, sort: 'priority', folded: [groupKey(0, 'done')] }
export const RING_START: ObwRing = { at: null, item: null }
