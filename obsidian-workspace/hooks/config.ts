export function configOf(text: string): { vault?: string; project?: string } {
  let vault: string | undefined, project: string | undefined, pm = false
  const value = (raw: string) => { let v = raw.trim().replace(/\s+#.*$/, '').trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1); return v || undefined }
  for (const raw of text.split('\n')) { const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
    if (/^vault:/.test(line)) vault = value(line.slice(6)); else if (/^pm:\s*$/.test(line)) pm = true
    else if (/^[^\s]/.test(line)) pm = false
    else if (pm && /^\s+project:/.test(line)) project = value(line.replace(/^\s+project:/, ''))
  }
  return { vault, project }
}
