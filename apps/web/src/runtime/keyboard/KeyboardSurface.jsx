import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { isActionSupported } from './actions.js'
import { resolveProfile } from './profiles.js'
import { loadKeyboardConfig } from './storage.js'

function shapeProps(control) {
  const x = control.x * 1000
  const y = control.y * 1000
  const width = control.width * 1000
  const height = control.height * 1000
  if (control.shape === 'circle') {
    return { cx: x + width / 2, cy: y + height / 2, r: Math.min(width, height) / 2 }
  }
  return { x, y, width, height, rx: control.shape === 'rounded-rect' ? Math.min(width, height) * 0.18 : 0 }
}

export function KeyboardSurface({ session, input, runtime = 'j2me', gameId, orientation }) {
  const detectOrientation = () => orientation || (typeof window !== 'undefined' && window.innerWidth > window.innerHeight ? 'landscape' : 'portrait')
  const [resolvedOrientation, setResolvedOrientation] = useState(detectOrientation)
  const profile = useMemo(
    () => session?.getProfile?.() || resolveProfile(loadKeyboardConfig(), { runtime, orientation: resolvedOrientation, gameId }),
    [gameId, orientation, runtime, resolvedOrientation, session],
  )
  const [pressed, setPressed] = useState(new Set())
  const [activeProfile, setActiveProfile] = useState(profile)
  const pointers = useRef(new Map())
  const activeProfileRef = useRef(activeProfile)
  activeProfileRef.current = activeProfile
  const releasePointerId = (pointerId) => {
    let sourceId = pointerId
    let press = pointers.current.get(sourceId)
    if (!press && pointers.current.size === 1) {
      ;[sourceId, press] = pointers.current.entries().next().value
    }
    if (!press) return
    pointers.current.delete(sourceId)
    input?.release?.(`pointer:${sourceId}:${press.actionId}`)
    setPressed((current) => {
      const next = new Set(current)
      next.delete(press.controlId)
      return next
    })
  }
  const releaseAllPointers = () => {
    Array.from(pointers.current.keys()).forEach(releasePointerId)
  }

  useEffect(() => {
    const updateOrientation = () => {
      const nextOrientation = detectOrientation()
      setResolvedOrientation(nextOrientation)
      if (!session) setActiveProfile(resolveProfile(loadKeyboardConfig(), { runtime, orientation: nextOrientation, gameId }))
    }
    const updateConfig = () => {
      if (!session) setActiveProfile(resolveProfile(loadKeyboardConfig(), { runtime, orientation: resolvedOrientation, gameId }))
    }
    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', updateOrientation)
    window.addEventListener('xiaochao:viewportchange', updateOrientation)
    window.addEventListener('xiaochao:keyboardprofilechange', updateConfig)
    return () => {
      window.removeEventListener('resize', updateOrientation)
      window.removeEventListener('orientationchange', updateOrientation)
      window.removeEventListener('xiaochao:viewportchange', updateOrientation)
      window.removeEventListener('xiaochao:keyboardprofilechange', updateConfig)
    }
  }, [gameId, orientation, resolvedOrientation, runtime, session])

  useEffect(() => {
    const onPointerEnd = (event) => {
      input?.releasePointer?.(event.pointerId)
      releasePointerId(event.pointerId)
    }
    const onTouchEnd = (event) => {
      if (event.touches?.length) return
      input?.releaseAll?.()
      releaseAllPointers()
    }
    window.addEventListener('pointerup', onPointerEnd, true)
    window.addEventListener('pointercancel', onPointerEnd, true)
    window.addEventListener('touchend', onTouchEnd, true)
    window.addEventListener('touchcancel', onTouchEnd, true)
    return () => {
      window.removeEventListener('pointerup', onPointerEnd, true)
      window.removeEventListener('pointercancel', onPointerEnd, true)
      window.removeEventListener('touchend', onTouchEnd, true)
      window.removeEventListener('touchcancel', onTouchEnd, true)
    }
  }, [input])

  const pressPointer = (event) => {
    const actionId = event.currentTarget?.dataset?.actionId
    if (!input || !actionId || pointers.current.has(event.pointerId)) return
    event.preventDefault()
    pointers.current.set(event.pointerId, { actionId, controlId: event.currentTarget.dataset.controlId })
    input.press(`pointer:${event.pointerId}:${actionId}`, actionId)
    try { event.currentTarget.setPointerCapture?.(event.pointerId) } catch {}
    setPressed((current) => new Set(current).add(event.currentTarget.dataset.controlId))
  }
  const releasePointer = (event) => {
    input?.releasePointer?.(event.pointerId)
    releasePointerId(event.pointerId)
  }

  useLayoutEffect(() => {
    if (!session) return undefined
    const unsubscribePressed = session.subscribePressed((next) => setPressed(new Set(next || [])))
    const unsubscribeProfile = session.subscribeProfile((nextProfile) => {
      releaseAllPointers()
      activeProfileRef.current = nextProfile
      setActiveProfile(nextProfile)
    })
    const node = document.querySelector(`[data-keyboard-session="${session.id}"]`)
    if (node) session.registerSurface(node, profile)
    return () => {
      pointers.current.forEach((press, pointerId) => input?.release?.(`pointer:${pointerId}:${press.actionId}`))
      pointers.current.clear()
      unsubscribePressed?.()
      unsubscribeProfile?.()
      if (node) session.unregisterSurface(node)
    }
  }, [session])

  const current = activeProfileRef.current || profile
  const controls = (current?.layout?.controls || []).filter((control) => control.visible !== false && isActionSupported(control.actionId, runtime))
    .sort((a, b) => a.z - b.z)
  const directionalControls = controls.filter((control) => ['up', 'down', 'left', 'right'].includes(control.id))
  const dpadBounds = directionalControls.length ? directionalControls.reduce((box, control) => ({
    left: Math.min(box.left, control.x),
    top: Math.min(box.top, control.y),
    right: Math.max(box.right, control.x + control.width),
    bottom: Math.max(box.bottom, control.y + control.height),
  }), { left: 1, top: 1, right: 0, bottom: 0 }) : null
  const dpadCenter = dpadBounds ? [(dpadBounds.left + dpadBounds.right) * 500, (dpadBounds.top + dpadBounds.bottom) * 500] : [0, 0]
  const dpadRadius = dpadBounds ? Math.max(dpadBounds.right - dpadBounds.left, dpadBounds.bottom - dpadBounds.top) * 500 : 0
  const tokens = current?.theme?.tokens || {}
  return <svg
    className="keyboard-surface"
    data-keyboard-surface
    data-keyboard-session={session?.id}
    viewBox="0 0 1000 1000"
    preserveAspectRatio="none"
    role="group"
    aria-label={`${runtime} virtual keyboard`}
    style={{ '--keyboard-background': tokens.background, '--keyboard-key-fill': tokens.keyFill, '--keyboard-text': tokens.text, '--keyboard-border': tokens.border, '--keyboard-pressed': tokens.pressed, '--keyboard-focused': tokens.focused }}
    onPointerUpCapture={releasePointer}
    onPointerCancelCapture={releasePointer}
  >
    {dpadBounds && <circle data-control-id="dpad" cx={dpadCenter[0]} cy={dpadCenter[1]} r={dpadRadius} fill="transparent" pointerEvents="none" />}
    {controls.map((control) => {
      const isPressed = pressed.has(control.id)
      const common = {
        ...shapeProps(control),
        transform: control.rotation ? `rotate(${control.rotation} ${(control.x + control.width / 2) * 1000} ${(control.y + control.height / 2) * 1000})` : undefined,
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
        <text
          x={(control.x + control.width / 2) * 1000}
          y={(control.y + control.height / 2) * 1000}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="32"
          transform={control.glyphRotation ? `rotate(${control.glyphRotation} ${(control.x + control.width / 2) * 1000} ${(control.y + control.height / 2) * 1000})` : undefined}
        >{control.label}</text>
      </g>
    })}
  </svg>
}
