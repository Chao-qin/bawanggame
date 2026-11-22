import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Group, Layer, Rect, Stage, Text } from 'react-konva'
import { createPointerState, pointerCancel, pointerDown, pointerUp, pressedKeyIds, releaseAll } from './pointer-state.js'

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
    callbacks.current.onKeyDown?.(keyData, pointerId)
    syncPressed()
  }, [syncPressed])

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
          <Layer>
            <Group x={offsetX} y={offsetY} scaleX={scale} scaleY={scale}>
              {layout.keys.map((item) => {
                const isPressed = pressed.has(item.id)
                return (
                  <Group key={item.id} x={item.x} y={item.y} onPointerDown={(event) => press(item, event)}>
                    <Rect
                      width={item.width - 0.08}
                      height={item.height - 0.08}
                      cornerRadius={0.12}
                      fill={isPressed ? '#74d8bd' : item.block === 'abxy' ? '#d28b63' : item.block === 'dpad' ? '#75a9c8' : '#273444'}
                      stroke={isPressed ? '#dbfff4' : '#65748a'}
                      strokeWidth={0.035}
                      shadowColor="#000000"
                      shadowBlur={isPressed ? 0 : 0.12}
                      shadowOffsetY={isPressed ? 0 : 0.08}
                    />
                    <Text
                      x={0.06}
                      y={item.secondaryLegend ? 0.12 : 0.31}
                      width={item.width - 0.2}
                      height={0.36}
                      text={item.label}
                      fontFamily="system-ui, sans-serif"
                      fontSize={Math.min(0.28, item.width * 0.32)}
                      fontStyle="600"
                      align="center"
                      fill={isPressed ? '#102720' : '#f2f6fb'}
                      listening={false}
                    />
                    {item.secondaryLegend && (
                      <Text
                        x={0.12}
                        y={0.66}
                        text={item.secondaryLegend}
                        fontFamily="system-ui, sans-serif"
                        fontSize={0.18}
                        fill={isPressed ? '#102720' : '#aebacf'}
                        listening={false}
                      />
                    )}
                  </Group>
                )
              })}
            </Group>
          </Layer>
        </Stage>
      )}
    </div>
  )
}
