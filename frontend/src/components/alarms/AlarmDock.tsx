import { useEffect, useRef, useState } from 'react'
import type { AlarmItem } from '../../types/alarm'
import { alarmMatchesQuery, clockLabel, describeAlarm } from '../../utils/alarmDisplay'

interface AlarmDockProps {
  open: boolean
  alarms: AlarmItem[]
  onClose: () => void
  onClear: () => void
  onSelect: (lotId: string, eventId: string) => void
}

/**
 * 좌측 사이드바 "알람 박스"가 열어주는 패널. 변경을 시간순 평면 로그로 보여준다.
 * 항목 클릭 → 메인 테이블의 해당 랏으로 점프(App focusLot) + 그 알람 제거(처리됨).
 * 적립은 localStorage 영속.
 */
export function AlarmDock({ open, alarms, onClose, onClear, onSelect }: AlarmDockProps) {
  // 검색은 dock 로컬 상태 — 상위 atom(적립/배지)은 전체 기준 그대로 유지한다.
  // dock이 닫히면 (open=false) 컴포넌트가 unmount되므로 다음에 열 때 자동 초기화된다.
  const [query, setQuery] = useState('')

  // 스크롤 힌트: 위/아래로 더 스크롤할 게 있으면 글래스 화살표를 띄운다.
  const listRef = useRef<HTMLUListElement>(null)
  const [hint, setHint] = useState({ up: false, down: false })

  const visible = open ? alarms.filter((alarm) => alarmMatchesQuery(alarm, query)) : []

  const recomputeHint = () => {
    const el = listRef.current
    if (!el) {
      setHint({ up: false, down: false })
      return
    }
    const overflow = el.scrollHeight - el.clientHeight
    setHint({
      up: el.scrollTop > 4,
      down: overflow > 4 && el.scrollTop < overflow - 4,
    })
  }

  // list 마운트/내용 변경(검색·신규 알람) 때마다 힌트를 다시 계산한다.
  useEffect(recomputeHint, [open, visible.length, query])

  const scrollByDir = (dir: 1 | -1) => {
    const el = listRef.current
    if (!el) return
    el.scrollBy({ top: dir * el.clientHeight * 0.8, behavior: 'smooth' })
  }

  if (!open) return null

  return (
    <aside className="alarm-dock" role="dialog" aria-label="알람 박스">
      <header className="alarm-dock__head">
        <h2 className="alarm-dock__title">알람 박스</h2>
        <div className="alarm-dock__head-actions">
          <button
            type="button"
            className="alarm-dock__clear"
            onClick={onClear}
            disabled={alarms.length === 0}
          >
            모두 비우기
          </button>
          <button type="button" className="alarm-dock__close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
      </header>

      {alarms.length > 0 ? (
        <div className="alarm-dock__search">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="lot ID·내용 검색"
            aria-label="알람 검색"
          />
        </div>
      ) : null}

      {alarms.length === 0 ? (
        <p className="alarm-dock__empty">새 알람이 없습니다.</p>
      ) : visible.length === 0 ? (
        <p className="alarm-dock__empty">검색 결과가 없습니다.</p>
      ) : (
        <div className="alarm-dock__scrollwrap">
          {hint.up ? (
            <button
              type="button"
              className="alarm-dock__scrollhint alarm-dock__scrollhint--up"
              onClick={() => scrollByDir(-1)}
              aria-label="위로 스크롤"
              tabIndex={-1}
            >
              <svg
                className="alarm-dock__chevron"
                viewBox="0 0 22 22"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="5 14 11 8 17 14" />
              </svg>
            </button>
          ) : null}

          <ul className="alarm-dock__list" ref={listRef} onScroll={recomputeHint}>
            {visible.map((alarm: AlarmItem) => (
              <li key={alarm.eventId}>
                <button
                  type="button"
                  className={`alarm-item alarm-item--${alarm.severity}${alarm.read ? '' : ' is-unread'}`}
                  onClick={() => onSelect(alarm.lotId, alarm.eventId)}
                >
                  <span className="alarm-item__lot">{alarm.lotId}</span>
                  <span className="alarm-item__desc">{describeAlarm(alarm)}</span>
                  <span className="alarm-item__time">{clockLabel(alarm.occurredAt)}</span>
                </button>
              </li>
            ))}
          </ul>

          {hint.down ? (
            <button
              type="button"
              className="alarm-dock__scrollhint alarm-dock__scrollhint--down"
              onClick={() => scrollByDir(1)}
              aria-label="아래로 스크롤"
              tabIndex={-1}
            >
              <svg
                className="alarm-dock__chevron"
                viewBox="0 0 22 22"
                width="15"
                height="15"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="5 8 11 14 17 8" />
              </svg>
            </button>
          ) : null}
        </div>
      )}
    </aside>
  )
}
