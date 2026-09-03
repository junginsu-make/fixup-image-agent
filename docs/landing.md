# 랜딩페이지

로그인 전에 보이는 공개 첫 화면(`/`) 이야기다. 회원이 보는 화면은
`/library` 이고 그쪽 규칙은 여기 없다.

## 무엇이 어디에 있나

```
apps/web/app/page.tsx          조립. 서버 컴포넌트. ?lang= 을 읽어 사전을 고른다
apps/web/app/_landing/
  landing-content.ts           한/영 카피 사전 + 타이밍 상수. 문구는 전부 여기
  landing.css                  랜딩 전용 스타일. 이 페이지 밖에서는 안 쓴다
  landing-header.tsx           다크 헤더 (로그인 · 가입 신청 · KO/EN)
  hero.tsx / hero-console.tsx  히어로 + 생성 콘솔(움직임)
  gallery.tsx / motion-card.tsx  결과물 갤러리(메이슨리) + 모션 카드
  compare.tsx / reference-compare.tsx  레퍼런스↔결과 비교 슬라이더
  tools.tsx                    도구 6개
  how-it-works.tsx             작동 원리 — 루프 4단계 + 품질 장치 6개
  try-section.tsx / try-it-demo.tsx  직접 해보기 데모
  difference.tsx               차별점 표
  cta-footer.tsx               CTA + 푸터
apps/web/public/landing/       이미지 6 + 영상 1. 전부 이 시스템이 실제로 만든 결과물
```

## 지켜야 하는 것

### 문구는 `landing-content.ts` 에만 둔다

컴포넌트에 한국어를 직접 쓰지 않는다. `KO` 를 단일 출처로 삼고
`export type LandingCopy = typeof KO` 로 `EN` 을 묶어 두었다 — 영문에 키가
빠지면 타입 검사에서 걸린다.

문구의 사실 근거는 저장소 안에 있다. 고칠 때 같이 본다.

- `README.md` — 도구 목록 · 품질 장치 · 모델 가중치
- `docs/service-introduction.md` — 진입 방식 · 회원/과금
- `packages/pdp-core/src/pdp.sales-principles.ts` — 심사 6항목
- `packages/shared/src/attachment-role.ts` — 레퍼런스 역할 4어휘

가격과 월 한도는 확정값이 없어 **의도적으로 비워 두었다.** 채우려면 먼저
`docs/service-introduction.md` §4 를 정하고 온다.

### 다크 섹션 색은 공용 토큰을 쓰지 않는다

히어로 · 작동 원리 · CTA · 헤더는 **라이트 모드에서도 어둡다.** 여기에
`--card` 같은 공용 토큰을 재활용하면 다크모드에서 대비가 뒤집힌다. 그래서
모드와 무관한 `--mcs-*` 를 `landing.css` 의 `.mcs` 스코프 안에만 정의했다.
`packages/ui` 는 건드리지 않는다.

라이트 섹션의 값(`#f5f4ed`, `#B0446A` 등)은 공용 토큰과 같은 값이지만 역시
고정해 두었다. 이유는 같다 — 다크모드에서 뒤집히면 안 된다.

### 폭과 여백

| 것 | 값 |
|---|---|
| 콘텐츠 최대 폭 | `--mcs-max: 1600px` |
| 좌우 패딩 | `--mcs-pad: clamp(20px, 4vw, 56px)` |
| 섹션 상하 여백 | `clamp(76px, 9vh, 140px)` |
| 히어로 높이 | `calc(100svh - 68px)` — 첫 화면만 한 화면을 채운다 |

섹션에 `min-height: 100svh` 를 강제하지 않는다. 내용이 짧은 섹션에 큰 빈
공간이 생긴다. 높이는 내용이 정한다.

### 한국어 줄바꿈

`.mcs` 에 `word-break: keep-all` 이 걸려 있다. 없으면 "시작하세요" 가
"시 / 작하세요" 로 끊긴다.

가로 폭을 `ch` 로 재지 않는다. `ch` 는 숫자 `0` 하나의 폭이라 한글에서는
절반도 안 되는 값이 나오고, 컨테이너가 남는데도 문장이 접힌다.

### 움직이는 것은 네 개뿐

`"use client"` 는 `hero-console` · `reference-compare` · `try-it-demo` ·
`motion-card` 만이다. 나머지 섹션은 서버에서 만든다.

- **생성 콘솔** — 경과 시간을 벽시계(`Date.now`)로 잰다. 90ms 마다 +90 을
  더하는 방식은 탭이 백그라운드로 가면 어긋난다. `prefers-reduced-motion` 이면
  루프를 돌리지 않고 완성 상태로 세운다.
- **비교 슬라이더** — 슬라이더 안쪽 전체가 `pointer-events: none` 이다.
  이미지가 포인터를 먼저 잡으면 브라우저 기본 이미지 드래그가 시작돼서
  손잡이가 따라오지 않는다. 키보드(좌우 화살표 · Shift · Home · End)도 받는다.
- **직접 해보기** — 겹친 이미지를 `opacity` 로 바꾸지 않는다. 활성 이미지
  하나만 그린다. 결과 프레임은 고정 높이 + `contain` 이다. 비율별
  `aspect-ratio` 를 쓰면 9:16 결과에서 우측 칼럼만 길어져 좌측이 크게 빈다.
- **모션 카드** — 영상이 11.4MB 라 화면에 들어올 때 비로소 `src` 를 붙이고
  그 자리에서 `load()` · `play()` 를 부른다. `src` 를 나중에 붙이면 `autoPlay`
  속성만으로는 재생이 시작되지 않는다.

### 언어 전환은 `?lang=`

클라이언트 상태가 아니라 링크다. 페이지 전체가 서버에서 렌더되므로 검색엔진이
두 언어를 다 읽고, 첫 화면이 자바스크립트를 기다리지 않는다. 기본값은 `ko`.

### mp4 는 미들웨어 예외에 있어야 한다

`apps/web/middleware.ts` 의 matcher 에서 정적 파일을 걸러낼 때 `mp4` 가
빠져 있으면 갤러리 영상이 `/login` 으로 307 리다이렉트된다. 재생이 아니라
**파일 자체가 안 온다.** 영상 확장자를 늘릴 일이 있으면 여기도 같이 본다.

## 에셋

`apps/web/public/landing/` 의 7개는 전부 이 시스템이 실제로 만든 결과물이거나
실제로 첨부된 레퍼런스다. 후보정하지 않았다.

| 파일 | 크기 | 쓰임 |
|---|---|---|
| `result-cardnews-lease.png` | 1080×1080 | 히어로 결과 · 갤러리 · 비교 슬라이더 · 데모 1 |
| `result-poster-sports.png` | 1024×1536 | 갤러리 · 데모 2 |
| `result-winter-trend.png` | 1232×2192 | 갤러리 · 데모 3 |
| `result-motion.mp4` | 11.4MB | 갤러리 모션 카드 |
| `ref-lease.png` | 956×955 | 비교 슬라이더 레퍼런스 · 데모 1 썸네일 |
| `ref-sports.png` | 683×1210 | 데모 2 썸네일 |
| `ref-winter.png` | 684×1217 | 데모 3 썸네일 |

**레퍼런스와 결과의 짝은 바꾸지 않는다.** `ref-lease` → 월세 계약 체크리스트,
`ref-sports` → 가을 운동회, `ref-winter` → 윈터 트렌드. 실제로 그 레퍼런스로
그 결과를 만들었기 때문에 짝이 맞는 것이다.

갤러리는 캡션을 달지 않는다. 비율이 제각각인 결과물을 원본 그대로 흘려
배치하고(CSS `columns`) 간격만 최소로 둔다. 설명은 `alt` 로만 남긴다.

## 로그인 · 가입

헤더 우측에 **로그인**(고스트) + **가입 신청**(강조)이 있다. 진입 경로는
기존 규약을 그대로 쓴다 — 1차 CTA `/signup`, 로그인 `/login`.

`LOCAL_AUTH_BYPASS=1` 인 로컬 확인 모드에서는 두 버튼 대신 **스튜디오 열기**
하나가 뜬다. 그 모드에서는 Supabase 공개 환경변수를 비워 두므로 로그인
자체가 불가능하기 때문이다. 이 분기는 `apps/web/lib/dev-auth.ts` 가 정한다.

## 확인할 때

```bash
pnpm dev              # 기본 .env.local — 로컬 우회 모드(스튜디오 열기 버튼)
LOCAL_AUTH_BYPASS=0 pnpm --filter @fixup/web exec next dev
                      # 실제 배포와 같은 모습(로그인 · 가입 신청 버튼)
```

브라우저로 볼 때 주의할 것 — **Playwright 번들 Chromium 은 H.264 를 디코딩하지
못한다.** 모션 영상이 `DEMUXER_ERROR_COULD_NOT_OPEN` 으로 실패하면 코드 문제가
아니라 그 브라우저의 한계다. 실제 Chrome 에서 확인한다.
