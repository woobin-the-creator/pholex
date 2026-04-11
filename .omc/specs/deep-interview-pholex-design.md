# Deep Interview Spec: Pholex 디자인 시스템 섹션 추가

## Metadata
- Interview ID: pholex-design-2026-04-10
- Rounds: 4
- Final Ambiguity Score: 14%
- Type: brownfield
- Generated: 2026-04-10
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.32 |
| Constraint Clarity | 0.85 | 0.25 | 0.21 |
| Success Criteria | 0.80 | 0.25 | 0.20 |
| Context Clarity | 0.90 | 0.15 | 0.14 |
| **Total Clarity** | | | **0.86** |
| **Ambiguity** | | | **14%** |

## Goal
`docs/pholex-design.md`의 내용 보완 — 웹디자인 관련 내용(비주얼 가이드라인)이 없어서, Notion 디자인 시스템(VoltAgent/awesome-design-md 기준)을 참고한 **Section 13: 디자인 시스템** 섹션을 새로 추가한다.

## Constraints
- 기존 문서(Section 1~12) 내용은 수정하지 않음
- 색상/타이포/스페이싱은 Notion의 warm minimalism 기준을 따름
- 한국어로 작성, 기존 문서 스타일(표+코드블록) 유지
- CSS 변수 형식으로 디자인 토큰 정의
- 라이트 모드 기준 (Notion 스타일은 white/warm-white 기반)

## Non-Goals
- 기존 섹션(1~12) 수정 없음
- 다크모드 토큰 정의 제외 (추후 확장 가능 메모만)
- 실제 CSS 파일 생성 없음 (문서 명세만)
- 다른 디자인 시스템(Material, Ant 등) 참고 없음

## Acceptance Criteria
- [ ] Section 13이 기존 문서 끝에 추가됨
- [ ] 색상 팔레트: Primary, Warm Neutral Scale, Semantic Accent, Interactive 색상 포함
- [ ] 타이포그래피: 계층별 표 (역할/크기/폰트무게/행간/자간) 포함
- [ ] 스페이싱 시스템: 8px 기본 단위, 스케일 정의
- [ ] 컴포넌트 스타일: 버튼(Primary/Secondary/Badge), 카드, 입력 필드 명세
- [ ] 깊이/그림자: Whisper Border + 카드 그림자 스택 정의
- [ ] CSS 변수 코드블록 포함

## Technical Context
- 파일: `docs/pholex-design.md` (411줄, 기존 12개 섹션)
- 디자인 소스: VoltAgent/awesome-design-md → design-md/notion/README.md → getdesign.md/notion/design-md
- Notion 디자인 시스템 특징: warm neutral palette, NotionInter 폰트, whisper border (1px solid rgba(0,0,0,0.1)), multi-layer shadow stacks

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| DesignDoc | core domain | file_path, sections | contains VisualGuideline |
| VisualGuideline | core domain | color, typography, spacing | part of DesignDoc |
| NotionDesignSystem | external system | colors, fonts, components | source for VisualGuideline |
| ColorPalette | supporting | hex values, roles | part of VisualGuideline |
| Typography | supporting | size, weight, line-height | part of VisualGuideline |
| ComponentStyle | supporting | button, card, input | part of VisualGuideline |

## Interview Transcript
<details>
<summary>Full Q&A (4 rounds)</summary>

### Round 1
**Q:** 이 문서를 '다듬는다'고 했을 때 핵심 목적이 뭔가요?
**A:** 내용 보완
**Ambiguity:** 71% (Goal: 0.35, Constraints: 0.10, Criteria: 0.10)

### Round 2
**Q:** 문서에서 비어있다고 느끼는 부분이 주로 어느 쪽인가요?
**A:** 웹디자인 관련 내용
**Ambiguity:** 52% (Goal: 0.60, Constraints: 0.50, Criteria: 0.15)

### Round 3
**Q:** 웹디자인 내용을 보완했을 때, 문서에 어떤 수준의 명세가 들어가면 충분하다고 할 것 같은가요?
**A:** 비주얼 가이드라인
**Ambiguity:** 32% (Goal: 0.75, Constraints: 0.65, Criteria: 0.60)

### Round 4 (Contrarian Mode)
**Q:** 비주얼 가이드라인을 진행할 때, 어떤 디자인 방향을 기준으로 삼아야 하나요?
**A:** https://github.com/VoltAgent/awesome-design-md 에서 Notion 디자인 가이드라인 찾아서 그거대로 만들고 싶음
**Ambiguity:** 14% ✅

</details>
