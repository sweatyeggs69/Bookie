import { useEffect, useRef, useState, useCallback, RefObject } from 'react'

const THRESHOLD = 80   // px to pull before triggering refresh
const MAX_PULL  = 120  // px cap on visual pull distance
const MOBILE_BREAKPOINT = 1024

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown> | void
}

interface PullToRefreshState {
  pullDistance: number
  isRefreshing: boolean
  containerRef: RefObject<HTMLDivElement>
}

export function usePullToRefresh({ onRefresh }: UsePullToRefreshOptions): PullToRefreshState {
  const containerRef = useRef<HTMLDivElement>(null) as RefObject<HTMLDivElement>
  const startYRef       = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const isRefreshingRef = useRef(false)
  const onRefreshRef    = useRef(onRefresh)

  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Keep onRefresh ref up to date without re-registering listeners
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])

  const isMobile = useCallback(() => window.innerWidth < MOBILE_BREAKPOINT, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (!isMobile() || isRefreshingRef.current) return
      if (window.scrollY !== 0) return
      startYRef.current = e.touches[0].clientY
    }

    const onTouchMove = (e: TouchEvent) => {
      if (startYRef.current === null || isRefreshingRef.current) return
      if (window.scrollY !== 0) {
        startYRef.current = null
        pullDistanceRef.current = 0
        setPullDistance(0)
        return
      }

      const delta = e.touches[0].clientY - startYRef.current
      if (delta <= 0) {
        pullDistanceRef.current = 0
        setPullDistance(0)
        return
      }

      // Prevent native browser overscroll while we handle the gesture
      e.preventDefault()

      // Apply resistance so it feels natural
      const clamped = Math.min(delta * 0.45, MAX_PULL)
      pullDistanceRef.current = clamped
      setPullDistance(clamped)
    }

    const onTouchEnd = async () => {
      if (startYRef.current === null) return
      startYRef.current = null

      const distance = pullDistanceRef.current
      pullDistanceRef.current = 0
      setPullDistance(0)

      if (distance >= THRESHOLD) {
        isRefreshingRef.current = true
        setIsRefreshing(true)
        try {
          await onRefreshRef.current()
        } finally {
          isRefreshingRef.current = false
          setIsRefreshing(false)
        }
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove',  onTouchMove,  { passive: false })
    el.addEventListener('touchend',   onTouchEnd,   { passive: true })

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove',  onTouchMove)
      el.removeEventListener('touchend',   onTouchEnd)
    }
  }, [isMobile])

  return { pullDistance, isRefreshing, containerRef }
}
