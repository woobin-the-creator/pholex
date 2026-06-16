import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

// vitest 는 frontend/ 를 cwd 로 실행한다.
// (styles.css?raw 임포트는 jsdom 환경에서 빈 값을 줘서 디스크에서 직접 읽는다)
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

/**
 * 폰트 정책 가드 — 프론트엔드 전역 폰트는 mono(JetBrains Mono) 하나로 강제한다.
 *
 * 규칙:
 *  1. styles.css 의 :root 에 --font-mono 토큰이 정의돼 있어야 한다.
 *  2. body 는 --font-mono 를 써야 한다.
 *  3. 모든 font-family 선언은 다음 중 하나여야 한다:
 *       - var(--font-mono)
 *       - inherit
 *       - monospace 를 포함 (토큰 자체 정의 줄)
 *       - 아이콘 폰트 'Material Symbols Outlined' (유일한 예외, 아래 ALLOWLIST)
 *     즉 'Inter' / 'sans-serif' / 'Roboto' 같은 비-mono 폰트를 새로 박으면 실패한다.
 *
 * 새 컴포넌트는 폰트를 직접 지정하지 말고 inherit 하거나 var(--font-mono) 를 쓸 것.
 */

// font-family 선언 중 예외로 허용되는 정확한 값 (아이콘 폰트)
const ALLOWLIST = new Set(['material symbols outlined']);

function familyDeclarations(source: string): { value: string; raw: string }[] {
  const out: { value: string; raw: string }[] = [];
  const re = /font-family\s*:\s*([^;}]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push({ value: m[1].trim().toLowerCase(), raw: m[0].trim() });
  }
  return out;
}

describe('폰트 정책: 전역 mono 강제', () => {
  it('--font-mono 토큰이 :root 에 정의돼 있다', () => {
    expect(/:root\s*\{[^}]*--font-mono\s*:/s.test(css)).toBe(true);
    expect(/--font-mono\s*:\s*'JetBrains Mono'\s*,\s*monospace/i.test(css)).toBe(true);
  });

  it('body 는 --font-mono 를 쓴다', () => {
    expect(/\bbody\s*\{[^}]*font-family\s*:\s*var\(--font-mono\)/s.test(css)).toBe(true);
  });

  it('모든 font-family 선언이 mono / inherit / 아이콘폰트 예외만 사용한다', () => {
    const violations = familyDeclarations(css).filter(({ value }) => {
      if (value === 'inherit') return false;
      if (value.includes('var(--font-mono)')) return false;
      if (value.includes('monospace')) return false; // 토큰 정의 줄
      if (ALLOWLIST.has(value.replace(/['"]/g, ''))) return false;
      return true; // 그 외 = 위반 (Inter, sans-serif, 임의 폰트 직박이)
    });

    expect(
      violations,
      `비-mono font-family 발견 — var(--font-mono) 또는 inherit 을 쓰세요:\n` +
        violations.map((v) => `  · ${v.raw}`).join('\n'),
    ).toEqual([]);
  });
});
