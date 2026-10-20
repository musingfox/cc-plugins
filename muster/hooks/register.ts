import { atom } from 'claude-code'
import type { On } from 'claude-code'
import type { Board } from '../types/index.d.ts'

export const board = atom({ plugin: 'muster', key: 'board' } as const, null as Board | null)

export function register(on: On) {}
