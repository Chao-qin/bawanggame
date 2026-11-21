import { useLayoutEffect, useMemo, useState } from 'react'
import { isActionSupported } from './actions.js'
import { resolveProfile } from './profiles.js'

function shapeProps(control) {
  if (control.shape === 'circle') {
    return { cx: control.x + control.width / 2, cy: control.y + control.height / 2, r: Math.min(control.width, control.height) / 2 }
  }
  return { x: control.x, y: control.y, width: control.width, height: control.height, rx: control.shape === 'rounded-rect' ? Math.min(control.width, control.height) * 0.18 : 0 }
}

export function KeyboardSurface({ session, runtime = 'j2me', gameId, orientation }) {
  const resolvedOrientation = orientation || (typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
  const profile = useMemo(() => session?.getProfile?.() || resolveProfile({}, { runtime, orientation: resolvedOrientation, gameId }), [gameId, orientation, runtime, resolvedOrientation, session])
  const [pressed, setPressed] = useState(new Set())
  const [activeProfile, setActiveProfile] = useState(profile)

  useLayoutEffect(() => {
    if (!session) return undefined
    const unsubscribePressed = session.subscribePressed(setPressed)
    const unsubscribeProfile = session.subscribeProfile(setActiveProfile)
    const node = document.querySelector(`[data-keyboard-session="${session.id}"]`)
    if (node) session.registerSurface(node, profile)
    return () => {
      unsubscribePressed?.()
      unsubscribeProfile?.()
      if (node) session.unregisterSurface(node)
    }
  }, [profile, session])

  const current = activeProfile || profile
  const controls = (current?.layout?.controls || []).filter((control) => control.visible !== false && isActionSupported(control.actionId, runtime))
    .sort((a, b) => a.z - b.z)
  const tokens = current?.theme?.tokens || {}
  return <svg
    className="keyboard-surface"
    data-keyboard-surface
    data-keyboard-session={session?.id}
    viewBox="0 0 1 1"
    preserveAspectRatio="none"
    role="group"
    aria-label={`${runtime} virtual keyboard`}
    style={{ '--keyboard-background': tokens.background, '--keyboard-key-fill': tokens.keyFill, '--keyboard-text': tokens.text, '--keyboard-border': tokens.border, '--keyboard-pressed': tokens.pressed, '--keyboard-focused': tokens.focused }}
  >
    {controls.map((control) => {
      const isPressed = pressed.has(control.id)
      const common = {
        ...shapeProps(control),
        transform: control.rotation ? `rotate(${control.rotation} ${control.x + control.width / 2} ${control.y + control.height / 2})` : undefined,
      }
      return <g
        key={control.id}
        data-control-id={control.id}
        data-action-id={control.actionId}
        tabIndex="0"
        role="button"
        aria-label={control.label}
        aria-pressed={isPressed}
        pointerEvents="all"
        className={isPressed ? 'keyboard-key is-pressed' : 'keyboard-key'}
      >
        {control.shape === 'circle' ? <circle {...common} /> : <rect {...common} />}
        <text x={control.x + control.width / 2} y={control.y + control.height / 2} textAnchor="middle" dominantBaseline="central">{control.label}</text>
      </g>
    })}
  </svg>
}
