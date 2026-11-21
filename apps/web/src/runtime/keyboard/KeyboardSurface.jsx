import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isActionSupported } from './actions.js'
import { resolveProfile } from './profiles.js'

function shapeProps(control) {
  if (control.shape === 'circle') {
    return { cx: control.x + control.width / 2, cy: control.y + control.height / 2, r: Math.min(control.width, control.height) / 2 }
  }
  return { x: control.x, y: control.y, width: control.width, height: control.height, rx: control.shape === 'rounded-rect' ? Math.min(control.width, control.height) * 0.18 : 0 }
}

export function KeyboardSurface({ session, input, runtime = 'j2me', gameId, orientation }) {
  const resolvedOrientation = orientation || (typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
  const profile = useMemo(() => session?.getProfile?.() || resolveProfile({}, { runtime, orientation: resolvedOrientation, gameId }), [gameId, orientation, runtime, resolvedOrientation, session])
  const [pressed, setPressed] = useState(new Set())
  const [activeProfile, setActiveProfile] = useState(profile)
  const pointers = useRef(new Map())

  const pressPointer = (event) => {
    const actionId = event.currentTarget?.dataset?.actionId
    if (!input || !actionId || pointers.current.has(event.pointerId)) return
    event.preventDefault()
    pointers.current.set(event.pointerId, actionId)
    input.press(`pointer:${event.pointerId}:${actionId}`, actionId)
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch {}
    setPressed((current) => new Set(current).add(event.currentTarget.dataset.controlId))
  }
  const releasePointer = (event) => {
    const actionId = pointers.current.get(event.pointerId)
    if (!actionId) return
    pointers.current.delete(event.pointerId)
    input.release(`pointer:${event.pointerId}:${actionId}`)
    setPressed((current) => {
      const next = new Set(current)
      next.delete(event.currentTarget?.dataset?.controlId)
      return next
    })
  }

  useLayoutEffect(() => {
    if (!session) return undefined
    const unsubscribePressed = session.subscribePressed((next) => setPressed(new Set(next || [])))
    const unsubscribeProfile = session.subscribeProfile(setActiveProfile)
    const node = document.querySelector(`[data-keyboard-session="${session.id}"]`)
    if (node) session.registerSurface(node, profile)
    return () => {
      pointers.current.forEach((actionId, pointerId) => input?.release?.(`pointer:${pointerId}:${actionId}`))
      pointers.current.clear()
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
        onPointerDown={pressPointer}
        onPointerUp={releasePointer}
        onPointerCancel={releasePointer}
        onLostPointerCapture={releasePointer}
      >
        {control.shape === 'circle' ? <circle {...common} /> : <rect {...common} />}
        <text x={control.x + control.width / 2} y={control.y + control.height / 2} textAnchor="middle" dominantBaseline="central">{control.label}</text>
      </g>
    })}
  </svg>
}
