'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export default function KanbanScrollbar({ boardRef }: { boardRef: React.RefObject<HTMLDivElement | null> }) {
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const [thumbWidth, setThumbWidth] = useState(0)
  const [thumbLeft, setThumbLeft] = useState(0)
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartScroll = useRef(0)

  const update = useCallback(() => {
    const board = boardRef.current
    const track = trackRef.current
    if (!board || !track) return
    const ratio = board.clientWidth / board.scrollWidth
    if (ratio >= 1) {
      track.style.display = 'none'
      return
    }
    track.style.display = 'block'
    const tw = Math.max(40, ratio * track.clientWidth)
    const maxThumbLeft = track.clientWidth - tw
    const scrollRatio = board.scrollLeft / (board.scrollWidth - board.clientWidth)
    setThumbWidth(tw)
    setThumbLeft(scrollRatio * maxThumbLeft)
  }, [boardRef])

  useEffect(() => {
    const board = boardRef.current
    if (!board) return
    update()
    board.addEventListener('scroll', update)
    const ro = new ResizeObserver(update)
    ro.observe(board)
    return () => {
      board.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [boardRef, update])

  const onThumbMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartScroll.current = boardRef.current?.scrollLeft || 0
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return
    const board = boardRef.current
    const track = trackRef.current
    if (!board || !track) return
    const dx = e.clientX - dragStartX.current
    const ratio = (board.scrollWidth - board.clientWidth) / (track.clientWidth - thumbWidth)
    board.scrollLeft = dragStartScroll.current + dx * ratio
  }, [boardRef, thumbWidth])

  const onMouseUp = useCallback(() => {
    dragging.current = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  }, [onMouseMove])

  const onTrackClick = (e: React.MouseEvent) => {
    const board = boardRef.current
    const track = trackRef.current
    if (!board || !track) return
    const rect = track.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const ratio = clickX / track.clientWidth
    board.scrollLeft = ratio * (board.scrollWidth - board.clientWidth) - board.clientWidth / 2
  }

  return (
    <div ref={trackRef} className="kanban-scrollbar-track" onClick={onTrackClick}>
      <div
        ref={thumbRef}
        className="kanban-scrollbar-thumb"
        style={{ width: thumbWidth, marginLeft: thumbLeft }}
        onMouseDown={onThumbMouseDown}
      />
    </div>
  )
}
