interface CanvasTextMeasurer {
  measureText: (text: string) => Pick<TextMetrics, 'width'>
}

const ELLIPSIS = '...'

function truncateToWidth(measurer: CanvasTextMeasurer, text: string, maxWidth: number) {
  if (measurer.measureText(text).width <= maxWidth) return text

  return truncateWithEllipsis(measurer, text, maxWidth)
}

function truncateWithEllipsis(measurer: CanvasTextMeasurer, text: string, maxWidth: number) {
  let trimmed = text
  while (trimmed.length > 1 && measurer.measureText(`${trimmed}${ELLIPSIS}`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1)
  }

  return `${trimmed}${ELLIPSIS}`
}

export function wrapCanvasText(
  measurer: CanvasTextMeasurer,
  text: string,
  maxWidth: number,
  maxLines: number,
) {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  let consumedWords = 0

  for (const word of words) {
    const fittedWord = truncateToWidth(measurer, word, maxWidth)
    const candidate = line ? `${line} ${fittedWord}` : fittedWord

    if (measurer.measureText(candidate).width <= maxWidth) {
      line = candidate
      consumedWords += 1
      continue
    }

    if (line) lines.push(line)
    line = fittedWord
    consumedWords += 1

    if (lines.length === maxLines - 1) break
  }

  if (line && lines.length < maxLines) lines.push(line)

  const didOverflow = consumedWords < words.length
  if (didOverflow && lines.length) {
    const lastLine = lines[lines.length - 1]
    lines[lines.length - 1] = truncateWithEllipsis(measurer, lastLine, maxWidth)
  }

  return lines
}
