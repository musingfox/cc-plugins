// The directory muster writes runs to: MUSTER_HOME, or HOME's cache; an empty variable counts as unset.
export async function runsRootOf($: any): Promise<string | null> {
  try {
    const muster = await $.env.get('MUSTER_HOME')
    const home = await $.env.get('HOME')
    const base = muster || (home ? `${home}/.cache/muster` : null)
    return base ? `${base}/runs` : null
  } catch {
    return null
  }
}

