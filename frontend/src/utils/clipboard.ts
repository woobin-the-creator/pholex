// 클립보드 복사 — 사내 VM이 http(비-secure context)로 서빙되면 navigator.clipboard가
// 없을 수 있으므로 execCommand('copy') 폴백을 함께 둔다. 성공 여부를 boolean으로 돌려준다.
export async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // secure context인데도 권한 거부 등으로 실패하면 레거시 경로로 폴백
    }
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    ta.style.pointerEvents = 'none'
    document.body.appendChild(ta)
    ta.select()
    ta.setSelectionRange(0, text.length) // iOS/구형 사파리에서 select()만으론 선택이 안 잡힘
    // execCommand('copy')의 반환값은 비-secure 환경(이 폴백의 대상)에서 신뢰할 수 없어
    // — 성공인데 false를 주는 브라우저가 있다 — 예외 없이 실행되면 best-effort 성공으로 본다.
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}
