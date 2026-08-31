# AI 상세페이지 스튜디오 — UI/UX 전면 개선 설계

기준일: 2026-07-21
대상: `apps/web` 전 화면 + `packages/ui`
**절대 불변: `packages/pdp-core`, `packages/redesign-core` (원본 보존 대상)**

---

## 1. 왜 지금 이걸 하는가

운영자 평가: **"UI/UX가 너무 마음에 안 든다."**

실측으로 원인을 확인했다. 미감의 문제가 아니라 **구조의 문제**다.

> 이 앱은 하나의 제품이 아니라 **공통 헤더를 쓴 세 개의 서로 다른 앱**이다.

| | `/` `/library` `/settings` | `/create` | `/redesign` |
| --- | --- | --- | --- |
| UI 줄수 | 380 | **7,367** | **2,237** |
| 스타일 방식 | 디자인 토큰 100% | **CSS 모듈 2,922줄** | Tailwind + 원색 |
| 브랜드 초록 | `#157f6e` (토큰) | `#14736c` (하드코딩) | `emerald-500` `#10b981` |
| 공통 컴포넌트 | 사용 | **0개 사용** | 일부 |
| 자체 내비게이션 | — | 자체 헤더 | **자체 248px 사이드바** |
| 제품 이름 | "AI 상세페이지 스튜디오" | "상세페이지 마법사 **2.0**" | "리디자인 마법사 **1.0**" + "HR" 로고 |

**한 제품에 이름이 4개, 초록이 3개, 내비게이션이 3개다.**

### 다크모드가 깨지는 정확한 이유 (실측)

`create-theme.css`는 옛 변수명을 전역 토큰에 잇는 **어댑터**인데, **한쪽만 연결돼 있다.**

```
--ink    36곳 사용  → var(--foreground)      [글자]
--muted  32곳 사용  → var(--muted-foreground)[글자]
--navy   18곳 사용  → var(--foreground)      [글자]
--teal   14곳 사용  → var(--primary)         [글자]
────────────────────────────────────────────
--bg          0곳   ← [배경] 아무도 안 씀
--panel       0곳   ← [배경]
--line        0곳   ← [테두리]
--shadow      0곳
```

`pdp-maker.module.css`에서:
- `color:` 선언 중 **100개가 토큰 사용**
- `background:` 선언 중 **토큰 사용은 4개, 색을 직접 박은 것이 92개** (그중 36개가 흰색)

→ 다크모드로 바꾸면 **글자만 흰색이 되고 카드는 흰색으로 남는다.** 읽을 수 없다.

부수 확인: `--teal-deep`(5곳), `--ink-soft`(1곳)는 **정의된 적 없는 변수**를 참조한다. 이미 깨져 있다.

### 그 밖의 구조 문제

- **`<main>` 중첩** — AppShell의 `<main>` 안에 `/create`와 `/redesign`이 각자 `<main>`을 또 연다
- **폭 충돌** — 모듈 CSS는 `1540px`를 가정하는데 AppShell이 `max-w-6xl`(1152px)로 조인다. `/create`는 상시 25% 눌려 있다
- **sticky 이중** — `/redesign`의 `h-screen` 사이드바가 이미 sticky인 헤더 아래에 또 sticky로 들어간다
- 빈 상태 5번, 진행바 3번, 파일 드롭존 2번 각자 구현
- `window.confirm` 2곳 (확인 다이얼로그 컴포넌트가 없어서)

---

## 2. 디자인 방향

### 근거 — 두 출처가 같은 곳을 가리킨다

**① 운영자가 제공한 참고 스크린샷 (Lumio)**
크림 배경 · 코랄 강조 · **좌측 단계 사이드바** · **하단 고정 액션바**(좌측 진행 칩 + 우측 CTA) · 다열 카드 그리드

**② 운영자 저장소 `junginsu-make/open-design`의 `design-systems/claude/DESIGN.md`**

```
Parchment    #f5f4ed   페이지 배경
Ivory        #faf9f5   카드 표면
Near Black   #141413   본문
Terracotta   #c96442   기본 CTA (화면당 하나)
Olive Gray   #5e5d59   보조 텍스트
Stone Gray   #87867f   메타
Border Cream #f0eee6 / Border Warm #e8e6dc
Dark Surface #30302e
```

**두 팔레트가 사실상 같다.** 참고 화면의 톤이 이 디자인 시스템으로 그대로 표현된다. 추측이 아니라 운영자의 두 자산이 수렴한 결과다.

### 채택할 원칙

`open-design`의 `warm-editorial`이 제시하는 제약을 규칙으로 삼는다. 이건 취향이 아니라 **린트 규칙처럼 검사 가능**하다.

1. **화면당 강조 요소는 하나** — CTA가 여럿이면 아무것도 강조되지 않는다
2. **순수 검정·순수 흰색 금지** — 크림/아이보리/니어블랙
3. **라운드는 8~24px 범위** — 그 밖은 금지
4. **그림자 대신 링** — `box-shadow: 0 0 0 1px <warm-gray>`. 떠 있는 느낌이 필요한 곳만 `0 4px 24px rgba(0,0,0,.05)`
5. **그라디언트 금지** (현재 30곳 사용 중)

### 정보 구조 — 단계형 파이프라인

현재 `/create`는 **한 페이지에 전부 쌓아 스크롤**하는 구조다. 참고 화면처럼 **단계를 좌측에 고정**한다.

```
┌──────────┬────────────────────────────────────────┐
│ 01 업로드 │  [메인 작업 영역]                        │
│ 02 분석   │                                        │
│ 03 생성   │                                        │
│ 04 편집   │                                        │
│ ─────    │                                        │
│ 라이브러리 │                                        │
│ 설정      │                                        │
├──────────┴────────────────────────────────────────┤
│  ● 3/4 단계 완료          [← 이전]  [다음 →]        │  ← 하단 고정
└───────────────────────────────────────────────────┘
```

`/redesign`도 같은 골격을 쓴다. **두 도구가 처음으로 같은 제품처럼 보이게 된다.**

---

## 3. 토큰 체계 (`packages/ui`)

현재 토큰은 shadcn 표준 18개 + `--radius` 1개 + `--font-sans` 1개가 전부다.
**타입 스케일·간격 스케일·그림자 토큰이 없어서** 각 페이지가 알아서 하드코딩하고 있다.

### 추가할 것

```css
/* 색 — claude/DESIGN.md 기반, 라이트/다크 양쪽 정의 */
--background   #f5f4ed   /* Parchment */
--card         #faf9f5   /* Ivory */
--foreground   #141413
--primary      #c96442   /* Terracotta */
--muted-foreground #5e5d59
--border       #e8e6dc

/* 타입 스케일 — 현재 없음 */
--text-display / -h1 / -h2 / -h3 / -body / -sm / -xs
  각각 size · weight · line-height · letter-spacing

/* 간격 스케일 — 현재 없음 */
--space-1 … --space-12

/* 고도(elevation) — 현재 없음. 링 방식 */
--ring-1     0 0 0 1px var(--border)
--elevate    0 4px 24px rgba(0,0,0,.05)

/* 상태색 — 현재 destructive 뿐. Badge가 emerald 를 하드코딩 중 */
--success --warning --info
```

> ⚠️ 현재 토큰 값이 **HSL이 아니라 hex**다. shadcn 관례와 달라 `bg-primary/90` 같은 알파 변형이 일부 상황에서 의도대로 안 먹는다. 이번에 **HSL로 정규화**한다.

### 추가할 공통 컴포넌트

각 페이지가 손으로 만들고 있는 것들. 만들면 중복이 사라진다.

| 컴포넌트 | 현재 상태 |
| --- | --- |
| `Dropzone` | **2번 따로 구현** (`/create`, `/redesign`) |
| `Progress` | **3번 따로 구현** |
| `EmptyState` | **5번 따로 구현** |
| `ConfirmDialog` | 없어서 `window.confirm` 2곳 |
| `StepSidebar` / `StepBar` | 신규 (§2 구조) |
| `Select` `Slider` `ColorPicker` `Segmented` | 손으로 구현 중 |

---

## 4. 화면별 계획

### `/`, `/library`, `/settings` — **거의 그대로 (677줄, 95% 재사용)**

하드코딩 색 **0개**, 토큰 준수 **100%**. 이미 잘 되어 있다.
**이 세 화면이 기준선(reference implementation)이고, 나머지를 여기에 맞춘다.** 새 컴포넌트가 생기면 그것만 반영한다.

### `/redesign` — **가성비 최고 (2,237줄)**

이미 Tailwind이고 공통 컴포넌트를 14개 쓰고 있다. 문제는 **표면색만 원색**이라는 것.

```
bg-white / bg-white/xx   26곳   ← 토큰으로 교체
bg-card                   0곳
emerald-*                24곳   ← primary 토큰으로
dark: 변형                0곳
```

**약 50개 클래스 치환이 대부분.** 여기서 새 토큰을 실제 화면으로 검증한다.

재작성이 필요한 곳은 3개뿐:
- `SectionResultCard`(136줄) — 캐러셀+다운로드+편집폼+모델선택이 한 덩어리
- `GenerationProgressPanel` — 다크모드 최악 지점(`bg-white/55` 위에 `bg-white/95`)
- 죽은 코드 제거 (`makeProject`, `baseSections`, `loadProjects` 스텁)

### `/create` — **가장 큼 (7,367줄). CSS 모듈은 포팅하지 않고 폐기**

CSS 모듈 2,922줄을 토큰 기반으로 고치려면 `background`·`border`·`box-shadow` **213개 선언을 전부 재작성**해야 하고, 그러고도 아무도 유지보수 못 하는 2,900줄짜리 전용 스타일시트가 남는다.

**결론: 뷰 레이어를 Tailwind + 공통 컴포넌트로 다시 짓고, `pdp-maker.module.css`와 `create-theme.css`를 함께 폐기한다.**

| 구분 | 규모 | 내용 |
| --- | --- | --- |
| **그대로 재사용** | ~1,375줄 (19%) | `pdp-drafts.ts` 전체 · `pdp-utils.ts` 전체 · **`PdpEditor.tsx:1954-2802`의 849줄 순수 로직**(색 연산·레이어 정규화·텍스트 측정·팔레트 추출·내보내기·한글 섹션명). 스타일 결합 0 → `pdp-canvas-utils.ts`로 그대로 이동 |
| **다시 칠하기** | ~1,200줄 (16%) | 업로드·안내·초안목록·처리중·컨트롤·에러·헤더·섹션레일 |
| **다시 짓기** | ~1,700줄 (23%) | 떠다니는 워크벤치 · 색 팔레트 필드 · 레이어 탭(278줄 3중 삼항) · 캔버스 블록 · `window.confirm` 2곳 · 22개 `useState` → reducer |
| **CSS 모듈** | 2,922줄 (40%) | **폐기** |

---

## 5. 절대 건드리면 안 되는 것

여기를 건드리면 **사용자 데이터가 유실되거나 내려받는 파일이 바뀐다.**

### 저장소 이름 — 바꾸면 기존 작업이 사라진다

```
IndexedDB  "hanirum-pdp-maker"           (v2, store "drafts")
IndexedDB  "hanirum-redesign-projects"   (v1, store "projects")
localStorage "hanirum-knowledge-items"
localStorage "hanirum-use-shared-knowledge"
localStorage "detail-page-studio-settings-v1"
```

이름에 `hanirum`이 남아 **보기 싫더라도 그대로 둔다.** 설계 문서에도 의도적 동결로 적혀 있다.

### API 요청·응답 형태

`/create` 3개(`validate-key`, `analyze`, `images`), `/redesign` 6개(`generate`, `edit-section`, `config`, `knowledge`×2, `client-log`).

> ⚠️ `originalImageBase64`는 이름과 달리 **data: URL 전체**를 담는다. 백엔드가 그렇게 받고 있다. "고치지" 말 것.

### 렌더링 계약

`buildOverlayShellStyle` / `buildOverlayBackgroundStyle` / `buildOverlayTextStyle` / `buildShapeLayerStyle` 4종은
**화면 표시와 `buildExportNode`(html2canvas 내보내기)가 함께 쓴다.**
**보기 좋게 고치면 사용자가 내려받는 결과물이 바뀐다.** `zIndex` 계산도 마찬가지(레이어 쌓임 모델).

### 코드 함정

- `PdpEditor.tsx:325-333` — 훅 이후·함수 선언 이전에 early return. **325줄 아래에 훅 추가 금지**
- `PdpEditor.tsx:251-262` — `onDraftStateChange`가 자기 의존성 배열에 있음. 부모가 안정된 setter를 넘겨서만 동작. 인라인 람다로 감싸면 **무한 루프**
- `react-rnd`는 장식이 아니라 **구조**(캔버스 레이어 드래그·리사이즈)
- `pdfjs-dist` 워커가 **unpkg CDN 고정**

---

## 6. 순서

각 단계가 끝날 때마다 **빌드·타입체크·화면 확인**을 하고 넘어간다.

| 단계 | 내용 | 위험 |
| --- | --- | --- |
| **0** | **미커밋 3,134줄 커밋** (되돌릴 지점) | — |
| **1** | `packages/ui` 토큰 확장 + 공통 컴포넌트 신설 | 낮음 (추가만) |
| **2** | **`/redesign` 재도색** (~50 클래스 치환) | 낮음 · 새 토큰 실증 |
| **3** | 로직 분리 — `redesign-wizard`의 순수 700줄, `PdpEditor`의 849줄을 `lib/`로 | 없음 (시각 변화 0) |
| **4** | 셸 정리 — `<main>` 중첩 제거, 폭 정책 결정, 자체 내비 3개를 하나로 | 중간 |
| **5** | **`/create` 뷰 레이어 재구축** + CSS 모듈 2개 폐기 | 높음 · 가장 큼 |
| **6** | 떠다니는 워크벤치 (별도 과제) | 높음 · 저장 스키마 관련 |
| **7** | 이름 통일(2.0/1.0/HR 제거) · favicon · 문구 톤 정리 | 낮음 |

**2번을 1번 직후에 두는 이유**: 토큰이 실제 화면에서 맞는지 **가장 싼 값으로 검증**하기 위해서다. 여기서 안 맞으면 `/create`를 다시 짓기 전에 고칠 수 있다.

---

## 7. 규모 추정

| 영역 | 규모 |
| --- | --- |
| `packages/ui` 토큰 + 컴포넌트 9종 | ~900줄 신규 |
| `/redesign` 재도색 | ~250줄 수정 |
| 로직 분리 | ~1,550줄 이동 (신규 0) |
| 셸 정리 | ~200줄 |
| `/create` 재구축 | ~2,400줄 신규 / **2,988줄 삭제** |
| 정리 작업 | ~100줄 |
| **합계** | **약 +3,850 / −3,100** |

---

## 8. 착수 전 확정 필요

### ① 강조색을 무엇으로 할 것인가

참고 화면과 `claude/DESIGN.md`는 **테라코타/코랄**(`#c96442`)이다. 현재 제품은 **초록**(`#157f6e`)이다.

- **A. 테라코타로 전환** — 참고 화면과 일치. 따뜻하고 창작 도구다운 인상. 다만 **브랜드 색이 바뀐다**
- **B. 초록 유지, 나머지만 크림 톤으로** — 브랜드 연속성. 참고 화면 느낌은 절반만

### ② `/create`의 떠다니는 워크벤치를 유지할 것인가

`react-rnd`로 떠다니는 패널이고, **위치·크기가 사용자 초안에 저장**된다(`workbenchState`). 단계형 구조로 가면 이 패널은 어울리지 않는다.

- **A. 고정 패널로 전환** — 구조 일관. 저장된 좌표는 무시(하위호환 유지)
- **B. 유지** — 재작업 최소. 다만 새 구조와 겉돎

### ③ 폭 정책

현재 AppShell `max-w-6xl`(1152px) vs `/create` 설계 폭 1540px.

- **A. 도구 화면은 전체 폭** — 작업 도구답게. 참고 화면도 전체 폭
- **B. 전부 1152px 유지** — 통일감. `/create`는 계속 좁음

---

## 9. 리뷰 포인트

- [ ] §2 방향(크림+코랄, 단계형 사이드바, 하단 액션바)이 원하시는 그림인가
- [ ] §8-① 강조색 A/B
- [ ] §8-② 워크벤치 A/B
- [ ] §8-③ 폭 A/B
- [ ] §4 `/create` CSS 2,922줄 **폐기**에 동의하는가 (포팅 대비 근거는 §4)
- [ ] §5 불변 목록에 빠진 게 있는가
- [ ] §6 순서 중 먼저 보고 싶은 화면이 있는가
