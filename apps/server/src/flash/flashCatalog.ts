export type FlashArchiveGame = {
  code: string
  name: string
  size: number
  sha256: string
  coverUrl: string | null
  detailUrl: string
  downloadUrl: string
}

function plainText(value: string) {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim()
}

function coverUrl(markup: string) {
  const raw = markup.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)?.[1]
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.hostname !== 'screenshots.flash.homes' || url.username || url.password || url.port) return null
    return url.href
  } catch (_) {
    return null
  }
}

export function parseFlashArchiveGames(html: string): FlashArchiveGame[] {
  const games: FlashArchiveGame[] = []
  for (const match of html.matchAll(/<a\s+[^>]*href=["']\/flash\/([A-Z0-9-]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, code, card] = match
    const title = card.match(/<span\b[^>]*data-work-title[^>]*>([\s\S]*?)<\/span>/i)?.[1]
    if (!title) continue
    games.push({
      code,
      name: plainText(title.replace(/<\/?mark>/gi, '')),
      size: 0,
      sha256: '',
      coverUrl: coverUrl(card),
      detailUrl: `/flash/${code}`,
      downloadUrl: `/flash/${code}/download`,
    })
  }
  return games
}

export function parseFlashArchiveDetail(html: string, code: string): FlashArchiveGame {
  const props = html.match(/component-url=["'][^"']*PlayerStage[^>]*props=["']([^"']+)["']/i)?.[1] ?? ''
  const decoded = props.replace(/&quot;/g, '"').replace(/&amp;/g, '&')
  const title = decoded.match(/"title"[^}]*?"([^"}]+)"/)?.[1] ?? plainText(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? code)
  const size = Number(decoded.match(/"size"\s*:\s*\[0,\s*(\d+)\]/)?.[1] ?? html.match(/contentSize":"(\d+)"/)?.[1] ?? 0)
  const sha256 = decoded.match(/"sha256"[^}]*?"([0-9a-f]{64})"/)?.[1] ?? html.match(/propertyID":"sha256","value":"([0-9a-f]{64})"/)?.[1] ?? ''
  return { code, name: plainText(title), size, sha256, coverUrl: null, detailUrl: `/flash/${code}`, downloadUrl: `/flash/${code}/download` }
}
