import { Button } from 'antd-mobile'

export function PrimaryNavigation({ items, activeId, onSelect }) {
  return <nav className="tabs" aria-label="游戏库和商城">
    {items.map(({ id, label, Icon }) => (
      <Button
        key={id}
        className={'tab' + (activeId === id ? ' tabActive' : '')}
        fill="none"
        aria-current={activeId === id ? 'page' : undefined}
        onClick={(event) => {
          onSelect(id)
          if (event.detail > 0) event.currentTarget.blur()
        }}
      >
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </Button>
    ))}
  </nav>
}
