# 상세페이지 시스템 전수 리뷰 — 2026-09-17

> 조사 요청: 「상세페이지 시스템을 자세히 파악하고, 작동 오류를 찾아 달라」
> 조사 방법: 6개 영역을 나눠 코드를 직접 읽고, 일부는 실제로 실행해 확인했다.
> **코드는 한 줄도 고치지 않았다.** 이 문서는 기록이다.

---

## 0. 요약

| 구분 | 건수 |
|---|---|
| 높음 | 22 |
| 중간 | 24 |
| 낮음 | 18 |
| **합계** | **64** |

그중 **실행으로 확증한 것 3건**(초안 왕복 소실, 모델별 크레딧 차이, 리디자인 과금 수치),
나머지는 코드를 직접 읽어 확인한 것이다. 확인하지 못한 것은 본문에 **미확인**으로 적었다.

### 한 줄 진단

**같은 일을 하는 자리가 둘인데 한쪽만 고쳐졌다.** 단건 vs 일괄 라우트, pdp vs 리디자인 코어,
`buildDraftInput` vs `savePdpDraft`, 화면 vs 서버의 모델 선택. 코드 주석은 이 위험을 거듭
경고하는데, 방어가 **한 겹에서 멈춰** 다음 관문에서 샌다.

---

## 1. 시스템 구조

| 축 | 위치 | 규모 |
|---|---|---|
| 새로 만들기 | `apps/web/app/create` + `packages/pdp-core` + `app/api/pdp/*` | 약 19,800줄 |
| 리디자인 | `apps/web/app/redesign` + `packages/redesign-core` + `app/api/redesign/*` | 별도 코어 |
| 저장 | 브라우저 IndexedDB(초안) + Supabase(라이브러리, 읽기 전용) | |
| AI — 글 | Claude `claude-sonnet-5` → 실패 시 OpenAI `gpt-5.6-sol` (`lib/pdp/providers.ts:20`) | |
| AI — 그림 | fal 경유 7개 모델, 기본값 `gpt-image-2.5-flare` | |

### 1-1. 화면 단계는 좌표계가 셋이다

- `appState`: `upload | processing | scenario | editor` (`PdpMakerClient.tsx:49`)
- `startMode`: `image | text` (`:51`)
- `textStage`: `input | scenario | unverifiedReview | keyVisual` (`:77`) — **`appState` 와 독립적으로 흐른다**
- 단계막대가 보여주는 4단계(`create-steps.ts`)는 위 셋과 **이름이 다른 별개의 좌표계**이고,
  세 곳(`PdpMakerClient.tsx:790`·`:637`, `PdpEditor.tsx:2133`)에서 각각 다르게 매핑한다.

이 세 축이 안 맞물리는 것이 아래 A-12·A-18 의 원인이다.

### 1-2. 검사 현황 — 전부 통과한다

| 대상 | 결과 |
|---|---|
| `packages/pdp-core` | 617건 통과 |
| `apps/web` 중 `app/create` + `app/api/pdp` | 149건 통과 |
| redesign-core 74건 + 웹 리디자인 61건 | 통과 |
| 타입 검사 (`tsc --noEmit`) | pdp-core 0건, web 0건 |

**그래서 아래 문제들이 살아 있다.** 검사가 못 잡는 이유는 셋이다.

1. **한 단계 위에서 멈춘다** — `draft-input.test.ts` 는 `buildDraftInput` 의 결과만 재고,
   IndexedDB 왕복은 안 잰다. 그 아래 `savePdpDraft` 에서 값이 샌다.
2. **파일을 잘못 본다** — `redesign-quality.test.ts` 는 `generate.ts` 만 읽어
   `edit-section.ts` 의 `quality: "low"` 를 못 본다.
3. **대상이 빠졌다** — `finalize-safety.test.ts` 는 네 라우트만 지키고 `plan-from-text` 가 빠졌다.
   `api/redesign` 라우트 테스트는 0건이다.

---

## 2. 영역 A — 화면 흐름 (`apps/web/app/create`)

### A-1. [높음·실행 확증] 디자인 레퍼런스·첨부 지시가 저장되지 않는다

`pdp-drafts.ts:243` 의 `savePdpDraft` 가 레코드를 **필드 하나씩 나열**하면서 세 칸을 빠뜨렸다.
읽는 쪽(`normalizeDraftRecord`, `:345`)도 같이 빠뜨렸다.

```ts
const nextRecord: PdpDraftRecord = {
  id: …, look: input.look, userInstruction: input.userInstruction,
  aspectRatio: input.aspectRatio,   // ← attachmentIntents / styleReference /
  notice: input.notice,             //    styleReferenceEnabled 가 없다
  editorState: input.editorState,
};
```

**실행 확증** — `fake-indexeddb` 로 `savePdpDraft` → `getPdpDraft` 왕복을 실제로 돌린 결과:

```
userInstruction:        "지시문"      ← 살아남음
attachmentIntents:      undefined    ← 사라짐
styleReference:         undefined    ← 사라짐
styleReferenceEnabled:  undefined    ← 사라짐
```

**세 겹의 안전장치를 모두 통과한다.** 타입에는 선언돼 있고(`:139`·`:146`·`:147`, 옵셔널),
화면은 제대로 넘기고(`draft-input.ts` 의 `...rest`), 복원 쪽도 제대로 읽는다
(`PdpMakerClient.tsx:405-408`). 새는 곳은 저장 한 군데다.

**재현**: 레퍼런스를 붙이고 「어떻게 쓸까요」에 적는다 → 저장 → 다시 연다 → 없다.
꺼 둔 토글은 켜진 채로 돌아온다.

**뼈아픈 점**: `draft-input.ts:5` 주석이 "여기서 한 칸을 빠뜨리면 조용히 잃는다 …
그래서 화면 밖으로 뺐다"고 적어 두고, **한 단계 아래에서 같은 실수를 반복**한다.

### A-2. [높음] 「설정 바꿔 다시 만들기」가 만든 이미지와 레이어를 확인 없이 지운다

`ScenarioEditor.tsx:294` 버튼 → `PdpMakerClient.tsx:683` → `handleAnalyze` → `:571`

```ts
setResult(response.result);
setEditorDraftState(null);   // ← 섹션 이미지·레이어·섹션옵션이 여기 들어 있었다
```

`editorDraftState` 는 `sections`(각 `generatedImage` 포함)·`overlaysBySection`·`sectionOptions`
를 담는 **유일한 그릇**이다(`pdp-drafts.ts:77`). `null` 로 밀면 화면에서 사라지고, 30초 뒤
자동 저장이 `draft-input.ts:62` 의 `defaultEditorState()` 로 **IndexedDB 사본까지 빈 섹션으로
덮어쓴다.** 되돌릴 자리가 없고, 이미 차감된 크레딧도 안 돌아온다.

확인 대화상자가 없다. 게다가 그 화면은 `ScenarioEditor.tsx:298` 에서
**"아직 이미지를 만들지 않았습니다"** 라고 안내하는데, 편집기에서 돌아온 경우 거짓이다.

### A-3. [높음] 편집기에 들어갔다 나오면 02 화면에서 고친 내용이 버려진다

`PdpMakerClient.tsx:700`, `PdpEditor.tsx:252`
편집기는 `initialDraftState` 에 든 옛 섹션을 그대로 쓴다. 편집기에서 지운 섹션도 02 화면에
다시 나타난다.

### A-4. [높음] 편집기 「섹션 추가」로 만든 섹션은 생성할 수 없다

`PdpEditor.tsx:1739`, `pdp.service.ts:528`
`prompt_en` 이 비어 400. 편집기에는 이 칸을 고칠 곳이 없고, 02 화면에는 그 섹션이 안 보인다.

### A-5. [높음] 초안을 불러온 뒤 고친 「이미지 방향」이 생성에 반영되지 않는다

`PdpMakerClient.tsx:684`
`analyzedBlueprint` 가 `null` 이라 병합을 건너뛴다. 원래 장면으로 생성된다.
글 경로에서 편집기 → 02 로 올라간 경우도 같다.

### A-6. [높음] 초안을 불러오면 앞 제품의 영문 장면이 새 제품 프롬프트를 덮어쓴다

`PdpMakerClient.tsx:126`·`:567`, `pdp.text-plan.ts:461`
A 제품 분석 → 같은 화면에서 B 초안 불러오기 → 02 에서 확정 → B 의 모든 섹션 `prompt_en` 이
「A 의 영문 장면 + B 의 한국어 방향」이 된다. 원인은 `S1` 같은 `section_id` 가 제품이 달라도
맞물리는 것이다.

### A-7. [중간] 「처음부터 다시」가 앞 작업의 설정을 안 지운다

`PdpMakerClient.tsx:330` 의 `resetWorkspace` 가 되돌리는 것은 20개인데 화면 상태는 40개가 넘는다.
**다른 곳에서 초기화되는 것은 하나도 없다**(setter 호출처 전수 확인).

| 남는 값 | 증상 |
|---|---|
| `userInstruction` | 앞 제품에 적은 지시가 새 제품 전 섹션 프롬프트에 앞뒤로 두 번 실린다. 화면은 `:1567` 에서 "다른 모든 지시보다 우선합니다"라고 약속한다 |
| `look` | 앞 작업의 그림체가 유지된다. `auto` 였다면 A-10 상태로 굳는다 |
| `characterId`·`characterAngles` | 앞 작업의 인물이 새 제품에 계속 등장한다. 칸이 화면 아래라 눈치채기 어렵다 |
| `preserveProduct` | 껐다면 꺼진 채 시작한다 |
| `imageModel` | 비싼 모델이 유지돼 차감 장수가 예상과 달라진다 |

바로 위 `:404` 주석이 "안 되돌리면 앞 작업의 제품 지시가 새 제품에 그대로 붙는다"고 적혀 있는데,
정작 그 옆의 `userInstruction` 이 빠져 있다.

**정정**: `review`·`startMode` 는 증상이 없다. `review` 는 `result` 가 생길 때마다 함께
갱신되고, `startMode` 유지는 오히려 자연스럽다.

### A-8. [중간] 초안에 `imageModel`·`characterId`·`preserveProduct` 가 아예 없다

`pdp-drafts.ts:243`, `PdpMakerClient.tsx:370`
**어느 쪽으로 열든 틀린다.**

- **같은 화면의 목록에서 열면** → 직전 작업의 값이 그대로 따라온다(컴포넌트가 안 죽으므로).
  제품 A 에서 캐릭터 「민지」·`nano-banana-pro` 선택 → B 초안 불러오기 → B 화면에 민지와
  그 모델이 선택된 상태. B 를 저장할 때 이 셋은 저장되지 않으므로 표시와 저장 내용도 갈린다.
- **라이브러리 「이어서 편집」 또는 새로고침** → 기본값으로 떨어진다
  (`gpt-image-2.5-flare`, 캐릭터 없음, `preserveProduct: true`).
  캐릭터로 3장 만든 뒤 이어서 만들면 앞 3장과 인물·모델이 다른 결로 나온다.

### A-9. [중간] 브리프를 고쳐도 「변경됨」 표시가 안 되고, 입력 중에는 자동 저장이 안 돈다

`PdpMakerClient.tsx:196`·`:502`
한 번 저장한 뒤 브리프 5칸을 채우고 탭을 닫으면 경고도 자동 저장도 없이 사라진다.
계속 타이핑하는 동안에는 30초 타이머가 매번 재시작돼 한 번도 돌지 않는다.

### A-10. [중간] 「레퍼런스 스타일」을 고른 뒤 레퍼런스를 빼면 그림체 지시가 아예 안 나간다

`PdpMakerClient.tsx:1290`·`:1518`, `pdp.image-prompt.ts:218`
`look="auto"` 가 남는데, 상세페이지는 `resolveLook` 을 부르지 않아 실사 지시 없이 생성된다.

### A-11. [중간] 02 화면에서 새로 붙인 레퍼런스가 꺼진 채로 붙는다

`PdpMakerClient.tsx:676`·`:704`
업로드 화면에서 토글을 끄고 뺀 뒤 02 에서 새 레퍼런스를 붙이면 토글은 여전히 꺼져 있고,
편집기로 넘어갈 때 걸러져 생성에 안 쓰인다.

### A-12. [중간] 글 경로에서 편집기 → 「01 텍스트 입력」을 누르면 빈 화면에 갇힌다

`PdpMakerClient.tsx:724`, `TextModeFlow.tsx:244`·`:291`
`textStage="keyVisual"` 인 채 다시 마운트돼 "아직 이미지가 없습니다"가 뜨고,
「시나리오 고치기」·「다시 만들기」가 반응하지 않는다.

### A-13. [중간] 「설정 바꿔 다시 만들기」가 글 경로에서는 아무 반응이 없다

`PdpMakerClient.tsx:519`·`:680`
`preparedImage` 가 없어 조기 반환하는데, 시나리오 화면에는 `errorMessage` 를 보여줄 자리가 없다.
이 화면은 `isBusy={false}` 가 하드코딩돼 있다. 버튼 이름과 달리 설정 화면으로 돌아가지도 않는다.

### A-14. [낮음] 캐릭터 목록 로드가 실패해도 `characterId` 는 계속 전송된다

`CharacterPicker.tsx:61`·`:84`
화면에는 선택이 없는데 요청에는 캐릭터가 실린다.

### A-15. [낮음·미확인] `section_id` 가 중복되면 한 섹션을 고쳐도 둘이 함께 바뀐다

`pdp.evidence.ts:268`, `ScenarioEditor.tsx:401`
AI 응답에서 실제로 중복되는지는 확인하지 못했다.

### A-16. [낮음] 생성 결과를 붙일 때 옛 `sectionKeys` 를 참조한다

`PdpEditor.tsx:1432`·`:1609`
지금은 `disabled={isBusy}` 한 겹으로만 막혀 있다. 생성 중 순서 변경 경로가 생기면
이미지가 다른 섹션에 붙는다.

### A-17. [낮음] 글 경로 도중 시작 방식을 바꾸면 경고 없이 작업이 사라진다

`PdpMakerClient.tsx:826`
대표 이미지 단계에서 「이미지로 시작」을 누르면 입력한 글·구성안·**이미 과금된 대표 이미지**가 사라진다.

### A-18. [낮음] 글 경로로 만든 초안을 열면 사진 업로드 화면이 뜬다

`PdpMakerClient.tsx:421` — `startMode` 가 저장되지 않는다.

---

## 3. 영역 B — 편집기·갤러리 (`PdpEditor.tsx`, `pdp-canvas-utils.ts`, `SectionGallery.tsx`)

### 3-0. 설계 요약 (정상 동작하는 부분)

- 레이어·섹션옵션은 **순서가 아니라 섹션 고유 키**로 저장한다(`pdp-drafts.ts:175` `buildSectionKeys`,
  중복 `section_id` 는 `S3~1` 로 가른다). 순서 변경·삭제 시 키를 함께 옮기고 지운다.
  **이 매핑은 네 갈래 모두 검산했고 정확하다.**
- 화면과 내보내기가 **같은 스타일 함수**를 쓴다(`pdp-canvas-utils.ts:50-75`).
- 단건 생성은 `x-idempotency-key` 로 재시도 중복 차감을 막고, 응답 반영은 키 비교라
  생성 중 순서가 바뀌어도 제 섹션을 찾는다(`PdpEditor.tsx:1431`).

### B-1. [높음] 레이어 좌표가 화면 폭에 묶여 있다

`pdp-maker.module.css:176`
```css
.imageCanvas { position: relative; width: min(100%, 460px); }
```
`PdpEditor.tsx:1941`
```ts
const width = imageContainerRef.current?.clientWidth || lastCanvasWidthRef.current || 460;
```

레이어의 `x·y·width·height·폰트크기`가 **캔버스 CSS 픽셀 절대값**이다. 정규화가 어디에도 없다.
`ResizeObserver`·`window.resize`·`matchMedia` 가 편집기 관련 파일 전체에 **0건**이다.

**재현**: 데스크톱(460px)에서 헤드라인을 오른쪽에 배치(`x≈380`) → 저장 → 좁은 창(≈300px)에서
같은 초안을 연다 → 레이어는 여전히 `x:380` 이라 캔버스 밖 → 다운로드하면
`overflow:hidden`(`pdp-canvas-utils.ts:89`)에 걸려 **글자가 잘린 JPEG** 이 나온다.

### B-2. [높음] 내보낸 이미지 해상도가 원본의 40%로 떨어진다

`PdpEditor.tsx:1955` — `html2canvas(exportNode, { scale: 2 })` → `toBlob(…, "image/jpeg", 0.92)`
`pdp.image-provider.ts:95` — 생성 크기는 `3:4` = 1536×2048, `9:16` = 1536×2752

캔버스 폭(최대 460px) × 2 = **최대 920px**. 레이어를 하나도 안 얹어도 모든 다운로드가
`captureSectionBlob` 을 거치므로 피할 길이 없다. PNG→JPEG 변환 손실도 함께 난다.

소개 문서(`docs/overview/README.md`)의 "상세페이지는 확대해서 보는 물건이라 고해상도로 뽑는다"와 정반대다.

### B-3. [높음] 「라이브러리에 저장」이 얹은 글자를 버린다

**저장·내보내기 경로 다섯 중 둘만 레이어를 포함한다.**

| 경로 | 위치 | 레이어 |
|---|---|---|
| 현재 섹션 다운로드 | `PdpEditor.tsx:1976` → `captureSectionBlob` | O |
| 전체 ZIP | `PdpEditor.tsx:2061` → 반복 + JSZip | O |
| **라이브러리에 저장** | `PdpEditor.tsx:2011` → `section.generatedImage` 원본 | **X** |
| 참고 이미지로 저장 | `PdpEditor.tsx:2207` | X (설계 — 레퍼런스 용도) |
| 레퍼런스로 저장 | `SectionGallery.tsx:171` | X (설계 — 레퍼런스 용도) |

뒤 둘은 주석에 레퍼런스 용도라고 적혀 있어 원본이 맞다. 그러나 **「라이브러리에 저장」은
완성본 보관을 뜻하는데 레이어를 빼는 근거가 주석·테스트에 0건**이라 누락으로 보인다.

### B-4. [높음] 편집기 글꼴 두 개가 선언된 적이 없다

`editor-options.ts:13`
```ts
{ label: "Pretendard",   value: "'Pretendard', sans-serif" },
{ label: "Noto Sans KR", value: "'Noto Sans KR', sans-serif" },
```
`@font-face` 로 선언된 이름은 **`'Pretendard Variable'` 뿐**이고(`apps/web/app/pretendard.css`),
`Noto Sans KR` 은 저장소 전체에서 이 한 줄 말고는 **파일도 선언도 없다**.

**재현**: Pretendard 가 설치되지 않은 PC 에서 카피를 얹으면 본문과 다른 대체 글꼴로
화면·JPEG 양쪽에 찍힌다.

저장소는 같은 사고를 이미 두 번 겪고 `globals.css:190`·`hero.css:523` 에 기록해 뒀다.
**편집기만 안 고쳐졌다.** html2canvas 는 `documentClone.fonts.ready` 를 기다리므로
(`html2canvas.js:5247`) 이건 로딩 경쟁이 아니라 **없는 이름을 고르게 해 둔 것**이다.

### B-5. [중간] 확대보기 모달이 전역 뷰어와 겹쳐 열린다

`SectionGallery.tsx:476`·`:150`, `image-viewer.tsx:151`
모달 이미지의 `data-zoomable` 때문에 전역 뷰어가 위에 또 열리고, keydown 리스너 둘이 동시에 돈다.
Esc 한 번에 두 겹이 함께 닫히고, → 를 누르면 뒤 모달의 `zoomIndex` 만 조용히 넘어간다.

### B-6. [중간] 정렬을 바꾸면 상자가 캔버스 밖으로 나간다

`PdpEditor.tsx:524` — 폭이 `fontSize×10`(최대 520)으로 늘어난다. `Rnd` 가 통제형이라 `bounds` 가 안 걸린다.
Headline(42px, x:52)을 「가운데」로 바꾸면 폭 420 → 오른쪽 끝 472px → 460px 캔버스에서 잘린다.

### B-7. [중간] 되돌리기도, 삭제 확인도 없다

`PdpEditor.tsx:1684`, `SectionGallery.tsx:340` — 편집기 전체에서 undo·confirm **0건**.
갤러리 휴지통을 실수로 누르면 그 섹션의 레이어가 즉시 영구 삭제되고, 30초 자동 저장이 덮어쓴다.
섹션 재생성도 `generatedImage` 를 덮어쓰며 이전 결과를 되돌릴 방법이 없다.

### B-8. [중간] 앞쪽 섹션을 지우면 보고 있던 섹션이 바뀐다

`PdpEditor.tsx:1703` — 끝 쪽으로 자르기만 하고 앞쪽 삭제 보정이 없다.
`[A,B,C,D]` 에서 B 를 보다가 A 를 삭제하면 C 가 뜬다.

### B-9. [중간] 갤러리·이어보기가 얹은 글자를 안 보여 준다

`SectionGallery.tsx:286`·`:410` — 원본만 그린다. 주석(`:392`)은 "실제 상세페이지처럼 최종 모습
그대로 본다"고 적혀 있다. 얹은 글자는 "레이어 3" 배지로 개수만 알려 준다.

### B-10. [중간] 그림자 blur 가 화면과 다르게 구워진다

`html2canvas.js:6757` — blur 에 `scale` 을 안 곱한다. `scale:2` 라 오프셋은 2배인데 blur 는 1배다.
그림자는 기본 켜짐(`PdpEditor.tsx:1801`)이다.

### B-11. [낮음] 새 레이어가 항상 같은 자리에 겹쳐 쌓인다

`PdpEditor.tsx:1789`(텍스트 `x:52,y:52`), `:1826`(도형 `x:64,y:64`) — 고정값이라 여러 개를 얹으면 정확히 겹친다.

### B-12. [낮음] 그 밖

| 항목 | 위치 |
|---|---|
| `downloadBlob` 이 앵커를 DOM 에 안 붙이고 objectURL 을 즉시 해제(다른 구현과 불일치) | `pdp-canvas-utils.ts:165` |
| 캔버스 `img` 에 `onError` 가 없어 손상된 초안이 빈 캔버스로 뜬다 | `PdpEditor.tsx:2553` |
| `onDrag` 가 mousemove 마다 부모 트리 전체를 리렌더 | `PdpEditor.tsx:2588` |
| 캔버스 폭 변화 감지가 없어 창만 바꾸고 ZIP 받으면 옛 폭으로 나간다 | `PdpEditor.tsx:2546` |
| export 의 `objectFit:"cover"` 를 html2canvas 가 무시(지금은 우연히 무해) | `pdp-canvas-utils.ts:80` |
| `white-space: pre-wrap` 미해석 — **미확인** | `pdp-canvas-utils.ts:196` |
| `sectionKeys` 복원 가드가 초안의 길이와 비교(도달 경로 못 찾음) | `PdpEditor.tsx:273` |

**html2canvas 1.4.1 조사 결과**: 실제로 틀리게 그리는 것은 `text-shadow` blur 하나뿐이다.
미구현인 `filter`·`backdrop-filter`·`mix-blend-mode`·`clip-path` 는 이 내보내기 노드에 쓰이지 않고,
`box-shadow`(inset 포함)·`border-radius`·`word-break: keep-all` 은 지원한다.

---

## 4. 영역 C — API 라우트 (`app/api/pdp/*`)

**인증은 구멍이 없다.** `middleware.ts:72` 가 모든 `/api/` 를 미들웨어 검사에서 빼지만,
PDP 7개 라우트 모두 `authenticateApiMember` 를 직접 또는 `reserveAiUsage` 경유로 부른다.
`lib/dev-auth.ts:18` 의 우회는 `NODE_ENV !== "production"` 에 묶여 배포본에서 안 열린다.

### C-1. [높음] batch 라우트는 잘못된 입력 하나로 크레딧을 10분 묶는다

`batch/route.ts:121`(예약) ~ `:230`(확정) 사이에 **`try` 가 없다.**
그 구간에 `teamIdOf`(:138)·`loadCharacterView`(:142)·`withSlicedStyleReference`(:151)·
`buildSectionImageOptions`(:163, **동기 호출이라 `Promise.allSettled` 그물 밖**)가 있다.

```jsonc
POST /api/pdp/images/batch
{ "sections":[…], "page": { "styleReference": { "imageBase64": 123, "mimeType": "image/png" } } }
```
`lib/pdp/slice-image.ts:106` 의 `page?.styleReference?.imageBase64?.trim()` 은 옵셔널 체이닝이라
null 만 막고 **숫자는 못 막는다** → TypeError → 본문 없는 500 → `generation_events` 가
`reserved` 로 남는다. `reserve_generation` 은 미완 예약이 1건만 있어도 `concurrent_limit` 을 주고
(`supabase/migrations/202609070005_team_credit.sql:220`), 예약 수명은 10분(:250)이다.
→ **그 사용자는 최대 10분 동안 그림을 하나도 못 만든다.**

같은 입력을 단건 라우트에 보내면 `images/route.ts:101` 이 `try` 안이라 깔끔한 오류 봉투가 나온다.
**쌍둥이 라우트가 갈렸다.**

### C-2. [높음] `plan-from-text` 만 안전장치에서 빠졌다

`plan-from-text/route.ts:43`
```ts
const result = await planFromText(body, providers);          // 이미 성공
const usage = await finalizeAiUsage(reservation, true, 0);   // ← 던지는 갈래
```
`finalizeAiUsage` 는 RPC 가 흔들리면 던진다(`lib/membership/api.ts:186`). 이 줄이 `try` 안이라
완성된 결과가 catch 로 빨려 들어가 오류 봉투가 되고 → `:70` 에서 finalize 를 또 부르고 →
외곽 catch 에서 세 번째로 부른 뒤 POST 밖으로 던진다.
사용자는 "서버와 통신하지 못했습니다"를 보고 다시 눌러 글 모델 값을 또 쓴다.

`finalize-safety.test.ts:15` 가 지키는 대상은 analyze·images·key-visual·batch **넷뿐**이고,
그 파일 머리말이 "pdp 네 라우트만 빠져 있었다"고 적으며 **다섯째를 못 셌다.**

### C-3. [중간] key-visual 만 모델과 무관하게 고정 1장

`key-visual/route.ts:27`·`:36` — `reserveAiUsage(req,"pdp_image",1)` / `settleAiUsage(…,1,…)`.
다른 라우트는 전부 `imageCreditUnits(model, 1)` 을 쓴다. 수치는 §6-1.

### C-4. [중간] 글 모델 값이 장부에서 $0 으로 사라지는 경로가 둘 남았다

- `plan-from-text/route.ts:43` — `finalizeAiUsage(reservation, true, 0)` 에 **cost 인자가 없다**
  → `lib/membership/api.ts:199` 의 `if (cost)` 가 거짓 → `model`·`llm_usd` 가 빈 채 남는다.
- `style-references/route.ts:55` — 업로드마다 비전 호출(`lib/user-style-references.ts:99`), 장부 행 자체가 없다.

`analyze/route.ts:52` 가 "분석만 반복하는 사용이 원가 집계에서 $0 으로 보였다"며 고친 것과 같은 종류다.

### C-5. [중간] 실패 경로의 finalize 가 던지면 오류 코드가 통째로 사라진다

`analyze:70·77`, `images:134`, `key-visual:43`, `plan-from-text:70·73` — 전부 던지는 쪽이다.
여기서 던지면 400/429 로 나갔어야 할 응답이 본문 없는 500 이 되고, `apiJson`(`pdp-utils.ts:47`)이
다시 던져 화면에는 "서버와 통신하지 못했습니다"만 남는다. 원인이 사용자에게도 로그에도 안 남는다.
덧붙여 analyze 는 첫 호출만 실패하면 `error_code` 가 실제 코드가 아니라 `"invalid_request"` 로 적힌다.

### C-6. [중간] batch 는 전부 실패해도 200 + `ok:true`

`batch/route.ts:238`, `PdpEditor.tsx:1587`
fal 키가 잘못된 상태에서 12장을 일괄 생성하면, 첫 묶음 6장이 전부 실패해도 멈추지 않고
둘째 묶음을 또 보낸다.

### C-7. [중간] `style-references` 에는 용량·횟수·예약이 전혀 없다

막는 층이 **하나도 없다**: Caddy(`deploy/ec2/Caddyfile.template:23` 에 `request_body` 없음),
Next(`bodySizeLimit` 없음), 라우트(`:43` 의 `req.json()` 이 본문을 통째로 읽고 `:51` 은 빈 값만 막음).

저장소에는 이미 `MAX_UPLOAD_BYTES = 20MB` 예산이 있는데(`pdp.upload-budget.ts:15`),
쓰는 곳은 클라이언트 두 곳뿐이다. 같은 파일 머리말에 "운영 RAM 911MB·여유 445MB·Caddy 본문
제한 없음"이 적혀 있다.

한 요청에 메모리로 겹쳐 올라가는 것: base64 원문 N + replace 사본 + Buffer(0.75N) +
sharp 전체 디코드(1080×15000 이면 raw 약 65MB) + Buffer 한 번 더 + 썸네일.
파일은 `references` 버킷에 무제한 누적되고, 목록은 `.limit(200)` 이라 200건을 넘으면
화면에서 안 보이는데 스토리지는 계속 먹는다.

### C-8. [중간] 단건 이미지 라우트만 섹션 모양 검증이 없다

`images/route.ts:69`·`:75`·`:103` (batch 는 `:94` 에 있다)
`section` 없이 POST 하면 크레딧을 예약한 뒤 `buildSectionImageOptions` 에서 TypeError → 500.

### C-9. [낮음] 실패한 분석도 시간당 한도를 먹는다

`analyze/route.ts:23`(예약이 본문 파싱보다 먼저) → `:77`(실패로 확정),
한도 계산(`…team_credit.sql:208`)은 상태를 안 보고 1시간 안의 `pdp_analyze` 행을 센다.
빼는 것은 `reservation_expired` 뿐이고 한도는 기본 10이다.

→ 깨진 JSON 10번이면 그 계정의 분석·텍스트 기획이 **최대 1시간 429**.
공급자 장애로 10번 실패한 정상 사용자도 똑같이 막힌다. (비로그인 공격은 불가, 크레딧은 0장)

### C-10. [낮음] 그 밖

| 항목 | 위치 |
|---|---|
| 근거 게이트가 `prompt_en` 없는 섹션에서 TypeError(두 라우트 모두 `try` 밖) — 화면 경로에선 재현 안 됨 | `lib/evidence-gate.ts:30` |
| batch 가 상한 초과분을 조용히 버리고 잘린 뒤 개수를 `requested` 로 보고 | `batch/route.ts:80`·`:241` |
| `style-references` 상태코드 셋이 틀림(없는 id DELETE 는 `ok:true`, uuid 아닌 id 는 500, 본문 없으면 500) | `lib/user-style-references.ts:312` |

**확인**: 화면이 batch 상한을 초과해 보낼 수는 **없다.** 화면(`PdpEditor.tsx:1528` `chunkForModel`)과
서버(`batch/route.ts:80`)가 같은 `maxBatchSizeFor` 를 쓰고 상한표도 한 벌뿐이다.

---

## 5. 영역 D — 코어 (`packages/pdp-core`)

### 5-0. 동작 요약

**`analyzeProduct`** (`pdp.service.ts:215`) — 최대 5회 LLM 호출:
① 입력 손질 → ② 인물 프로필 추출(인물 사진이 있을 때) → ③ 프롬프트 조립(`buildAnalyzePrompt:1036`)
→ ④ 구성안 생성 → ⑤ 심사(7개 기준) → ⑥ `fail` 이 있으면 재작성(2회) → ⑦ 첫 이미지
(**운영에서는 안 돈다** — 라우트가 `skipFirstImage: true`).

**`generateSectionImage`** (`:452`) — 첨부 순서가 곧 프롬프트 번호다:
`anchor`(제품) → `person`(업로드 또는 캐릭터 각도) → `style`(레퍼런스 조각).
프롬프트는 6조각을 잇고, **사용자가 친 말을 앞뒤 두 번** 넣는다(`:669`, 2026-09-04 실측 근거).
재시도 상한은 `QA 켜짐 ? 2 : (인물참조 있으면 3 : 1)`.

### D-1. [높음] 참조가 모델 상한을 넘으면 디자인 레퍼런스가 통째로 사라진다

역할 지시문은 **자르기 전** 배열로 번호를 매기는데(`pdp.service.ts:675`),
fal 로 보낼 때 `withinLimit` 이 **앞쪽만** 남긴다(`pdp.image-provider.ts:33`).
잘리는 것은 항상 맨 뒤 = 디자인 레퍼런스다.

실측(tsx 직접 호출):
```
총 references = 11  (제품 1 + 캐릭터 각도 6 + 레퍼런스 조각 4)
[Image 8~11 — DESIGN REFERENCE]
nano-banana         → 실제로 간 장수 7    ← 레퍼런스 4장 전부 증발
nano-banana-pro     → 11
gpt-image-2.5-flare → 11
```

**증상**: 「경제형」 사용자가 레퍼런스를 붙이면 한 장도 안 나가는데, 프롬프트는 여전히
"Image 8~11 은 디자인 레퍼런스다, 그 레이아웃을 흉내 내라"고 말한다.
기본 각도만 켜도(정면+3) 1+4+4=9 라 조각 2장이 사라진다.

**대조**: 포스터(`poster-core/generate.ts:129`)는 같은 상황에서
"빼거나 다른 모델을 고르세요"라고 **거절한다.** 상세페이지만 조용히 버린다.

### D-2. [높음] 인물컷을 켜도 시스템 프롬프트가 "People are optional" 이라고 말한다

`pdp.image-prompt.ts:176` — 분기 없이 하드코딩
```
People are optional. Only include a person when the scene genuinely calls for one; …
```
`:147` 의 JSON 은 `withModel` 이면 `required — … must appear.` 를 넣는다.
GPT 계열은 이 문장이 JSON 앞에 붙어 나간다. 인물 참조를 붙이고 인물컷을 켜도
사람이 없는 장면이 나올 수 있다.

### D-3. [높음] analyze 라우트의 자동 재시도가 한 번도 안 돈다

`analyze/route.ts:13`
```ts
return String(code) === "INVALID_REQUEST" && /prompt_en|no sections|section/i.test(detail ?? "");
```
그런데 실제로 던지는 코드는 `AI_RESPONSE_INVALID` 다(`pdp.service.ts:401`).
→ 구성안에 섹션이 없으면 재시도(2회) 없이 바로 실패한다.
`plan-from-text` 의 같은 가드는 `pdp.text-plan.ts:409` 가 `INVALID_REQUEST` 를 던져 정상 동작한다.

### D-4. [중간·운영 미확인] 프롬프트 전문이 브라우저 번들로 나간다

`pdp-core/src/index.ts:14` 가 `PdpService`·`buildAnalyzePrompt` 를 **값으로** 재export 하고,
`"use client"` 컴포넌트들이 같은 배럴에서 값을 가져간다(`PdpEditor.tsx:44` 등).
`pdp-core/package.json` 에 `sideEffects` 선언이 없다.

**dev 번들에서는 실제로 검출했다** — `apps/web/.next/static/chunks/app/create/page.js` 에서
`korean_ecommerce_detail_page_section`, `productReading 을 먼저 채운다`, `strict QA reviewer`,
`You are a world-class art director`, `심사에서 아래가 지적됐다` 가 각 1건.
**운영 번들은 확인하지 못했다**(BUILD_ID 없음). 트리셰이킹이 막힌다는 부분은 추론이다.
→ **운영 빌드를 한 번 돌려 확인해야 한다.**

### D-5. [중간] 잘린 JSON 하나에 서버가 수 초 멈춘다

`pdp.service.ts:1745` — `extractJsonCandidate` 가 O(n²).
같은 알고리즘으로 재 보니 24KB 에 1.3초였고, 구성안 크기(40~60KB)면 5~8초로 **추정**된다.

### D-6. [중간] `retryOperation` 의 JSON 재시도가 절대 안 걸린다

`pdp.service.ts:1852`·`:1907` 이 `message` 에서 `"JSON"` 을 찾는데,
우리 오류 문구는 한국어다 — `"AI 응답을 해석하지 못했습니다."`(`:1468`).
모델이 JSON 을 한 번만 틀려도 재시도 없이 실패한다.

### D-7. [중간] 구성안 호출만 토큰 상한을 안 올린다

`pdp.service.ts:207`·`:297`, `lib/pdp/providers.ts:21` — 8192 고정, 스키마 `required` 도 없다.
섹션 6개 한/영 응답이 잘리면 "AI 응답을 해석하지 못했습니다" 또는 섹션 0개가 된다.
**실제로 8192 를 넘는지는 미확인.**

### D-8. [중간] 경계 검증이 `look` 에만 있다

`pdp.service.ts:1544`, `pdp.image-prompt.ts:85`
`modelCountry:"mars"` 면 400 이 아니라 TypeError 로 500 이 나고, `modelAgeRange` 가 모르는 값이면
프롬프트에 `"Korean woman undefined"` 가 들어간다(tsx 실측).
화면은 정해진 값만 보내니 외부 요청이나 옛 초안에서만 생긴다.

### D-9. [중간] 단건·일괄이 이미지 모델을 다르게 고른다

`images/route.ts:74`(`options.imageModel` 도 봄) vs `batch/route.ts:76`(`page` 만 봄),
`pdp.image-options.ts:118` 이 page 값으로 덮어쓴다.
지금은 화면이 늘 page 단위로 보내 안 드러나지만, 섹션별 모델이 붙는 순간 두 경로의 모델과 금액이 갈린다.

### D-10. [중간] 안 나가는 옛 프롬프트 조립기 약 345줄

`pdp.service.ts:1225-1461`, `:1563-1622`, `:1820-1844`, `:1940-1960`
사용자 영향은 없다. 다만 `"must be Korean … whether or not a reference model was supplied"` 같은
죽은 지시가 읽는 사람을 헷갈리게 하고, **`pdp.service.test.ts` 가 이 죽은 함수를 시험하고 있다.**

### D-11. [낮음] 그 밖

| 항목 | 위치 |
|---|---|
| QA 를 못 돌린 결과와 통과한 결과를 구분할 수 없다(`passed:true` 로 나가고 `parseError` 가 안 남는다) | `pdp.qa.ts:189` |
| 빈 심사 결과가 만점과 같아 보인다(`items:[]` 면 재작성이 안 걸리고 0/0/0 으로 뜬다) | `pdp.review.ts:175` |
| 죽은 히어로 블록에 "20대 한국 여성"이 하드코딩(다시 켜면 레퍼런스·look·지시가 안 들어간다) | `pdp.service.ts:414` |
| `types.ts:370` 주석이 실제와 반대("description 을 프롬프트에 안 싣는다" ↔ 실제로 싣는다) | `pdp.service.ts:632` |
| `PdpGenerateImageSuccessResponse` 에 `generatedImages` 없음, 심사 기준 "여섯 가지"인데 실제 7개 | `types.ts:579`, `pdp.review.ts:24` |

**과거 기록 대조**: `style_guide` 이중 정의, `generateKeyVisual` 의 모델 유실,
레퍼런스 크기 체인은 **현재 코드에서 고쳐져 있다.** 옛 조립기는 그대로다.

---

## 6. 영역 E — 저장·크레딧

### 6-0. 저장 경로는 둘이고 담는 것이 다르다

**(A) 브라우저 초안** — IndexedDB `hanirum-pdp-maker` / store `drafts` / version 2
- 수동 저장 + **30초 자동 저장**(`isDirty` 일 때만) + 이탈 시 `window.confirm`
- `editorState` 에 섹션 본문·`sectionKeys`·섹션옵션·레이어·워크벤치 위치가 들어간다
- 섹션 이미지는 `generatedImage` 안에 **data URL 통째로**
- 보관 30일, 목록을 읽을 때 청소(실패해도 조용히 넘어감)

**(B) 서버 라이브러리** — Supabase `library_items` + `library_images` + 버킷 `library`
- 자동 아님, 「라이브러리에 저장」 버튼만
- **원본 사진·레이어·초안 설정은 안 담긴다**
- **이어서 편집이 불가능하다**(`library/page.tsx:151` `editable:false`) — 의도된 설계

### 6-1. [중간·실측] 대표 이미지만 모델과 무관하게 1 크레딧

`imageCreditUnits` 를 직접 돌린 결과:

| 모델 | 섹션 이미지 1장 | 대표 이미지 1장 |
|---|---|---|
| gpt-image-2.5-flare | **5** | 1 |
| gpt-image-2 | **5** | 1 |
| nano-banana-pro / -2 | **3** | 1 |
| seedream-5-pro / qwen-image-2-pro | **2** | 1 |
| nano-banana | 1 | 1 |

`key-visual/route.ts:18` 주석은 "섹션 이미지와 동일하게 1 크레딧"이라고 적혀 있는데,
그 전제가 2026-09-08 「장을 실제 단가에 붙인다」로 바뀌면서 깨졌고 이 라우트만 안 따라왔다.
**손해는 회사 쪽이다**(사용자는 덜 낸다). 원가 기록은 정상이라 장부와 차감이 어긋난다.

### 6-2. 정상 동작 확인

- 실패는 0장 확정이라 **환불 누락은 없다**(예약이 풀린다).
- `x-idempotency-key` 가 `billableFetch`(`lib/billable-fetch.ts:16`)에서 자동으로 붙는다.

### 6-3. 미조사로 남은 것

저장 영역 조사가 **사용량 한도로 중단**되어 아래는 확인하지 못했다.

- 섹션 이미지를 data URL 로 담는 초안의 **실제 용량**과 IndexedDB 할당량 초과 시 동작
  (조용히 실패하는지, 30초 자동 저장이 그때 어떻게 도는지)
- **30일 만료 청소가 예고 없이 지우는지**, 화면에 남은 날짜가 표시되는지
- `normalizeDraftRecord` 도 세 칸을 빠뜨리므로, 저장만 고치면 되는지 읽는 쪽도 함께 고쳐야 하는지
  (→ A-1 을 고칠 때 **양쪽 다** 봐야 한다)

---

## 7. 영역 F — 리디자인 (`redesign-core`, `app/redesign`, `api/redesign`)

### 7-0. 흐름 요약

업로드(이미지/PDF) → 옵션(모델·채널·인물·장수·비율·결) → 생성:
파일 정규화(PDF 앞 4쪽 PNG, 세로 긴 이미지 4조각, 전체 앞 4장) → **전사**(최대 40스트립,
8장·10M자 단위 배치) → `POST /api/redesign/generate` → 결과는 IndexedDB 수동 저장 +
`POST /api/library` 자동 업로드(**실패는 조용히 삼킴**).

섹션 구성은 `S1 히어로`~`S10 최종 CTA` **고정 템플릿**이다(새로 만들기는 LLM 이 설계).

### 7-1. 새로 만들기와 겹치는 것 (두 코어가 같은 일을 따로 한다)

| 겹치는 일 | 리디자인 | 새로 만들기 |
|---|---|---|
| 분석 프롬프트 | `generate.ts:533` `buildAnalyzePrompt` | `pdp.service.ts:1036` **같은 이름, 다른 구현** |
| 첨부 역할 지시 | `generate.ts:238` | `pdp.reference-policy.ts:132` (리디자인 주석이 "본보기는 저쪽"이라 적음) |
| fal 호출 | `lib/redesign/image-generator.ts:88` | `pdp.image-provider.ts:167` |
| 업로드 예산 | **없음** | `pdp.upload-budget.ts` |
| 검수(QA·리뷰 루프) | **없음** | `pdp.qa.ts`·`pdp.review.ts` |
| 근거 관리 | `verified_facts` 문자열 배열 | `pdp.evidence.ts`·`pdp.claim-policy.ts` |
| 라우트 테스트 | **0건** | 3건 |

제대로 공유된 것은 **캐릭터 하나**다(`resolveCharacterAngles`).

### 7-2. [높음] 확정이 던지면 성공한 결과가 500 으로 뒤집힌다

`api/redesign/generate/route.ts:115`, `edit-section/route.ts:26` — 옛 방식(`finalizeAiUsage`)이 남았다.
pdp·ad·sns 는 이미 `settleAiUsage` 로 고쳤고, `finalize-safety.test.ts` 는 pdp 만 검사한다.
fal 이 그림을 돌려줬는데 RPC 가 실패하면 사용자는 "생성 실패"를 보고 다시 눌러 값을 또 쓴다.

### 7-3. [높음] 분석 실패를 삼키고 빈 분석으로 계속 그리며 전액 차감한다

`redesign-core/generate.ts:594` — 실패 메시지가 담기는 `diagnostic_summary` 는
**화면 어디에도 표시되지 않는다**(`redesign-results.tsx:76` 은 `verified_facts` 만 읽음).
키가 만료됐거나 429 여도 "8장 완료"로 보이고, 원본의 색·수치가 반영되지 않은 그림에 32장이 나간다.
서버 로그도 없다.

### 7-4. [높음] 「속도형(google)」을 골라도 fal 의 gpt-image-2.5 가 그린다

`redesign-core/generate.ts:420` — `input.generateImage` 주입이 provider 분기보다 **먼저** 걸린다.
`api/redesign/generate/route.ts:32` 에서 provider 는 **단가 결정에만** 쓰인다.
결과 기록에는 `gemini-3.1-flash-image-preview` 로 남지만 실제로 그린 것은 다른 모델이고,
차감은 속도형 단가($0.13)인데 실제 원가는 $0.165 다.

### 7-5. [높음] 섹션 수정이 `quality:"low"` 로 그리면서 max 가격을 물린다

`redesign-core/edit-section.ts:114` — `form.append("quality", "low")`, 모델은 gpt-image-2 직접 호출.
`redesign-quality.test.ts` 는 `generate.ts` 만 읽어 이 파일을 못 본다.
원본보다 글자가 뭉개진 그림이 돌아온다.

### 7-6. [높음·실측] 섹션 수정이 4장 예약하고 1장 차감한다

`edit-section/route.ts:18`(예약) vs `:26`(차감). 실측:

| provider | 1장 예약 | 확정 | 8장 한 번에 | 1장씩 8번 |
|---|---|---|---|---|
| redesign-openai | **4장** | **1장** | 27장 | **32장** |
| redesign-google | **3장** | **1장** | 21장 | **24장** |

### 7-7. [중간] 8장 생성을 1장짜리 8번으로 쪼갠다

`redesign-wizard.tsx:189` — 원본 분석이 8번 돌고, 올림이 8번 붙어 **27장이 아니라 32장**이 나간다.
서버의 "미시도 섹션 기록"(`generate.ts:459`)은 이 화면에서 한 번도 실행되지 않는다.

### 7-8. [중간] 실패한 섹션이 어디에도 안 보인다

`redesign-wizard.tsx:334`·`:365` — 서버가 만드는 `failedSections`(실패·미시도와 사유)를
화면이 한 번도 읽지 않고, `warning` 은 2.8초 토스트로만 지나간다.
요약에는 "확인 필요 1 · 미시도 5"만 뜨고 어느 섹션이 왜 실패했는지는 없다.

### 7-9. [중간] 전사 라우트에 예약·사용량 기록·한도가 전부 없다

`api/redesign/transcribe-strips/route.ts:8` — 크레딧 예약도, `withLlmMeter` 도, 시간당 제한도 없이
`gpt-5.5` 또는 `gemini-3.1-pro` 에 최대 40장을 보낸다. 생성→취소를 반복하면 장부에 0원으로 남는다.

### 7-10. [중간·낮음] 그 밖

| 항목 | 위치 |
|---|---|
| 생성 실패 경로에서 이미 나간 분석 LLM 비용(`llmUsd`)을 장부에 안 남긴다(pdp 는 남김) | `api/redesign/generate/route.ts:126` |
| 업로드 용량 상한이 없고 인증·예약보다 multipart 파싱이 먼저다(비로그인도 본문 전체를 메모리로 읽음) | `api/redesign/generate/route.ts:23` → `:50` |

---

## 8. 고칠 순서 (권장)

1. **A-1 · A-2** — 사용자가 만든 것을 잃는 유일한 부류다. A-1 은 저장·복원 **양쪽** 을 고쳐야 한다(§6-3).
2. **C-1 · C-2 · 7-2** — 한 줄씩이면 끝나고, 막히면 서비스가 멎는다.
   (`try` 로 감싸기 / `settleAiUsage` 로 바꾸기 / `finalize-safety.test.ts` 대상 넓히기)
3. **D-1 · 7-4** — 돈을 쓰고 엉뚱한 결과를 받는다. D-1 은 포스터처럼 **거절**하는 쪽이 맞다.
4. **B-2 · B-3 · B-4** — 결과물 품질의 핵심. B-4 는 이름 한 줄이면 끝난다.
5. **6-1 · 7-5 · 7-6 · 7-7** — 과금 불일치. 수치는 위에 실측해 두었다.
6. 나머지 중간·낮음.

## 9. 함께 고쳐야 할 검사 구멍

고치기만 하면 같은 일이 또 난다. 검사도 함께 손대야 한다.

| 구멍 | 고칠 곳 |
|---|---|
| 초안 검사가 `buildDraftInput` 에서 멈춘다 | IndexedDB **왕복**을 재는 시험 추가(실제로 그렇게 잡았다) |
| `finalize-safety.test.ts` 가 네 라우트만 본다 | pdp 5개 + redesign 2개로 넓힌다 |
| `redesign-quality.test.ts` 가 `generate.ts` 만 읽는다 | `edit-section.ts` 도 읽는다 |
| `api/redesign` 라우트 테스트 0건 | 7-2·7-6·7-10 은 지금 어떤 시험에도 안 걸린다 |
| `pdp.service.test.ts` 가 죽은 조립기를 시험한다 | D-10 정리와 함께 |

## 10. 문서 어긋남

`docs/overview/README.md` 가 "분석 `gemini-3.1-pro-preview`, 이미지 Nano Banana Pro" 로 적혀 있으나
실제는 **Claude Sonnet 5 → OpenAI 폴백**(`lib/pdp/providers.ts:20`)이고, 그림은 fal 경유 7개 모델이다.
같은 문서의 "2K 고해상도" 도 내보내기 단계에서 최대 920px 로 떨어진다(B-2).

---

## 부록. 조사 방법

6개 영역을 나눠 조사했다: 화면 흐름 / 편집기·갤러리 / API 라우트 / 코어 / 저장·크레딧 / 리디자인.
저장·크레딧은 사용량 한도로 중간에 멈춰 §6-3 이 남았다.

**실행으로 확증한 것**
- `fake-indexeddb` 로 `savePdpDraft` → `getPdpDraft` 왕복(A-1) — 임시 시험 파일은 삭제했다
- `imageCreditUnits` 를 tsx 로 직접 호출해 모델별 장수 산출(6-1, 7-6)
- `pdp-core` 617건 · web 149건 · redesign 135건 시험 실행, `tsc --noEmit` 양쪽 0건
- dev 번들 grep 으로 프롬프트 문자열 검출(D-4)

**코드는 한 줄도 고치지 않았다.**
