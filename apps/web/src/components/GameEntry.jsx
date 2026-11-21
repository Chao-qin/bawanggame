import { Button, Card } from 'antd-mobile'

function initialFor(value) {
  return (value || '?').trim().charAt(0).toUpperCase()
}

export function LibraryGameEntry({ game, onOpen, selected, selecting, disabled }) {
  const initial = initialFor(game.name)
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
    <span className="gameArtwork cardIcon">
      {game.iconUrl ? <img className="h-full w-full object-contain image-render-pixel" src={game.iconUrl} alt="" /> : initial}
    </span>
    <span className="gameEntryInfo">
      <span className="cardName">{game.name}</span>
      <span className="cardMeta">{[game.vendor, formatSize(game.size), game.kind === 'j2me' ? (game.local ? '本机已安装' : '服务器提供') : game.local ? '本机' : ''].filter(Boolean).join(' · ') || '\u00a0'}</span>
    </span>
  </button>
}

export function RecentGameEntry({ game, onOpen }) {
  const plays = game.plays != null ? game.plays + ' 次游玩' : ''
  return <button type="button" className="miniCard" onClick={() => onOpen(game)} title={game.name}>
    <span className="gameArtwork cardIcon">{initialFor(game.name)}</span>
    <span className="gameEntryInfo">
      <span className="cardName">{game.name}</span>
      {plays && <span className="cardMeta">{plays}</span>}
    </span>
  </button>
}

export function StoreGameEntry({ icon, title, metadata, description, action, cover, className = 'storeCard' }) {
  return <Card className={className} bodyClassName="storeCardBody">
    {cover
      ? <div className="gameArtwork flashCover"><img src={cover.src || undefined} alt={cover.alt || ''} loading="lazy" onError={cover.onError} /><span aria-hidden="true">{cover.fallback}</span></div>
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
