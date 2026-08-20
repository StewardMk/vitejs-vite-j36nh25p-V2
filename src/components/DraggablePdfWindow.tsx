import { useRef, useState } from 'react'

interface DraggablePdfWindowProps {
  title: string
  src: string
  onClose: () => void
  pinned: boolean
  onTogglePin: () => void
  onResize?: (width: number, height: number) => void
}

const MIN_WIDTH = 360
const MIN_HEIGHT = 320

/**
 * Free-moving popup by default (drag by the title bar, resize from the
 * bottom-right corner). Can also be pinned to dock full-height on the
 * left edge so the PDF and the exam can be read side by side -- when
 * pinned, ManifestExamRunner shifts the exam chrome over to make room
 * (see the `oet-pdf-pinned-layout` wrapper class).
 */
function DraggablePdfWindow({ title, src, onClose, pinned, onTogglePin, onResize }: DraggablePdfWindowProps) {
  const [pos, setPos] = useState({ x: Math.max(0, window.innerWidth - 560), y: 90 })
  const [size, setSize] = useState({ width: 480, height: 620 })
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const resizeState = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null)

  function handleDragPointerDown(e: React.PointerEvent) {
    if (pinned) return
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleDragPointerMove(e: React.PointerEvent) {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    setPos({
      x: Math.max(0, dragState.current.origX + dx),
      y: Math.max(0, dragState.current.origY + dy),
    })
  }

  function handleDragPointerUp() {
    dragState.current = null
  }

  function handleResizePointerDown(e: React.PointerEvent) {
    e.stopPropagation()
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: size.width, origH: size.height }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  function handleResizePointerMove(e: React.PointerEvent) {
    if (!resizeState.current) return
    const dx = e.clientX - resizeState.current.startX
    const dy = e.clientY - resizeState.current.startY
    const next = {
      width: Math.max(MIN_WIDTH, resizeState.current.origW + dx),
      height: Math.max(MIN_HEIGHT, resizeState.current.origH + dy),
    }
    setSize(next)
    onResize?.(next.width, next.height)
  }

  function handleResizePointerUp() {
    resizeState.current = null
  }

  const style: React.CSSProperties = pinned
    ? { left: 0, top: 0, width: size.width }
    : { left: pos.x, top: pos.y, width: size.width, height: size.height }

  return (
    <div className={`pdf-popup ${pinned ? 'pinned' : ''}`} style={style}>
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
      {!pinned && (
        <div
          className="pdf-popup-resize-handle"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          aria-hidden="true"
        />
      )}
    </div>
  )
}

export default DraggablePdfWindow