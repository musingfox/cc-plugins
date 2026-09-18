import { expect, test } from 'claude-code/testing'
import { configOf } from '../hooks/config.ts'
test('reads vault and project among other settings', () => expect(configOf('# c\nvault: obsidian\n\njournal:\n  x: y\nnote:\n  default_folder: Inbox\npm:\n  project: cc-plugins\n')).toEqual({ vault: 'obsidian', project: 'cc-plugins' }))
test('strips config comments', () => expect(configOf('vault: MyVault\nnote:\n  filename_strategy: title     # title | slug\npm:\n  project: my-project          # Omit this section\n')).toEqual({ vault: 'MyVault', project: 'my-project' }))
test('reads quoted vault', () => expect(configOf('vault: "My Vault"\n')).toEqual({ vault: 'My Vault', project: undefined }))
test('reads single quoted values', () => expect(configOf("vault: 'v'\npm:\n  project: 'p'\n")).toEqual({ vault: 'v', project: 'p' }))
test('ignores nested project outside pm', () => expect(configOf('note:\n  project: x\nvault: v\n')).toEqual({ vault: 'v', project: undefined }))
test('ignores flow map pm', () => expect(configOf('pm: {project: p}\nvault: v\n')).toEqual({ vault: 'v', project: undefined }))
test('reads CRLF config', () => expect(configOf('vault: v\r\npm:\r\n  project: p\r\n')).toEqual({ vault: 'v', project: 'p' }))
test('omits empty values', () => expect(configOf('vault:\npm:\n  project: ""\n')).toEqual({ vault: undefined, project: undefined }))
test('omits absent values', () => expect(configOf('')).toEqual({ vault: undefined, project: undefined }))
test('keeps the pm block open across a comment line', () => expect(configOf('vault: v\npm:\n# note\n  project: p\n')).toEqual({ vault: 'v', project: 'p' }))
test('closes the pm block at a vault line', () => expect(configOf('pm:\nvault: v\n  project: p\n')).toEqual({ vault: 'v', project: undefined }))
test('keeps a hash inside a quoted value', () => expect(configOf('vault: "a # b"\n')).toEqual({ vault: 'a # b', project: undefined }))
