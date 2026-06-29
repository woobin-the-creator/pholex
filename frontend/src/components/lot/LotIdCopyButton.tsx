import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { copyToClipboard } from '../../utils/clipboard'

// Lot ID 셀 옆 복사 버튼. 자체 copied state로 클릭 시 아이콘을 체크로 ~1.1초 바꿔
// 피드백을 준다(토스트 대신 in-place — 연속 복사에도 조용하게). 버튼마다 독립 상태다.
export function LotIdCopyButton({ lotId }: { lotId: string }) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    // 행 클릭 동작은 현재 없지만, 추후 행 핸들러가 생겨도 복사가 새지 않도록 방어적으로 막는다.
    event.stopPropagation()
    const ok = await copyToClipboard(lotId)
    if (!ok) return
    setCopied(true)
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setCopied(false), 1100)
  }

  return (
    <button
      type="button"
      className={`lot-id-copy${copied ? ' is-copied' : ''}`}
      onClick={handleCopy}
      aria-label={copied ? '복사됨' : `Lot ID ${lotId} 복사`}
      title={copied ? '복사됨' : '복사'}
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {copied ? 'check' : 'content_copy'}
      </span>
    </button>
  )
}
