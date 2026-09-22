const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{20000}-\u{3fffd}\p{Emoji_Presentation}]/u

const cells = (char: string) => (WIDE.test(char) ? 2 : 1)

export function displayWidth(text: string) {
  let width = 0
  for (const char of text) width += cells(char)
  return width
}

export function fitWidth(text: string, width: number) {
  if (width <= 0) return ''
  if (displayWidth(text) <= width) return text + ' '.repeat(width - displayWidth(text))
  let fitted = ''
  let used = 0
  for (const char of text) {
    if (used + cells(char) + 1 > width) break
    fitted += char
    used += cells(char)
  }
  return fitted + '…' + ' '.repeat(width - used - 1)
}
