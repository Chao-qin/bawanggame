import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Layer, Rect, Stage, Text } from 'react-konva'
import { createPointerState, pointerCancel, pointerDown, pointerUp, pressedKeyIds, releaseAll } from './pointer-state.js'

const KEY_FILL = { abxy: '#d28b63', dpad: '#75a9c8', soft: '#34445a' }

/** Legend placement for any key height: centred, with the secondary legend under the main one — or, on keys much
 *  wider than tall (a phone's digit keys), beside it, the way "2 abc" is printed on a candybar phone. */
export function legendLayout(item) {
  const face = item.height - 0.08
  const size = Math.min(0.28, item.width * 0.32, face * 0.48)
  if (!item.secondaryLegend) return { main: { x: 0.06, y: (face - size) / 2, width: item.width - 0.2, size, align: 'center' } }
  const small = Math.min(0.18, face * 0.3)
  if (item.width >= item.height * 1.6) {
    return {
      main: { x: 0, y: (face - size) / 2, width: item.width * 0.5, size, align: 'right' },
      secondary: { x: item.width * 0.56, y: (face - small) / 2 + size * 0.08, width: item.width * 0.4, size: small, align: 'left' },
    }
  }
  return {
    main: { x: 0.06, y: face * 0.13, width: item.width - 0.2, size, align: 'center' },
    secondary: { x: 0.12, y: face * 0.68, width: item.width - 0.2, size: small, align: 'left' },
  }
}

/** One key, drawn in device pixels rather than by scaling a group of 1-unit keys: legends would otherwise be laid
 *  out at a ~0.3px font size, where CJK glyph measurement collapses and labels overlap. Depth comes from a solid
 *  edge, not shadowBlur — a blurred shadow per key over a DPR-3 canvas cost seconds per frame on a 4x-throttled
 *  CPU and froze the game beside it. */
function KeyFace({ item, scale, pressed }) {
  const legend = legendLayout(item)
  const u = (value) => value * scale
  const face = { width: u(item.width - 0.08), height: u(item.height - 0.08), cornerRadius: u(0.12), perfectDrawEnabled: false }
  return <>
    {!pressed && <Rect {...face} y={u(0.06)} fill="#0b1118" listening={false} />}
    {/* The held face sits exactly on the resting one (no sink offset), so nothing of the resting key shows. */}
    <Rect
      {...face}
      fill={pressed ? '#74d8bd' : KEY_FILL[item.block] || '#273444'}
      stroke={pressed ? '#dbfff4' : '#65748a'}
      strokeWidth={u(0.035)}
    />
    <Text
      x={u(legend.main.x)}
      y={u(legend.main.y)}
      width={u(legend.main.width)}
      text={item.label}
      fontFamily="system-ui, sans-serif"
      fontSize={u(legend.main.size)}
      fontStyle="600"
      align={legend.main.align}
      wrap="none"
      fill={pressed ? '#102720' : '#f2f6fb'}
      listening={false}
    />
    {legend.secondary && (
      <Text
        x={u(legend.secondary.x)}
        y={u(legend.secondary.y)}
        width={u(legend.secondary.width)}
        text={item.secondaryLegend}
        fontFamily="system-ui, sans-serif"
        fontSize={u(legend.secondary.size)}
        align={legend.secondary.align}
        wrap="none"
        fill={pressed ? '#102720' : '#aebacf'}
        listening={false}
      />
    )}
  </>
}

function boundsFor(keys) {
  return keys.reduce((bounds, item) => ({
    left: Math.min(bounds.left, item.x),
    top: Math.min(bounds.top, item.y),
    right: Math.max(bounds.right, item.x + item.width),
    bottom: Math.max(bounds.bottom, item.y + item.height),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity })
}

export function KeyboardCanvas({ layout, onKeyDown, onKeyUp, accessibleLabel = 'Keyboard layout' }) {
  const hostRef = useRef(null)
  const pointerState = useRef(createPointerState())
  const pointerTargets = useRef(new Map())
  const callbacks = useRef({ onKeyDown, onKeyUp })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [pressed, setPressed] = useState(new Set())
  const bounds = useMemo(() => boundsFor(layout.keys), [layout])
  const designWidth = bounds.right - bounds.left
  const designHeight = bounds.bottom - bounds.top
  const height = size.height || 360
  const scale = size.width > 0 && designWidth > 0 && designHeight > 0
    ? Math.min(size.width / designWidth, height / designHeight)
    : 0
  const offsetX = (size.width - designWidth * scale) / 2 - bounds.left * scale
  const offsetY = (height - designHeight * scale) / 2 - bounds.top * scale

  useEffect(() => { callbacks.current = { onKeyDown, onKeyUp } }, [onKeyDown, onKeyUp])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const update = () => {
      const rect = host.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(update)
    observer.observe(host)
    update()
    return () => observer.disconnect()
  }, [])

  const syncPressed = useCallback(() => setPressed(pressedKeyIds(pointerState.current)), [])

  const release = useCallback((pointerId, cancel = false) => {
    const state = pointerState.current
    const keyId = state.pointers[pointerId]
    if (keyId === undefined) return
    pointerState.current = cancel ? pointerCancel(state, pointerId) : pointerUp(state, pointerId)
    const keyData = layout.keys.find((item) => item.id === keyId)
    if (keyData) callbacks.current.onKeyUp?.(keyData, pointerId)
    const target = pointerTargets.current.get(pointerId)
    if (target?.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId)
    pointerTargets.current.delete(pointerId)
    syncPressed()
  }, [layout, syncPressed])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const handleUp = (event) => release(event.pointerId)
    const handleCancel = (event) => release(event.pointerId, true)
    const handleBlur = () => {
      const { state, released } = releaseAll(pointerState.current)
      pointerState.current = state
      for (const item of released) {
        const keyData = layout.keys.find((keyItem) => keyItem.id === item.keyId)
        const pointerId = Number(item.pointerId)
        if (keyData) callbacks.current.onKeyUp?.(keyData, pointerId)
        const target = pointerTargets.current.get(pointerId)
        if (target?.hasPointerCapture?.(pointerId)) target.releasePointerCapture(pointerId)
      }
      pointerTargets.current.clear()
      syncPressed()
    }
    host.addEventListener('pointerup', handleUp)
    host.addEventListener('pointercancel', handleCancel)
    window.addEventListener('blur', handleBlur)
    return () => {
      host.removeEventListener('pointerup', handleUp)
      host.removeEventListener('pointercancel', handleCancel)
      window.removeEventListener('blur', handleBlur)
      handleBlur()
    }
  }, [layout, release, syncPressed])

  const press = useCallback((keyData, event) => {
    const pointerId = event.evt.pointerId
    if (pointerState.current.pointers[pointerId] !== undefined) return
    event.evt.preventDefault()
    pointerState.current = pointerDown(pointerState.current, pointerId, keyData.id)
    const canvas = hostRef.current?.querySelector('canvas')
    if (canvas?.setPointerCapture) {
      try {
        canvas.setPointerCapture(pointerId)
        pointerTargets.current.set(pointerId, canvas)
      } catch {
        pointerTargets.current.delete(pointerId)
      }
    }
    callbacks.current.onKeyDown?.(keyData, pointerId, event.evt)
    syncPressed()
  }, [syncPressed])

  const restingKeys = useMemo(() => (
    <Group x={offsetX} y={offsetY}>
      {layout.keys.map((item) => (
        <Group key={item.id} x={item.x * scale} y={item.y * scale} onPointerDown={(event) => press(item, event)}>
          <KeyFace item={item} scale={scale} pressed={false} />
        </Group>
      ))}
    </Group>
  ), [layout, offsetX, offsetY, scale, press])

  return (
    <div
      ref={hostRef}
      className="keyboardCanvas"
      data-layout-id={layout.id}
      data-key-count={layout.keys.length}
      role="img"
      aria-label={accessibleLabel}
    >
      {scale > 0 && (
        <Stage width={size.width} height={height} listening>
          {/* Two layers: every key at rest, drawn once per layout and size, and only the held keys on top. A press
              then redraws one or two keys instead of the whole keyboard. */}
          <Layer>{restingKeys}</Layer>
          <Layer listening={false}>
            <Group x={offsetX} y={offsetY}>
              {layout.keys.filter((item) => pressed.has(item.id)).map((item) => (
                <Group key={item.id} x={item.x * scale} y={item.y * scale}><KeyFace item={item} scale={scale} pressed /></Group>
              ))}
            </Group>
          </Layer>
        </Stage>
      )}
    </div>
  )
}
