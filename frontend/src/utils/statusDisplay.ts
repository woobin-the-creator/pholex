// status 표시 레지스트리 — status는 열린 집합(raw lot_status_seg 값)이라,
// 아는 값엔 지정 색(pill 클래스)을 주고 모르는 값은 중립 회색으로 그대로 표시한다.
// 라벨은 변환하지 않는다(raw 문자열 그대로 노출).
const KNOWN_PILL: Record<string, string> = {
  Hold: 'pill--hold',
  Active: 'pill--active',
  PreActive: 'pill--preactive',
}

// 슬롯[1] hold 판정 앵커. 백엔드 LotStatus.HOLD("Hold")와 일치.
export const HOLD_STATUS = 'Hold'

export function statusPillClass(status: string): string {
  return KNOWN_PILL[status] ?? 'pill--unknown'
}
