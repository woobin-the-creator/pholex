// 키워드 Hold 프리셋 "고정(📌)" 영속 — 사용자(사번)별 localStorage.
//
// async 인터페이스로 캡슐화하는 이유: 지금 구현은 localStorage(동기, 즉시 resolve)지만,
// 추후 서버 기반(예: keyword-preset isDefault 토글 엔드포인트)으로 전환할 때
// 이 모듈 내부만 갈아끼우면 호출부(SpecialHoldPanel)는 한 줄도 바뀌지 않는다.
// 동기로 박아두면 서버 전환 시 await 파동이 컴포넌트 전체로 번지므로 처음부터 async로 둔다.
//
// 키는 사번으로 네임스페이스한다 — 공용/교대 단말에서 한 브라우저에 여러 사용자가
// 로그인해도 핀이 섞이지 않게. 서버의 isDefault 도 계정 단위라 추후 전환 시 모델이 1:1로 맞는다.

const keyFor = (sabun: string): string => `kw-hold-pinned:${sabun}`

function safeGet(key: string): string | null {
  try {
    return window?.localStorage?.getItem(key) ?? null
  } catch {
    return null // localStorage 비활성(SSR/샌드박스/프라이버시 모드)
  }
}
function safeSet(key: string, value: string): void {
  try {
    window?.localStorage?.setItem(key, value)
  } catch {
    /* 무시 */
  }
}
function safeRemove(key: string): void {
  try {
    window?.localStorage?.removeItem(key)
  } catch {
    /* 무시 */
  }
}

/** 이 사번이 고정한 프리셋 id. 없거나 손상되면 null. */
export async function getPinnedId(sabun: string): Promise<number | null> {
  const raw = safeGet(keyFor(sabun))
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** 이 사번의 고정 프리셋을 id 로 설정(단일 핀 — 이전 핀을 덮어쓴다). */
export async function setPinned(sabun: string, id: number): Promise<void> {
  safeSet(keyFor(sabun), String(id))
}

/** 이 사번의 고정 해제. */
export async function clearPinned(sabun: string): Promise<void> {
  safeRemove(keyFor(sabun))
}
