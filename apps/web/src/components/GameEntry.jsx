import { Button, Card } from 'antd-mobile'
import { useState } from 'react'
import { mrpBadges } from '../maopao.js'

function initialFor(value) {
  return (value || '?').trim().charAt(0).toUpperCase()
}

export function GameArtwork({ src, name, className = '' }) {
  const [failed, setFailed] = useState(null)
  return <span className={`gameArtwork ${className}`} aria-hidden="true">
    {src && src !== failed ? <img src={src} alt="" onError={() => setFailed(src)} /> : initialFor(name)}
  </span>
}

export function LibraryGameEntry({ game, onOpen, selected, selecting, disabled }) {
  return <button
    type="button"
    className={'card' + (selected ? ' cardSelected' : '')}
    aria-pressed={selecting && game.local ? selected : undefined}
    aria-disabled={disabled || undefined}
    disabled={disabled}
    onClick={() => onOpen(game)}
    title={game.desc || game.name}
  >
    {selected && <span className="cardCheck" aria-hidden="true">✓</span>}
    <GameArtwork src={game.iconUrl} name={game.name} className="cardIcon" />
    <span className="gameEntryInfo">
      <span className="cardName">{game.name}</span>
      <span className="cardMeta">{[game.vendor, formatSize(game.size), game.kind === 'j2me' ? (game.local ? '本机已安装' : '服务器提供') : game.local ? '本机' : '', ...(game.kind === 'maopao' ? mrpBadges(game) : [])].filter(Boolean).join(' · ') || '\u00a0'}</span>
    </span>
  </button>
}

export function RecentGameEntry({ game, onOpen }) {
  const plays = game.plays != null ? game.plays + ' 次游玩' : ''
  return <button type="button" className="miniCard" onClick={() => onOpen(game)} title={game.name}>
    <GameArtwork src={game.iconUrl} name={game.name} className="cardIcon" />
    <span className="gameEntryInfo">
      <span className="cardName">{game.name}</span>
      {plays && <span className="cardMeta">{plays}</span>}
    </span>
  </button>
}

export function StoreGameEntry({ icon, title, metadata, description, action, cover, className = 'storeCard' }) {
  return <Card className={className} bodyClassName="storeCardBody">
    {cover
      ? <GameArtwork className="flashCover" src={cover.src} name={cover.fallback} />
      : <div className="gameArtwork storeIcon">{icon}</div>}
    <div className="storeInfo">
      <h3 className="storeInfoTitle">{title}</h3>
      <p className="storeInfoMeta">{[metadata, description].filter(Boolean).join(' · ')}</p>
    </div>
    <Button className="downloadButton" color="primary" size="small" type="button" onClick={action.onClick} disabled={action.disabled}>
      {action.label}
    </Button>
  </Card>
}

function formatSize(size) {
  if (!size) return ''
  if (size >= 1024 * 1024) return (size / 1024 / 1024).toFixed(1) + ' MB'
  return Math.max(1, Math.round(size / 1024)) + ' KB'
}
