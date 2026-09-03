import { describe, expect, it } from 'bun:test'

import type { GridResizeEdge } from 'gridla'
import { rectStyle, resizeHandleStyle, styleToText } from 'gridla/interaction'

const SIZE = 'var(--gridla-handle-size, 10px)'
const INSET = `var(--gridla-handle-inset, ${SIZE})`

describe('resizeHandleStyle', () => {
  it('places edge handles along their side, inset from the corners', () => {
    expect(resizeHandleStyle('n')).toEqual({
      position: 'absolute',
      touchAction: 'none',
      cursor: 'var(--gridla-handle-cursor-n, var(--gridla-handle-cursor, ns-resize))',
      left: INSET,
      right: INSET,
      height: SIZE,
      top: '0px',
    })
    expect(resizeHandleStyle('s')).toMatchObject({ bottom: '0px', height: SIZE })
    expect(resizeHandleStyle('e')).toMatchObject({
      right: '0px',
      top: INSET,
      bottom: INSET,
      width: SIZE,
      cursor: 'var(--gridla-handle-cursor-e, var(--gridla-handle-cursor, ew-resize))',
    })
    expect(resizeHandleStyle('w')).toMatchObject({ left: '0px', width: SIZE })
  })

  it('places corner handles as squares in the corners', () => {
    expect(resizeHandleStyle('se')).toEqual({
      position: 'absolute',
      touchAction: 'none',
      cursor: 'var(--gridla-handle-cursor-se, var(--gridla-handle-cursor, nwse-resize))',
      width: SIZE,
      height: SIZE,
      bottom: '0px',
      right: '0px',
    })
    expect(resizeHandleStyle('nw')).toMatchObject({ top: '0px', left: '0px' })
    expect(resizeHandleStyle('ne')).toMatchObject({
      top: '0px',
      right: '0px',
      cursor: 'var(--gridla-handle-cursor-ne, var(--gridla-handle-cursor, nesw-resize))',
    })
    expect(resizeHandleStyle('sw')).toMatchObject({ bottom: '0px', left: '0px' })
  })

  it('uses the options as the custom property fallbacks', () => {
    const style = resizeHandleStyle('n', { size: 16, inset: '1rem' })
    expect(style.height).toBe('var(--gridla-handle-size, 16px)')
    expect(style.left).toBe('var(--gridla-handle-inset, 1rem)')
    expect(resizeHandleStyle('se', { size: '0.5rem' }).width).toBe(
      'var(--gridla-handle-size, 0.5rem)',
    )
  })

  it('never lets a handle leave the item', () => {
    const edges: GridResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
    for (const edge of edges) {
      const style = resizeHandleStyle(edge)
      expect(style.position).toBe('absolute')
      expect(style.touchAction).toBe('none')
      // Every handle is pinned to at least one edge at offset 0.
      const pinned = [style.top, style.bottom, style.left, style.right].filter((v) => v === '0px')
      expect(pinned.length).toBeGreaterThanOrEqual(edge.length)
    }
  })
})

describe('rectStyle', () => {
  it('positions with a transform by default', () => {
    expect(rectStyle({ x: 12, y: 34, w: 100, h: 50 }, 'transform')).toEqual({
      position: 'absolute',
      left: '0px',
      top: '0px',
      width: '100px',
      height: '50px',
      transform: 'translate(12px, 34px)',
    })
  })

  it('positions with left and top when asked', () => {
    expect(rectStyle({ x: 12, y: 34, w: 100, h: 50 }, 'absolute')).toEqual({
      position: 'absolute',
      left: '12px',
      top: '34px',
      width: '100px',
      height: '50px',
    })
  })
})

describe('styleToText', () => {
  it('serializes camelCase keys and skips undefined values', () => {
    expect(styleToText({ touchAction: 'none', top: '0px', left: undefined })).toBe(
      'touch-action:none;top:0px;',
    )
    expect(styleToText(resizeHandleStyle('se'))).toContain('cursor:var(--gridla-handle-cursor-se')
  })
})
