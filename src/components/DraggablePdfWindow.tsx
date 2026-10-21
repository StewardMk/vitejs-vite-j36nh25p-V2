import { useEffect, useRef, useState } from 'react'

interface DraggablePdfWindowProps {
  title: string
  src: string
  onClose: () => void
  pinned: boolean
  onTogglePin: () => void
  onResize?: (width: number, height: number) => void
}

type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const MIN_WIDTH = 360
const MIN_HEIGHT = 320

/** Opens wide enough to read a page comfortably: about 55% of the screen, never narrower than 560px. */
function defaultSize() {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const width = Math.min(Math.max(560, Math.round(vw * 0.55)), vw - 24, 1100)
  const height = Math.max(MIN_HEIGHT, vh - 110)
  return { width, height }
}

/**
 * Free-moving popup by default (drag by the title bar). It can be resized
 * from every edge and corner, and can be pinned to dock full-height on the
 * left edge so the PDF and the exam sit side by side -- when pinned, the
 * right edge still resizes the width and ManifestExamRunner shifts the exam
 * chrome over to make room (see `leftInset`).
 */
function DraggablePdfWindow({ title, src, onClose, pinned, onTogglePin, onResize }: DraggablePdfWindowProps) {
  const [size, setSize] = useState(defaultSize)
  const [pos, setPos] = useState(() => ({ x: Math.max(0, window.innerWidth - defaultSize().width - 24), y: 70 }))
  const [busy, setBusy] = useState(false) // while dragging/resizing, stop the PDF frame from swallowing pointer events
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeState = useRef<{ dir: Dir; startX: number; startY: number; x: number; y: number; w: number; h: number } | null>(null)

  // Tell the exam layout the real width straight away (matters when the window is pinned).
  useEffect(() => {
    onResize?.(size.width, size.height)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDragPointerDown(e: React.PointerEvent) {
    if (pinned || (e.target as HTMLElement).closest('button')) return
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    setBusy(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleDragPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setPos({
      x: Math.min(Math.max(0, dragState.current.origX + dx), Math.max(0, window.innerWidth - 120)),
      y: Math.min(Math.max(0, dragState.current.origY + dy), Math.max(0, window.innerHeight - 40)),
    })
  }

  function handleDragPointerUp() {
    dragState.current = null
    setBusy(false)
  }

  function startResize(dir: Dir) {
    return (e: React.PointerEvent) => {
      e.stopPropagation()
      e.preventDefault()
      resizeState.current = {
        dir, startX: e.clientX, startY: e.clientY,
        x: pinned ? 0 : pos.x, y: pinned ? 0 : pos.y, w: size.width, h: size.height,
      }
      setBusy(true)
      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    }
  }

  function handleResizePointerMove(e: React.PointerEvent) {
    const r = resizeState.current
    if (!r) return
    const dx = e.clientX - r.startX
    const dy = e.clientY - r.startY
    let { x, y, w, h } = r
    if (r.dir.includes('e')) w = r.w + dx
    if (r.dir.includes('s')) h = r.h + dy
    if (r.dir.includes('w')) { w = r.w - dx; x = r.x + dx }
    if (r.dir.includes('n')) { h = r.h - dy; y = r.y + dy }
    const maxW = window.innerWidth - 8
    const maxH = window.innerHeight - 8
    if (w < MIN_WIDTH) { if (r.dir.includes('w')) x -= MIN_WIDTH - w; w = MIN_WIDTH }
    if (h < MIN_HEIGHT) { if (r.dir.includes('n')) y -= MIN_HEIGHT - h; h = MIN_HEIGHT }
    w = Math.min(w, maxW)
    h = Math.min(h, maxH)
    setSize({ width: w, height: h })
    if (!pinned) setPos({ x: Math.max(0, x), y: Math.max(0, y) })
    onResize?.(w, h)
  }

  function handleResizePointerUp() {
    resizeState.current = null
    setBusy(false)
  }

  const style: React.CSSProperties = pinned
    ? { left: 0, top: 0, width: size.width }
    : { left: pos.x, top: pos.y, width: size.width, height: size.height }

  // Pinned windows only grow sideways, from the right-hand edge.
  const dirs: Dir[] = pinned ? ['e'] : ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

  return (
    <div className={`pdf-popup ${pinned ? 'pinned' : ''} ${busy ? 'is-busy' : ''}`} style={style}>
      <div
        className="pdf-popup-titlebar"
        onPointerDown={handleDragPointerDown}
        onPointerMove={handleDragPointerMove}
        onPointerUp={handleDragPointerUp}
      >
        <span>{title}</span>
        <div className="pdf-popup-titlebar-actions">
          <button
            className={`pdf-popup-pin ${pinned ? 'active' : ''}`}
            onClick={onTogglePin}
            aria-label={pinned ? 'Unpin document' : 'Pin document to view side by side'}
            title={pinned ? 'Unpin' : 'Pin side by side'}
          >
            📌
          </button>
          <button className="pdf-popup-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
      </div>
      <iframe className="pdf-popup-frame" title={title} src={src} />
      {dirs.map((d) => (
        <div
          key={d}
          className={`pdf-popup-edge pdf-popup-edge-${d}`}
          onPointerDown={startResize(d)}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

export default DraggablePdfWindow
