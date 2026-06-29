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
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}
