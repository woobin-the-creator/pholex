import { useEffect, useState } from 'react'
import { ProtoLotHoldPanel, type PaginationVariant } from './variants/ProtoLotHoldPanel'
import { makeMockRows } from './mockRows'
import './proto.css'

const VARIANTS: { id: PaginationVariant; name: string; blurb: string }[] = [
  { id: 'A', name: 'A — Special-hold 동형', blurb: '이전/다음 + 현재/전체 + 행 크기. 키워드 Hold 패널과 완전 대칭.' },
  { id: 'B', name: 'B — 번호 페이저', blurb: '페이지 번호로 점프 · 윈도잉(… 줄임) · active 강조. 기존 에디토리얼 page-link 토큰 재사용.' },
  { id: 'C', name: 'C — 인-헤더 범위 스테퍼', blurb: '헤더에 1–15 / 73 ‹ › 컴팩트 스텝. 푸터 없음 → 테이블 최대 높이.' },
]

const ORDER: PaginationVariant[] = ['A', 'B', 'C']

export function LotHoldPaginationProto() {
  const rows = makeMockRows(73)
  const [variant, setVariant] = useState<PaginationVariant>('A')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    document.body.dataset.theme = theme
  }, [theme])

  // ← → 로 시안 전환
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const i = ORDER.indexOf(variant)
      const next = e.key === 'ArrowRight' ? (i + 1) % ORDER.length : (i - 1 + ORDER.length) % ORDER.length
      setVariant(ORDER[next])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [variant])

  const meta = VARIANTS.find((v) => v.id === variant)!

  return (
    <div className="proto-root">
      <header className="proto-bar">
        <div className="proto-bar__title">
          <span className="proto-bar__tag">PROTO</span>
          내 lot 홀드 — 페이지네이션 시안 <strong>{variant}</strong>
        </div>
        <p className="proto-bar__blurb">{meta.blurb}</p>
        <div className="proto-bar__controls">
          <div className="proto-switch" role="tablist" aria-label="시안 전환">
            {VARIANTS.map((v) => (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={v.id === variant}
                className={`proto-switch__btn${v.id === variant ? ' is-active' : ''}`}
                onClick={() => setVariant(v.id)}
                title={v.name}
              >
                {v.id}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="proto-theme"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? '☾ 다크' : '☀ 라이트'}
          </button>
        </div>
      </header>

      <main className="proto-stage">
        <div className="proto-stage__grid">
          <ProtoLotHoldPanel rows={rows} variant={variant} lastUpdated={new Date(Date.UTC(2026, 5, 17, 9, 0)).toISOString()} />
        </div>
      </main>

      <footer className="proto-footnote">← → 또는 위 A/B/C 버튼으로 시안 전환 · 우상단으로 라이트/다크 확인</footer>
    </div>
  )
}
