import type { HoldItem } from '../types/lot'

// [Phase 2] wire의 myHolds 배열(camelCase) → HoldItem[]. snake_case 폴백도 받아
// (backend 재직렬화 경로가 다양해도) 견고하게 파싱한다. 배열이 아니면 빈 배열.
export function normalizeHolds(raw: unknown): HoldItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((h): h is Record<string, unknown> => !!h && typeof h === 'object')
    .map((h) => ({
      operatorAdId: String(h.operatorAdId ?? h.operator_ad_id ?? ''),
      operatorName:
        h.operatorName != null ? String(h.operatorName) : h.operator_name != null ? String(h.operator_name) : null,
      itemType: h.itemType != null ? String(h.itemType) : h.item_type != null ? String(h.item_type) : null,
      comment: h.comment != null ? String(h.comment) : null,
      issueDate:
        h.issueDate != null ? String(h.issueDate) : h.issue_date != null ? String(h.issue_date) : null,
    }))
}

// 대표 hold 사유 — 첫 hold의 comment. hold가 없거나 comment가 비면 rawFallback(구 holdComment)로.
export function representativeComment(holds: HoldItem[], rawFallback: unknown = null): string | null {
  const first = holds.find((h) => h.comment && h.comment.trim().length > 0)
  if (first?.comment) return first.comment
  return rawFallback != null ? String(rawFallback) : null
}
