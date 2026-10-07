# 시간이 걸리는 단계 — 한 모양으로 「돌고 있다」 보이기

2026-10-08 사용자: 「모든 기능 중에 시간이 걸리는 단계에서 생성 중, 작성 중, 기획 중과 같은 … 로딩 액션
표시가 다 동일한 액션으로 작동되게」. 쉽게(`app/easy`)는 뺀다. 리디자인 전체 화면 창도 위쪽 띠로 바꾼다(사용자 승인).

## 공통 부품 (이미 있음, 커밋 28a5341c)

| 부품 | 파일 | 쓰는 법 |
|---|---|---|
| 위쪽 띠 `WorkingStatus` | `apps/web/app/_components/working-status.tsx` | `label`(필수), `hint`, `startedAt`(걸린 시간), `progress={{done,total,unit?}}`(여러 장일 때만 — 채워지는 막대), `remaining`(「약 N분 남음」), `onStop`/`stopping`(멈출 수 있을 때만), `children`(단계 목록·요약을 띠 안에) |
| 칸 표시 `ItemStatusBadge`, `ItemWorkingOverlay` | `apps/web/app/_components/item-status.tsx` | `state`: `working`(만드는 중)·`queued`(차례 대기)·`done`(완료)·`failed`(실패)·`idle`(만들기 전). 덮개는 부모가 `relative` |
| 낱말 `workingButton(kind)` | `apps/web/app/_components/working-words.ts` | 일하는 동안 단추 글자: plan 기획 중… · write 작성 중… · make 만드는 중… · edit 고치는 중… · analyze 분석 중… · review 검수 중… · save 저장 중… |

`poster/_components/working-banner.tsx` 의 `WorkingBanner` 는 이제 `WorkingStatus` 의 다른 이름이다.

## 규칙

1. 시간이 걸리는 요청을 기다리는 동안 **그 화면 맨 위에 `WorkingStatus` 하나**를 띄운다. 한 화면에 띠는 하나 — 이미 띠가 뜨는 곳에 둘째를 얹지 않는다.
2. 문구는 「○○ 중입니다」 꼴, 낱말은 위 일곱 개에서 고른다(예 「기획과 원고를 작성 중입니다」, 「6장 만드는 중입니다」). 단추 글자는 `workingButton()`.
3. 걸리는 시간을 아는 곳은 `hint` 로 말하고, `startedAt` 은 가능한 곳 모두 준다.
4. 여러 장이면 `progress` 와 칸마다 `ItemStatusBadge`/`ItemWorkingOverlay`. 실제로 보낸 칸만 `working`, 보낼 차례를 기다리는 칸은 `queued`.
5. 멈추는 길이 이미 있는 곳만 `onStop`. 새 멈춤 기능을 만들지 않는다.
6. **보이는 것만 바꾼다.** 요청 몸통·순서·크레딧·재시도·처음 만들기 경로는 0줄 변경.
7. 이미 보여 주던 쓸모 있는 정보는 버리지 않고 띠 안(`children`)이나 옆으로 옮긴다(상세페이지 분석 단계 목록, 이미지 생성의 「약 N분 남음」·크레딧 문구 등).
8. 기존 소스 읽기 테스트가 옛 문구를 재면, 그 문구가 이번 통일로 바뀐 것일 때만 고친다. 규칙을 지키는 단정(중지·비용 안내 등)은 약하게 만들지 않는다.

## 1차 — 카드뉴스·상세페이지 (14곳)

카드뉴스: 첫 기획 시작(`sns/new-client.tsx`), 기획·원고·그림 만들기·카드 다시 만들기·게시글 문구(`sns/[id]/project-client.tsx`, `result-board.tsx`), 레이아웃 미리보기·칸 읽어내기(`sns/layout/layout-client.tsx`), 세트 미리보기(`deck-panel.tsx`).

상세페이지: AI 분석(`create/PdpMakerClient.tsx` 처리 화면 — `PlanProgress` 는 띠 안으로), 구성 시나리오·대표 이미지(`create/TextModeFlow.tsx`, `KeyVisualGate`), 이미지 생성·남은 N장(`create/PdpEditor.tsx` 의 `generationRun` 띠 → `WorkingStatus`), 섹션마다 상태(격자 보기·이어보기 `SectionGallery.tsx`, 편집 화면 「섹션 목록」, 큰 그림 자리), 라이브러리 저장.

## 2차 — 다양하게·리디자인·캐릭터·광고 (11곳)

다양하게(`poster/[id]/poster-client.tsx` — 이미 띠, 걸린 시간·장 수 맞추기), 리디자인(`redesign-wizard.tsx`, 전체 화면 `GenerationProgressPanel` → 위쪽 띠, 취소는 `onStop` 으로 유지), 캐릭터(`CharacterStudio.tsx` 의 `MakingBox`·각도 상자 → 띠 + 칸 표시), 광고(`ad-export-client.tsx` 뽑아 보기 → 띠 + 장 수).
