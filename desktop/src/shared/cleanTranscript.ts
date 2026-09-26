/**
 * Removes decoder failure patterns without rewriting ordinary speech.
 *
 * A bad GPU quantization can repeat one token hundreds of times or emit the
 * exact same paragraph twice. Keeping those strings makes task extraction
 * unusable, so collapse only unmistakable consecutive repetition here.
 */
export function cleanTranscriptText(input: string): string {
  const words = input.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ''

  const collapsed: string[] = []
  let previous = ''
  let repeats = 0

  for (const word of words) {
    const normalized = normalize(word)
    if (normalized && normalized === previous) {
      repeats += 1
      if (repeats > 2) continue
    } else {
      previous = normalized
      repeats = 1
    }
    collapsed.push(word)
  }

  if (collapsed.length >= 8 && collapsed.length % 2 === 0) {
    const half = collapsed.length / 2
    const first = collapsed.slice(0, half).map(normalize)
    const second = collapsed.slice(half).map(normalize)
    if (first.every((word, index) => word === second[index])) {
      return collapsed.slice(0, half).join(' ')
    }
  }

  return collapsed.join(' ')
}

function normalize(word: string): string {
  return word.toLocaleLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}
