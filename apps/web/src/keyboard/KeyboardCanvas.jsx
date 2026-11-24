import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Arc, Circle, Group, Layer, Line, Rect, RegularPolygon, Shape, Stage, Text } from 'react-konva'
import { hitTest, layoutUnits, WHEEL_HUB, wheelGeometry } from './hit-test.js'
import { cornerIconLayout } from './layouts.js'
import { createPointerState, pointerDown, pointerMove, pointerTarget, pointerUp, pressedKeyIds, releaseAll } from './pointer-state.js'

// Key body colours, top → bottom of the face. Depth comes from a solid edge under each key, not shadowBlur: a blurred
// shadow per key over a DPR-3 canvas cost seconds per frame on a 4x-throttled CPU and froze the game beside it.
const FACE = {
  default: ['#3a4554', '#262f3b'],
  soft: ['#334050', '#202935'],
  numpad: ['#3a4554', '#262f3b'],
  dpad: ['#3d5d73', '#2a4253'],
  abxy: ['#c98a66', '#a46647'],
}
const EDGE = '#090d13'
const RIM = 'rgba(255,255,255,0.13)'
const PRESSED = ['#8ff0d4', '#4cc7a4']
const PRESSED_RIM = '#e4fff6'
const LEGEND = '#f3f6fa'
const LEGEND_DIM = '#9fb0c4'
const LEGEND_PRESSED = '#0d2a22'
const TONE = { danger: '#ff7b7b', warning: '#ffc46b' }
const FONT = 'system-ui, -apple-system, "PingFang SC", "Noto Sans SC", sans-serif'

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
    main: { x: 0.06, y: face * 0.2, width: item.width - 0.2, size, align: 'center' },
    secondary: { x: 0.06, y: face * 0.62, width: item.width - 0.2, size: small, align: 'center' },
  }
}

const gradient = (height, [top, bottom]) => ({
  fillLinearGradientStartPoint: { x: 0, y: 0 },
  fillLinearGradientEndPoint: { x: 0, y: height },
  fillLinearGradientColorStops: [0, top, 1, bottom],
})

/** One key, drawn in device pixels rather than by scaling a group of 1-unit keys: legends would otherwise be laid
 *  out at a ~0.3px font size, where CJK glyph measurement collapses and labels overlap. */
function KeyFace({ item, scale, pressed }) {
  const legend = legendLayout(item)
  const u = (value) => value * scale
  const width = u(item.width - 0.08)
  const height = u(item.height - 0.08)
  // `radius` rounds a key into a pill or a circle (the Flash gamepad's action keys).
  const radius = item.radius == null ? Math.min(0.16, item.height * 0.2) : Math.min(item.radius, (Math.min(item.width, item.height) - 0.08) / 2)
  const face = { width, height, cornerRadius: u(radius), perfectDrawEnabled: false, listening: false }
  const ink = pressed ? LEGEND_PRESSED : TONE[item.tone] || LEGEND
  const indicator = item.indicator ? u(0.05) : 0
  return <>
    {/* The held face sits exactly on the resting one (no sink offset), so nothing of the resting key shows. */}
    {!pressed && <Rect {...face} y={u(0.06)} fill={EDGE} />}
    <Rect {...face} {...gradient(height, pressed ? PRESSED : FACE[item.block] || FACE.default)} stroke={pressed ? PRESSED_RIM : RIM} strokeWidth={u(0.025)} />
    {!pressed && <Rect x={face.cornerRadius} y={u(0.02)} width={Math.max(0, width - face.cornerRadius * 2)} height={u(0.018)} fill="rgba(255,255,255,0.10)" cornerRadius={u(0.01)} listening={false} />}
    {indicator > 0 && (
      <Rect x={width / 2 - u(0.2)} y={u(legend.main.y) - u(0.1)} width={u(0.4)} height={indicator} cornerRadius={indicator / 2}
        fill={pressed ? LEGEND_PRESSED : '#7fd6ff'} listening={false} />
    )}
    <Text
      x={u(legend.main.x)}
      y={u(legend.main.y) + indicator}
      width={u(legend.main.width)}
      text={item.label}
      fontFamily={FONT}
      fontSize={u(legend.main.size)}
      fontStyle="600"
      align={legend.main.align}
      wrap="none"
      fill={ink}
      listening={false}
    />
    {legend.secondary && (
      <Text
        x={u(legend.secondary.x)}
        y={u(legend.secondary.y)}
        width={u(legend.secondary.width)}
        text={item.secondaryLegend}
        fontFamily={FONT}
        fontSize={u(legend.secondary.size)}
        align={legend.secondary.align}
        wrap="none"
        fill={pressed ? LEGEND_PRESSED : LEGEND_DIM}
        listening={false}
      />
    )}
  </>
}

/** The cut-away corner: an arc concentric with the wheel joins the two inner edges of the key's box. */
function cornerPath(item) {
  const { x, y, width, height, corner, arc } = item
  const left = corner === 'top-left' || corner === 'bottom-left'
  const top = corner === 'top-left' || corner === 'top-right'
  const outer = { x: left ? x : x + width, y: top ? y : y + height }
  const inner = { x: left ? x + width : x, y: top ? y + height : y }
  const spanX = Math.sqrt(Math.max(0, arc.radius ** 2 - (inner.x - arc.cx) ** 2))
  const spanY = Math.sqrt(Math.max(0, arc.radius ** 2 - (inner.y - arc.cy) ** 2))
  const a = { x: inner.x, y: arc.cy + (top ? -spanX : spanX) }
  const b = { x: arc.cx + (left ? -spanY : spanY), y: inner.y }
  const start = Math.atan2(a.y - arc.cy, a.x - arc.cx)
  const end = Math.atan2(b.y - arc.cy, b.x - arc.cx)
  const anticlockwise = ((end - start + 2 * Math.PI) % (2 * Math.PI)) > Math.PI
  return { outer, inner, a, b, arc, start, end, anticlockwise }
}

const ICON_COLOUR = { check: '#7fd6ff', back: '#cfe3f2', end: TONE.danger, clear: TONE.warning }

/** The four T9 function keys are icons, not legends: check (left soft key), back (right soft key), end (hang up)
 *  and clear. All are strokes in layout units around the icon box centre, so they scale with the canvas. */
function CornerIcon({ kind, layout, scale, colour }) {
  const s = layout.size * scale
  const x = layout.cx * scale
  const y = layout.cy * scale
  const stroke = { stroke: colour, strokeWidth: s * 0.11, lineCap: 'round', lineJoin: 'round', listening: false }
  const line = (points) => (
    <Line {...stroke} points={points.flatMap(([px, py]) => [x + px * s, y + py * s])} />
  )
  if (kind === 'check') return line([[-0.34, 0.02], [-0.08, 0.26], [0.36, -0.26]])
  if (kind === 'back') return <>
    {line([[-0.34, 0], [0.32, 0]])}
    {line([[-0.06, -0.24], [-0.34, 0], [-0.06, 0.24]])}
  </>
  if (kind === 'end') return <>
    <Circle x={x} y={y} radius={s * 0.3} stroke={colour} strokeWidth={s * 0.1} listening={false} />
    {line([[-0.2, 0.2], [0.2, -0.2]])}
  </>
  return <>
    {line([[0.36, -0.26], [-0.12, -0.26], [-0.36, 0], [-0.12, 0.26], [0.36, 0.26]])}
    {line([[-0.02, -0.13], [0.2, 0.13]])}
    {line([[0.2, -0.13], [-0.02, 0.13]])}
  </>
}

/** A T9 function key: a corner block whose inner corner is replaced by that arc. A solid edge under the face gives
 *  it the same depth as a rectangular key, and the rim stroke outlines the curve that follows the wheel. */
function CornerKeyFace({ item, scale, pressed }) {
  const u = (value) => value * scale
  const path = cornerPath(item)
  const iconLayout = cornerIconLayout(item)
  const colour = pressed ? LEGEND_PRESSED : ICON_COLOUR[item.icon] || LEGEND
  const scene = (sink) => (context, shape) => {
    const px = (point) => u(point.x - item.x)
    const py = (point) => u(point.y - item.y) + sink
    context.beginPath()
    context.moveTo(px(path.outer), py(path.outer))
    context.lineTo(px(path.inner), py(path.outer))
    context.lineTo(px(path.a), py(path.a))
    context.arc(u(path.arc.cx - item.x), u(path.arc.cy - item.y) + sink, u(path.arc.radius),
      path.start, path.end, path.anticlockwise)
    context.lineTo(px(path.outer), py(path.inner))
    context.closePath()
    context.fillStrokeShape(shape)
  }
  return <>
    {!pressed && <Shape sceneFunc={scene(u(0.06))} fill={EDGE} perfectDrawEnabled={false} listening={false} />}
    <Shape
      sceneFunc={scene(0)}
      {...gradient(u(item.height), pressed ? PRESSED : FACE[item.block] || FACE.default)}
      stroke={pressed ? PRESSED_RIM : RIM}
      strokeWidth={u(0.025)}
      perfectDrawEnabled={false}
      listening={false}
    />
    {item.indicator && (
      <Rect x={u(iconLayout.indicator.x)} y={u(iconLayout.indicator.y)} width={u(iconLayout.indicator.width)}
        height={u(iconLayout.indicator.height)} cornerRadius={u(0.025)}
        fill={pressed ? LEGEND_PRESSED : '#7fd6ff'} listening={false} />
    )}
    <CornerIcon kind={item.icon} layout={iconLayout} scale={scale} colour={colour} />
  </>
}

// Direction centres in screen degrees (clockwise from the right), and where hit-test.js puts the sector edges.
const WHEEL_DIRECTIONS = { right: 0, down: 90, left: 180, up: 270 }
const SECTOR_EDGES = [30, 60, 120, 150, 210, 240, 300, 330]

/** The 8-way wheel at rest: a ring with sector grooves, a raised arrow for each main direction, a dot for each
 *  diagonal, and the OK hub. Coordinates are relative to the wheel's centre. */
function WheelFace({ item, scale }) {
  const radius = (Math.min(item.width, item.height) / 2 - 0.04) * scale
  const hub = radius * WHEEL_HUB
  const toXY = (degrees, distance) => [Math.cos((degrees * Math.PI) / 180) * distance, Math.sin((degrees * Math.PI) / 180) * distance]
  return <>
    <Circle y={scale * 0.06} radius={radius} fill={EDGE} listening={false} />
    <Circle radius={radius} {...gradient(radius, ['#344253', '#1d252f'])} fillLinearGradientStartPoint={{ x: 0, y: -radius }}
      fillLinearGradientEndPoint={{ x: 0, y: radius }} stroke={RIM} strokeWidth={scale * 0.025} listening={false} />
    {SECTOR_EDGES.map((degrees) => (
      <Line key={degrees} points={[...toXY(degrees, hub * 1.18), ...toXY(degrees, radius * 0.9)]} stroke="rgba(255,255,255,0.07)"
        strokeWidth={scale * 0.02} lineCap="round" listening={false} />
    ))}
    {Object.entries(WHEEL_DIRECTIONS).map(([part, degrees]) => {
      const [x, y] = toXY(degrees, radius * 0.67)
      return <RegularPolygon key={part} x={x} y={y} sides={3} radius={radius * 0.12} rotation={degrees + 90} fill="#cfe3f2" listening={false} />
    })}
    {[45, 135, 225, 315].map((degrees) => {
      const [x, y] = toXY(degrees, radius * 0.67)
      return <Circle key={degrees} x={x} y={y} radius={radius * 0.035} fill="#8396ab" listening={false} />
    })}
    <Circle y={scale * 0.04} radius={hub} fill={EDGE} listening={false} />
    <HubFace item={item} scale={scale} hub={hub} pressed={false} />
  </>
}

function HubFace({ item, scale, hub, pressed }) {
  const size = Math.min(hub * 0.62, scale * 0.3)
  return <>
    <Circle radius={hub * 0.94} {...gradient(hub, pressed ? PRESSED : ['#4a5a6d', '#2e3947'])} fillLinearGradientStartPoint={{ x: 0, y: -hub }}
      fillLinearGradientEndPoint={{ x: 0, y: hub }} stroke={pressed ? PRESSED_RIM : 'rgba(255,255,255,0.18)'} strokeWidth={scale * 0.025} listening={false} />
    <Text x={-hub} y={-size / 2} width={hub * 2} text={item.label} align="center" fontFamily={FONT} fontStyle="700" fontSize={size}
      fill={pressed ? LEGEND_PRESSED : LEGEND} listening={false} />
  </>
}

/** The held parts of a wheel: a lit sector per held direction (a diagonal lights both), or the lit hub. */
function WheelPressed({ item, scale, parts }) {
  const radius = (Math.min(item.width, item.height) / 2 - 0.04) * scale
  const hub = radius * WHEEL_HUB
  return <>
    {parts.filter((part) => part in WHEEL_DIRECTIONS).map((part) => {
      const degrees = WHEEL_DIRECTIONS[part]
      const x = Math.cos((degrees * Math.PI) / 180) * radius * 0.67
      const y = Math.sin((degrees * Math.PI) / 180) * radius * 0.67
      return <Group key={part}>
        <Arc innerRadius={hub * 1.08} outerRadius={radius * 0.97} angle={60} rotation={degrees - 30} fill="rgba(110,231,198,0.88)"
          stroke={PRESSED_RIM} strokeWidth={scale * 0.02} listening={false} />
        <RegularPolygon x={x} y={y} sides={3} radius={radius * 0.12} rotation={degrees + 90} fill={LEGEND_PRESSED} listening={false} />
      </Group>
    })}
    {parts.includes('center') && <HubFace item={item} scale={scale} hub={hub} pressed />}
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

/**
 * A keyboard drawn on a canvas. Keys press when a pointer lands on them, and a pointer that slides across the
 * keyboard releases the key it leaves and presses the key it enters (onKeyUp / onKeyDown per key). On the 8-way
 * wheel each direction is its own key, so a diagonal holds two at once.
 */
export function KeyboardCanvas({ layout, onKeyDown, onKeyUp, accessibleLabel = 'Keyboard layout' }) {
  const hostRef = useRef(null)
  const pointerState = useRef(createPointerState())
  const callbacks = useRef({ onKeyDown, onKeyUp })
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [pressed, setPressed] = useState(new Set())
  const bounds = useMemo(() => boundsFor(layout.keys), [layout])
  const unitsById = useMemo(() => layoutUnits(layout), [layout])
  const designWidth = bounds.right - bounds.left
  const designHeight = bounds.bottom - bounds.top
  const height = size.height || 360
  const scale = size.width > 0 && designWidth > 0 && designHeight > 0
    ? Math.min(size.width / designWidth, height / designHeight)
    : 0
  const offsetX = (size.width - designWidth * scale) / 2 - bounds.left * scale
  const offsetY = (height - designHeight * scale) / 2 - bounds.top * scale
  // The latest geometry for the pointer handlers, which are bound once per layout.
  const geometry = useRef({ scale, offsetX, offsetY })
  geometry.current = { scale, offsetX, offsetY }

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

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const syncPressed = () => setPressed(pressedKeyIds(pointerState.current))
    const keyUp = (unitIds, pointerId) => {
      for (const id of unitIds) {
        const unit = unitsById.get(id)
        if (unit) callbacks.current.onKeyUp?.(unit, pointerId)
      }
    }
    const keyDown = (unitIds, pointerId, event) => {
      for (const id of unitIds) {
        const unit = unitsById.get(id)
        if (unit) callbacks.current.onKeyDown?.(unit, pointerId, event)
      }
    }
    // The point in layout units; null until the canvas has a size.
    const layoutPoint = (event) => {
      const { scale: s, offsetX: ox, offsetY: oy } = geometry.current
      if (!(s > 0)) return null
      const rect = host.getBoundingClientRect()
      return [(event.clientX - rect.left - ox) / s, (event.clientY - rect.top - oy) / s]
    }
    const handleDown = (event) => {
      if (Object.hasOwn(pointerState.current.pointers, event.pointerId)) return
      const point = layoutPoint(event)
      if (!point) return
      event.preventDefault()
      // Capture, so the keyboard keeps seeing this pointer after it leaves the canvas (and releases its key).
      try { host.setPointerCapture(event.pointerId) } catch {}
      const result = pointerDown(pointerState.current, event.pointerId, hitTest(layout, point[0], point[1]))
      pointerState.current = result.state
      keyDown(result.pressed, event.pointerId, event)
      if (result.pressed.length) syncPressed()
    }
    const handleMove = (event) => {
      if (!Object.hasOwn(pointerState.current.pointers, event.pointerId)) return
      const point = layoutPoint(event)
      if (!point) return
      const previous = pointerTarget(pointerState.current, event.pointerId)
      const result = pointerMove(pointerState.current, event.pointerId, hitTest(layout, point[0], point[1], previous))
      pointerState.current = result.state
      if (!result.pressed.length && !result.released.length) return
      keyUp(result.released, event.pointerId)
      keyDown(result.pressed, event.pointerId, event)
      syncPressed()
    }
    const handleUp = (event) => {
      const result = pointerUp(pointerState.current, event.pointerId)
      pointerState.current = result.state
      try { if (host.hasPointerCapture(event.pointerId)) host.releasePointerCapture(event.pointerId) } catch {}
      if (!result.released.length) return
      keyUp(result.released, event.pointerId)
      syncPressed()
    }
    const handleBlur = () => {
      const { state, released } = releaseAll(pointerState.current)
      pointerState.current = state
      for (const { pointerId, unitId } of released) keyUp([unitId], Number(pointerId))
      if (released.length) syncPressed()
    }
    const onVisibility = () => { if (document.hidden) handleBlur() }
    host.addEventListener('pointerdown', handleDown)
    host.addEventListener('pointermove', handleMove)
    host.addEventListener('pointerup', handleUp)
    host.addEventListener('pointercancel', handleUp)
    host.addEventListener('lostpointercapture', handleUp)
    window.addEventListener('blur', handleBlur)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      host.removeEventListener('pointerdown', handleDown)
      host.removeEventListener('pointermove', handleMove)
      host.removeEventListener('pointerup', handleUp)
      host.removeEventListener('pointercancel', handleUp)
      host.removeEventListener('lostpointercapture', handleUp)
      window.removeEventListener('blur', handleBlur)
      document.removeEventListener('visibilitychange', onVisibility)
      handleBlur()
    }
  }, [layout, unitsById])

  const restingKeys = useMemo(() => (
    <Group x={offsetX} y={offsetY} listening={false}>
      {layout.keys.map((item) => item.shape === 'wheel' ? (
        <Group key={item.id} x={(item.x + item.width / 2) * scale} y={(item.y + item.height / 2) * scale}>
          <WheelFace item={item} scale={scale} />
        </Group>
      ) : (
        <Group key={item.id} x={item.x * scale} y={item.y * scale}>
          {item.shape === 'corner'
            ? <CornerKeyFace item={item} scale={scale} pressed={false} />
            : <KeyFace item={item} scale={scale} pressed={false} />}
        </Group>
      ))}
    </Group>
  ), [layout, offsetX, offsetY, scale])

  // Held units grouped by key: a wheel can hold two directions (or its hub) at once.
  const heldKeys = new Map()
  for (const id of pressed) {
    const unit = unitsById.get(id)
    if (!unit) continue
    heldKeys.set(unit.keyId, [...(heldKeys.get(unit.keyId) || []), unit.part])
  }

  return (
    <div
      ref={hostRef}
      className="keyboardCanvas"
      data-layout-id={layout.id}
      data-key-count={layout.keys.length}
      data-pressed={[...pressed].join(' ')}
      role="img"
      aria-label={accessibleLabel}
    >
      {scale > 0 && (
        <Stage width={size.width} height={height} listening={false}>
          {/* Two layers: every key at rest, drawn once per layout and size, and only the held keys on top. A press
              then redraws one or two keys instead of the whole keyboard. */}
          <Layer listening={false}>{restingKeys}</Layer>
          <Layer listening={false}>
            <Group x={offsetX} y={offsetY}>
              {layout.keys.filter((item) => heldKeys.has(item.id)).map((item) => item.shape === 'wheel' ? (
                <Group key={item.id} x={(item.x + item.width / 2) * scale} y={(item.y + item.height / 2) * scale}>
                  <WheelPressed item={item} scale={scale} parts={heldKeys.get(item.id)} />
                </Group>
              ) : (
                <Group key={item.id} x={item.x * scale} y={item.y * scale}>
                  {item.shape === 'corner'
                    ? <CornerKeyFace item={item} scale={scale} pressed />
                    : <KeyFace item={item} scale={scale} pressed />}
                </Group>
              ))}
            </Group>
          </Layer>
        </Stage>
      )}
    </div>
  )
}
