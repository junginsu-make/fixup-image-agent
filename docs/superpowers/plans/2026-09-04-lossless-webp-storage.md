# 이미지 저장 용량 절감 — 개정판

작성일: 2026-09-04 (독립 리뷰 3건 반영 후 전면 개정)

> **초판 폐기 사유**: 초판은 잘못된 기준선에서 측정했고(아래 §1), GIF 방어책이 실제로는 뚫리며(§4), 20개 파일 변경 중 17개가 부수적 목표를 위한 것이었다. 개정판은 **이득의 대부분을 파일 1개로 얻는 순서**로 재구성했다.

## 요구사항

fal.ai 생성 이미지와 사용자 첨부 이미지의 저장 용량을 줄인다. **화질 손실은 허용하지 않는다** — 텍스트가 많고 디자인이 복잡한 포스터·카드뉴스·상세페이지를 다룬다.

- 저장되는 픽셀은 원본과 **바이트 단위로 동일**해야 한다
- 어떤 입력에도 저장 용량이 늘어나면 안 된다
- **애니메이션 이미지의 프레임을 잃지 않는다**
- 기존에 저장된 `.png` 파일이 계속 열려야 한다
- 목록 화면은 원본 대신 썸네일을 받는다
- 다운로드 결과물은 원본과 픽셀이 같다

**초판에서 삭제한 요구사항**: "fal에는 PNG만 보낸다." 근거가 없었다. 업로드 입력이 전부 `image/webp` 를 허용하므로(`app/library/references-tab.tsx:210` 등) **WebP는 이미 오늘도 fal로 간다.** 근거 없이 매 생성 요청에 1~2초를 얹는 항목이었다.

---

## 1. 기준선 정정 — `markAsAi` 가 파일을 부풀리고 있다

`lib/watermark.ts:60` 의 `.png().toBuffer()` 가 sharp 기본 설정(compressionLevel 6)으로 재인코딩하는데, 이것이 원본보다 **30~56% 크게** 만든다.

| 파일 | fal 원본 | **현재 저장되는 크기** | 무손실 WebP | 현재 대비 |
|---|---|---|---|---|
| 포스터 1024×1536 | 2700KB | **3893KB** (+44%) | 1914KB | **51%↓** |
| 카드뉴스 1088² | 1835KB | 1830KB (-0%) | 965KB | **47%↓** |
| 상세 1232×2192 | 3138KB | **4082KB** (+30%) | 1871KB | **54%↓** |
| 참고 683×1210 | 1121KB | **1745KB** (+56%) | 823KB | **53%↓** |

픽셀 동일성 전부 확인(raw 버퍼 `equals()`).

초판이 적은 "27~47% 절감"은 **fal 원본 대비**였고, 실제 저장물 대비로는 **47~54%** 다.

**따라서 `watermark.ts:60` 의 인코더를 바꾸는 한 줄이 AI 생성물 절감의 대부분을 가져온다.** 이것이 개정판 1단계다.

fal 모델 확인: `nano-banana`, `nano-banana-2`, `nano-banana-pro` 모두 `output_format` 기본값이 `"png"` 다(fal 공식 문서). 즉 fal이 JPEG를 주는 것이 아니라 우리 재인코딩이 나쁜 것이다.

## 2. 포맷 선택 — 무손실 WebP

손실 압축 배제: WebP q92는 PSNR 36~38dB에 머물고, 손실의 대부분이 크로마 서브샘플링(4:2:0)에서 나온다. q100으로 올려도 37.0dB에서 막힌다. 텍스트 경계에 색 번짐이 생긴다.

PNG 재압축 배제: `png({ effort: 10 })` 은 팔레트 양자화(손실)를 켠다. 진짜 무손실 PNG(`compressionLevel: 9`)는 4개 중 3개에서 원본보다 커진다(카드뉴스만 1835→1760KB로 작아진다).

설정: `webp({ lossless: true, effort: 4 })`. effort 6은 1% 이득에 30% 느리다.

## 3. 핵심 규칙

> 변환 결과가 원본보다 작을 때만 교체한다. 아니면 원본 바이트를 그대로 보관한다.

용량 증가와 화질 저하가 구조적으로 불가능해진다. **단, 애니메이션은 이 규칙으로 막지 못한다** — 다음 항목 참조.

## 4. 애니메이션 방어 — 시그니처가 아니라 `pages` 로 판정한다

초판은 "`sniffImageMime` 이 `image/png` 로 판정한 것만 변환"하면 안전하다고 했다. **실측 결과 뚫린다.**

```
12프레임 GIF (2545B)
  sniffImageMime(bytes, fallback="image/png") = "image/png"   ← GIF 시그니처를 판정하지 않음
  → 화이트리스트 통과
  → webp({lossless:true}) = 220B, 1프레임
  → 원본보다 작으므로 "작을 때만" 규칙도 통과
  결과: 12프레임이 1프레임으로 소실
```

두 가지가 겹친다. `lib/server-library.ts:127` 의 `sniffImageMime` 은 PNG/JPEG/WebP만 판정하고 나머지는 호출자의 `fallback` 을 그대로 돌려주는데, `app/api/library/route.ts:74` 가 `String(image.mimeType || "image/png")` 로 **기본값을 `image/png` 로 박아 넣는다.**

**APNG는 시그니처로 아예 걸러낼 수 없다** — 첫 8바이트가 규격상 표준 PNG 시그니처와 동일하다.

**올바른 방어**: `sharp(bytes).metadata().pages` 를 보고 `> 1` 이면 변환하지 않는다. 위 GIF에서 `pages = 12` 로 확인했다. 이 방법은 APNG도 함께 막는다.

## 5. 썸네일

512px `fit: inside`, WebP q78. 9~30KB, 37ms. 원본과 별개 파일이며 목록 전용이라 원본 품질에 영향이 없다.

**전송량이 저장량보다 큰 문제다.** `app/library/works-tab.tsx:414` 가 raw `<img src={서명URL}>` 로 표지를 그리는데, `lib/server-library.ts:247` 이 **최대 200건**을 돌려주고 그 표지가 전부 2~4MB 원본이다. Supabase는 egress 단가가 storage의 4배 이상이고 매 조회마다 반복 과금된다.

**기존 행은 배치 백필한다.** 초판은 백필하지 않기로 했으나, 그러면 오래된 계정일수록 이득이 0이다. 썸네일은 파생본이라 잘못 만들어도 지우고 다시 만들면 그만이고 원본·`path` 컬럼을 건드리지 않는다. `scripts/migrate-local-to-supabase.mjs` 가 유사 배치의 선례다.

**먼저 확인할 것**: Supabase Storage의 `createSignedUrl(path, ttl, { transform: { width: 512 } })` 를 쓸 수 있으면 마이그레이션·컬럼·백필·고아 파일이 전부 불필요해진다. Pro 플랜 요건일 수 있다. **2단계 착수 전 이것부터 확인한다.**

---

## 현재 코드 상태

> **줄 번호는 세션 중 커밋(`866ae6d`, `82ca4f0`, `64a0f45`)으로 밀렸다. 각 단계 시작 전 반드시 다시 읽고 갱신할 것.** 아래는 `866ae6d` 시점 기준이다.

### 저장 경로

| 위치 | 대상 | 현재 재인코딩 |
|---|---|---|
| `lib/watermark.ts:60` | **AI 생성물 전체의 실질 인코더** | `.png()` — 30~56% 부풀림 |
| `lib/server-library.ts:182` | 생성 결과 / 업로드 파일 | `markAsAi` (`origin === "ai"` 일 때만) |
| `lib/reference-images.ts:219` | 참고 이미지 첨부 | 없음 |
| `lib/user-style-references.ts:88` | 스타일 참고 첨부 | 없음 |
| `lib/characters.ts:213` `putView` | 캐릭터 각도 | 없음 |
| `lib/sns/runtime.ts:73` `uploadResult` | SNS 카드 | 로컬 분기(`:75`)만 `.png()` 강제 |

### 포맷을 PNG로 고정한 자리 6곳

- `app/api/poster/projects/[id]/images/[index]/file/route.ts:63` — `content-type` 하드코딩
- `app/api/sns/projects/[id]/cards/[index]/file/route.ts:27` — 동일
- `app/api/poster/projects/[id]/status/route.ts:53` — `contentType: "image/png"`. `:41` 은 fal 응답의 content-type을 **읽지도 않는다**
- `lib/poster/supabase-store-core.ts:19` — `posterAssetPath()` 가 경로에 `.png`
- `lib/sns/runtime.ts:60` `.png$` 정규식 / `:66` `data:image/png`
- `lib/local-store/index.ts:609` `writeLocalSnsResultFile` 경로에 `.png`

### 깨지는 기존 테스트 2건

- `lib/__tests__/poster-supabase-store.test.ts:122`
- `lib/__tests__/local-store.test.ts:234,236`

`app/api/sns/__tests__/download-filename.test.ts` 는 **깨지지 않는다** — `app/sns/download-filename.ts:3` 이 이미 `/\.(png|jpe?g|webp)$/i` 로 확장자를 뽑는다(초판의 오판).

### 안심해도 되는 것

- 삭제는 전부 DB 저장 경로 기반이라 확장자가 바뀌어도 안 깨진다
- `PdpEditor.tsx:1964,2049` 는 html2canvas 경로라 영향 없음

---

## 단계 구성

세 단계는 **독립적이며 각각 단독으로 가치가 있다.** 앞 단계가 안정된 뒤 다음을 판단한다.

> 각 단계 시작 전 필수: 이 문서와 대상 파일의 **현재 상태**를 다시 읽는다. 줄 번호가 이미 한 번 밀렸다.

### 1단계 — `markAsAi` 인코더 교체 + 안전장치 (파일 2개)

**이득의 대부분이 여기 있다.** 확장자 변경 없이 진행한다.

| 대상 | 내용 |
|---|---|
| 신설 `apps/web/lib/image-encoding.ts` | `encodeForStorage` / `makeThumbnail` / `toPng` |
| `lib/watermark.ts:60` | 최종 `.png()` → `encodeForStorage` 호출 |

```ts
export interface StoredImage {
  bytes: Buffer;
  mimeType: string;   // 항상 실제 바이트 기준 sniff 결과
  converted: boolean;
}
```

구현 규칙:
- **`mimeType` 은 변환 여부와 무관하게 항상 sniff 결과다.** 초판 명세("교체 시 webp, 아니면 원본 mime")는 `server-library.ts:182` 의 기존 `sniffImageMime(bytes, ...)` 동작을 회귀시킨다
- **애니메이션 방어**: `metadata().pages > 1` 이면 변환하지 않는다 (§4)
- **`limitInputPixels` 명시**: 이 코드베이스에는 `limitInputPixels`/`failOn` 이 **하나도 없다**(grep 0건). sharp 기본 268MP는 RGBA로 1.07GB이고 운영 여유 메모리는 445MB다. `sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" })` 로 좁힌다. 초과분은 "실패 시 원본 반환"에 자연히 흡수된다
- `result.length < bytes.length` 일 때만 교체
- 전 구간 try/catch → 실패 시 원본 반환

테스트(전부 실제 sharp, 픽스처는 `compose.test.ts:39` 방식으로 생성):
- **무손실 검증** — raw 버퍼 `equals()`. **`removeAlpha()` 를 쓰지 않는다**(알파까지 비교). `metadata()` 의 `width/height/hasAlpha` 도 단언
- **Red-Green** — 같은 비교를 `webp({ quality: 92 })` 에 걸면 **실패하는지** 확인. 이걸 안 하면 테스트가 무손실을 잡는지 알 수 없다
- 알파 있는 이미지 별도 케이스
- **애니메이션 GIF** → `converted === false`, 바이트 동일. 픽스처: `node_modules/.pnpm/pdfjs-dist@*/....../loading-icon.gif` (12프레임, 검증됨)
- JPEG 입력 → `converted === false`, mime 유지
- 거대 픽셀 이미지 → throw 없이 원본 반환
- 손상된 바이트 → throw 없이 원본 반환
- `toPng` 왕복 → 원본과 raw 픽셀 동일

**초판의 "랜덤 노이즈 PNG → `converted === false`" 테스트는 삭제한다.** 실측 결과 랜덤 노이즈에서도 무손실 WebP가 항상 더 작다(1024²: PNG 3,152,409B vs WebP 3,145,808B). 이 픽스처로는 `false` 갈래를 못 잡는다.

**수용 기준**: 위 테스트 전부 통과(Red-Green의 실패 단계를 눈으로 확인). 새로 생성한 포스터가 실측대로 저장물 기준 ~51% 작아진다. 기존 테스트 회귀 0건.
**위험 낮음** — 확장자를 안 바꾸므로 읽기 경로·삭제·다운로드가 전부 그대로다. `mime_type` 컬럼과 `extensionFor` 가 이미 webp를 아는 덕에 저장 경로도 자동으로 따라간다.

### 2단계 — 썸네일 + 백필 (파일 3~4개)

**착수 전 Supabase `transform` 지원 여부를 먼저 확인한다.** 되면 이 단계는 파일 1개로 끝난다.

안 되면:
1. `supabase/migrations/202609040012_image_thumbnails.sql` — `library_images` / `showcase_items` / `poster_images` / `sns_cards` 에 `thumb_path text` (NULL 허용). `style_references`·`character_views`·`reference_images` 는 수가 적어 제외
2. `lib/server-library.ts:180-199` 루프에 `makeThumbnail` + 두 번째 업로드. **롤백 배열(`:209`)에 썸네일 경로도 넣는다** — 빠뜨리면 실패 시 고아 파일이 남는다
3. `listLibraryItems`(`:247`) 가 `thumb_path` 를 서명. `thumb_path IS NULL` 이면 원본으로 폴백
4. `lib/library.ts:125` 의 `thumbnail` 매핑
5. 기존 행 배치 백필 스크립트

**동시성**: PDP는 한 요청에 최대 20장(`api/library/route.ts:17`). 순차면 최대 20초가 붙는다(`maxDuration = 300` 이라 타임아웃은 아니다). 동시성 2로 제한한다.

**단, 요청 내 동시성 2는 전역 상한이 아니다.** 이 프로젝트는 `lib/layout/render-gate.ts` 에 전역 게이트를 이미 갖고 있으나 적용처가 `api/sns/layout/preview` 와 `deck-preview` **둘뿐**이고 `/api/library` POST는 게이트 밖이다. 저장 경로의 인코딩도 같은 성질의 전역 세마포어 안에 넣는다.

**수용 기준**: 목록 전송량이 실측으로 줄어든다(브라우저 네트워크 탭). 옛 항목은 폴백으로 정상 표시. 백필 후 기존 항목도 썸네일을 쓴다.
**위험 중** — 롤백 배열 누락, 메모리. 코드를 되돌려도 컬럼만 남고 아무것도 안 깨진다.

### 3단계 — 확장자 전면 전환 (파일 ~17개) · **1·2단계 안정 후 별도 판단**

1단계가 이미 이득의 대부분을 가져오므로, **이 단계는 착수 여부부터 다시 판단한다.** 남은 이득은 첨부 이미지(대부분 JPEG라 변환 대상 아님)와 비-`markAsAi` 경로뿐이다.

착수한다면 순서를 지킨다.

**3-1. 읽기 중립화 (먼저)** — 반대로 하면 새 `.webp` 가 `content-type: image/png` 로 나가 브라우저가 못 연다.
- 포스터·sns 파일 라우트 2곳: 경로 확장자에서 mime 유도. `showcase/core.ts:146-156` 의 `mimeForStoragePath()` 를 공용 위치로 뽑아 재사용
- `lib/sns/runtime.ts:60` `.png$` → `\.[a-z0-9]+$`, `:66` 경로 확장자로 mime

**`lib/sns/runtime.ts:75` 의 `.png()` 제거는 여기 넣지 않는다.** 초판은 이걸 읽기 단계에 넣고 "동작 중립"이라고 했으나 **쓰기 변경이다.** 배지가 꺼져 있으면 `markAsAi` 가 원본을 그대로 돌려주므로(`watermark.ts:27`), `:75` 를 먼저 빼면 non-PNG 바이트가 `.png` 이름으로 저장되고 `:66` 이 `image/png` 라고 거짓말한다. 3-2로 옮긴다.

**3-2. 쓰기 전환**
- `lib/sns/runtime.ts:73-82` + `:75` `.png()` 제거. 호출부 `:282`·`:297` 의 `"image/png"` 상수 제거
- `lib/local-store/index.ts:609` — 확장자 인자 추가. 테스트 동반 수정
- `lib/poster/supabase-store-core.ts:19` — `posterAssetPath(…, extension)`. 테스트 동반 수정
- `app/api/poster/.../status/route.ts:41-55` — fal 응답 content-type을 읽고, `:44` 로컬 경로와 `:53` mime을 결과에 맞춘다
- `lib/characters.ts:213-223` — `storagePathFor` 가 `extensionFor(view.mimeType)` 을 쓰므로 결과 mime을 **경로 생성 전에** 넘긴다
- `lib/user-style-references.ts:85-91` — `:75` 의 `mime_type` insert 값도 결과 mime으로
- `lib/reference-images.ts:192-245` — `new File(...)`(`:194`) 전에 인코딩. **클라이언트 `file.type` 이 아니라 실제 바이트 기준**

**`upsert: true` 고아 파일**: 포스터 변형·캐릭터 각도·sns 카드 재생성이 모두 `upsert: true` 다. `0.png` 자리에 `0.webp` 를 쓰면 덮어쓰기가 아니라 새 파일이라 옛 `.png` 가 남는다. 업로드 직전 DB의 기존 경로를 읽어 다르면 `remove` 한다.

**3-3. 다운로드 라우트** — 필요하다고 판단될 때만.
- 새 라우트 `app/api/library/[id]/images/[position]/file/route.ts`
- **`content-type` 을 경로 확장자에서만 유도한다. `mime_type` 컬럼을 읽지 않는다** (§보안)
- 소유권은 `libraryScope(viewer, "read")`(`server-library.ts:47`). 관리자 예외를 임의로 넓히지 말 것

---

## 보안 (독립 리뷰 지적, 전부 검증됨)

### HIGH-1. 디코딩 폭탄

`limitInputPixels`/`failOn` 이 코드베이스에 **하나도 없다**. sharp 기본 268MP → RGBA 1.07GB, 운영 여유 445MB. 16383² 단색 PNG는 수백 KB로 압축되므로 회원 누구나 작은 파일 한 장으로 프로세스를 OOM에 보낼 수 있다.

**방어**: 1단계에서 `limitInputPixels` 명시. 저장 경로 인코딩을 전역 게이트 안에. `api/library/route.ts` 와 `api/reference-images/route.ts` 에 **바이트 상한**(장당·요청합계). 현재 `MAX_IMAGES = 20` 은 장수만 세고 바이트를 안 센다. Caddy(`deploy/ec2/Caddyfile.template`)에도 본문 크기 제한이 없다.

### HIGH-2. 신규 라우트가 저장형 XSS 문을 연다

`api/library/route.ts:74` 가 화이트리스트 없이 `String(image.mimeType || "image/png")` 를 받고 → `sniffImageMime` 이 시그니처 불일치 시 그 문자열을 그대로 반환하고(`server-library.ts:127-138`) → `:188` 이 Storage `contentType` 으로 쓴다.

지금은 Supabase 서명 URL(**다른 출처**)로만 나가 봉인돼 있다. 3-3의 새 라우트가 **같은 출처**에서 같은 바이트를 흘리는 문을 연다. Caddy의 `nosniff` 는 이걸 막지 못하고(선언을 무시하라는 뜻이 아니다) CSP는 이 스택에 없다.

**방어 (넷 다 필요하다)**

1. **새 라우트는 경로 확장자에서만 mime을 유도한다.** `mime_type` 컬럼을 읽지 않는다. 결정적인 성질은 "허용 목록"이 아니라 **허용 목록 + 안전한 기본값**이다 — 공격자가 확장자까지 고르더라도 헤더가 공격자 값이 되지 않는다. 선례 둘 다 이 성질을 갖췄다(확인함): `showcase/core.ts:155` 는 `?? "image/png"`, `reference-images/[id]/file/route.ts:31` 은 `?? "application/octet-stream"`.

2. **공용 mime 함수는 png/jpg/jpeg/webp 4키 고정 + 안전한 기본값으로 못박는다.** 문자열 조립(`` `image/${ext}` ``) 금지 — 안전한 기본값이 사라진다. **`svg` 를 절대 추가하지 않는다** — `image/svg+xml` 은 동일 출처에서 스크립트가 도는 이미지 타입이라 확장자 유도 방식의 유일한 진짜 예외다. 현재 세 맵(`showcase/core.ts:146-151`, `reference-images/[id]/file/route.ts:12-16`, `server-library.ts:109-113`)이 모두 png/jpg/webp 3종뿐이고 그대로 유지돼야 한다.

3. **근본 수정 — `api/library/route.ts:74` 에 mime 화이트리스트.** 경로 확장자 유도는 **새 라우트만** 닫는다. Storage 객체에 박힌 `contentType: text/html` 은 지워지지 않으므로, 목록이 서명 URL을 쓰는 한 앱이 스스로 발급한 1시간짜리 링크로 `*.supabase.co` 에서 공격자 HTML이 뜬다. 앱 쿠키에는 못 닿지만 조직 소유 도메인에서 임의 HTML이 호스팅되는 상태다. **이건 라우트를 아무리 잘 짜도 안 닫히고, 이 화이트리스트만이 닫는다.** §4의 GIF 구멍과 같은 자리라 하나로 둘 다 닫힌다.

```ts
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
```

4. **다운로드 파일명을 `library_items.title` 에서 만들지 않는다.** 제목은 `api/library/route.ts:85` 에서 임의 문자열로 들어와 `server-library.ts:162` 에서 200자로 자를 뿐 정제되지 않는다(확인함). Node/undici가 헤더의 CR/LF를 거부해 응답 분할까지는 안 가지만, 따옴표를 끼워 다운로드 파일명과 확장자를 바꾸는 것은 가능하다. 서버가 `{itemId}-{position}.png` 로 직접 만들거나, 굳이 제목을 쓴다면 `filename*=UTF-8''${encodeURIComponent(...)}` 에 제어문자·따옴표를 제거하고 넣는다.

### HIGH-3. 새 라우트의 IDOR

새 라우트가 받는 `[id]`(item)와 `[position]` 은 둘 다 사용자 입력이다. 위험한 구현 셋:

1. **소유자 조건 누락** — `item_id + position` 만으로 조회하면 남의 item id 하나만 알면 전부 열린다. `library_images.user_id` 는 조인 없이 판정하라고 일부러 중복 저장한 칸이다(`202607280001_server_library.sql:27-28` 주석이 명시).

2. **포스터의 관리자 예외 패턴을 복사하는 것** — 포스터 라우트의 `adminAssetPath()`(`app/api/poster/.../file/route.ts:26-34`)는 소유자 조건 없는 **두 번째 질의**이고, 그 주석(`:20-25`)이 "같은 함수에 「관리자면 조건을 뺀다」를 심으면 언젠가 그 조건이 어긋나 회원에게 남의 그림이 열린다"고 경고한다. **라이브러리에는 그 두 번째 질의가 필요 없다** — `libraryScope` 가 관리자에게 이미 `null`(조건 없음)을 돌려준다. 복사하면 질의가 둘로 늘고, 그 둘이 갈라지는 날이 사고 나는 날이다.

   참고: `866ae6d` 커밋으로 `libraryScope`(현재 `:47`)가 바뀌어 **관리자는 읽기·지우기 모두 `null`** 이다. 초판이 인용한 "관리자는 보기만 넓어진다"는 더 이상 사실이 아니다.

3. **경로를 파라미터로 조립하는 것** — `${userId}/${id}/${position}.${ext}` 로 만들면 파라미터가 경로에 직접 들어간다. **DB에 저장된 `path` 를 읽어서 쓴다.**

### LOW. 확장자 인자화가 방어를 한 겹으로 줄인다

3-2가 `posterAssetPath(…, extension)`·`writeLocalSnsResultFile(…, extension)` 로 확장자를 인자화한다. 그 인자가 `extensionFor(mime)` 이 아니라 파일명이나 `mime.split("/")[1]` 에서 오면 경로 확장자가 사용자 영향권에 들어간다. 안전한 기본값 덕에 헤더는 여전히 안 뚫리지만 방어가 두 겹에서 한 겹으로 준다. **확장자 인자는 반드시 `extensionFor()` 를 거친 값만 받는다.**

## 롤백

**3-2 배포 = 되돌릴 수 없는 지점이다.** `.webp` 가 하나라도 생긴 뒤 3-1을 되돌리면 `content-type: image/png` 가 부활해 그 창에서 만든 결과물이 전부 안 열린다.

`deploy/ec2/rollback-release.sh` 는 릴리스 심볼릭 링크를 **통째로** 되돌린다. 사고 시 운영자가 그냥 돌리면 정확히 이 사고가 난다.

- 3-1과 3-2를 **별도 릴리스**로 나눠 부분 롤백이 물리적으로 가능하게 한다
- 롤백 전 `select mime_type, count(*) from library_images where created_at > '<3-2 배포시각>' group by 1` 로 영향 범위를 확인한다
- 1·2단계는 안전하다 — 1단계는 확장자를 안 바꾸고, 2단계는 `thumb_path IS NULL` 폴백이 있다

## 아직 확인 못 한 것

- **현재 저장 총량과 월 비용.** 절감률의 분모가 없다. 1단계 착수 전 Supabase 대시보드에서 확인하면 이후 판단이 쉬워진다
- Supabase Storage `transform` 사용 가능 여부 (2단계 착수 전)

## 성공 기준

- [ ] 무손실 왕복이 알파 포함 raw 픽셀 단위로 동일 (Red-Green 확인 완료)
- [ ] 12프레임 GIF가 프레임을 잃지 않음 (`converted === false`)
- [ ] JPEG 입력 시 원본 바이트 그대로
- [ ] 거대 픽셀·손상 입력에 throw 없음
- [ ] 새 포스터가 저장물 기준 ~51% 작아짐 (실제 파일 크기로 확인)
- [ ] 목록 전송량 감소를 브라우저 네트워크 탭으로 확인
- [ ] `pnpm --filter @fixup/web test` / `typecheck` / `build` 전부 통과
