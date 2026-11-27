import { describe, expect, it } from 'vitest'
import { parseFlashArchiveGames } from '../src/flash/flashCatalog.js'

describe('Flash archive catalog parser', () => {
  it('extracts title and HTTPS artwork from the approved image host', () => {
    const games = parseFlashArchiveGames('<a href="/flash/ABCD-1234"><span data-work-cover><img src="https://screenshots.flash.homes/cover.webp"></span><span data-work-title><mark>Fruit</mark> Game</span></a>')
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      code: 'ABCD-1234',
      name: 'Fruit Game',
      coverUrl: 'https://screenshots.flash.homes/cover.webp',
    })
  })

  it('keeps games without artwork and rejects non-HTTPS or unapproved hosts', () => {
    const games = parseFlashArchiveGames([
      '<a href="/flash/NO-COVER"><span data-work-title>Plain</span></a>',
      '<a href="/flash/HTTP"><img src="http://screenshots.flash.homes/a.webp"><span data-work-title>HTTP</span></a>',
      '<a href="/flash/OTHER"><img src="https://example.com/a.webp"><span data-work-title>Other</span></a>',
    ].join(''))
    expect(games.map((game) => game.coverUrl)).toEqual([null, null, null])
  })
})
