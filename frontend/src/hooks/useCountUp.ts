import { useEffect, useRef, useState } from 'react'

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

interface UseCountUpOptions {
  target: number
  duration?: number
  decimals?: number
  delay?: number
  enabled?: boolean
}

export function useCountUp({
  target,
  duration = 900,
  decimals = 0,
  delay = 0,
  enabled = true,
}: UseCountUpOptions): string {
  const [value, setValue] = useState(enabled ? 0 : target)
  const lastValueRef = useRef(enabled ? 0 : target)
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!enabled) {
      setValue(target)
      lastValueRef.current = target
      return undefined
    }

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      setValue(target)
      lastValueRef.current = target
      return undefined
    }

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced) {
      setValue(target)
      lastValueRef.current = target
      return undefined
    }

    const startVal = lastValueRef.current
    if (Math.abs(startVal - target) < Math.pow(10, -decimals)) {
      setValue(target)
      lastValueRef.current = target
      return undefined
    }

    const start = () => {
      const startTime = performance.now()
      const tick = (now: number) => {
        const t = Math.min(1, (now - startTime) / duration)
        const eased = easeOutCubic(t)
        const next = startVal + (target - startVal) * eased
        lastValueRef.current = next
        setValue(next)
        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick)
        }
      }
      rafRef.current = requestAnimationFrame(tick)
    }

    timeoutRef.current = setTimeout(start, delay)

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, decimals, delay, enabled])

  return value.toFixed(decimals)
}
