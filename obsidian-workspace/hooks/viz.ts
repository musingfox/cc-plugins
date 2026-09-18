// A relative directory has no defined base for $.fs, so it gives no manifest rather than a guessed one.
export function vizManifestPath(configDir: string | undefined, home: string | undefined): string | null {
  if (configDir) return configDir.startsWith('/') ? `${configDir}/plugins/installed_plugins.json` : null
  if (home?.startsWith('/')) return `${home}/.claude/plugins/installed_plugins.json`
  return null
}
