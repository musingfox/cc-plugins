// A value wrapped in matching double or single quotes, with the quotes taken off.
export function unquote(value: string) {
  const quote = value[0]
  if (value.length >= 2 && (quote === '"' || quote === "'") && value.at(-1) === quote) return value.slice(1, -1)
  return value
}
