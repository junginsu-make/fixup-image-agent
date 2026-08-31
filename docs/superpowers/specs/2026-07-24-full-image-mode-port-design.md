# 통이미지(full-image) 모드 이식 설계 (2026-07-24)

> 목적: 현재 detail-page-studio(한이룸 v2.0 기반, **editable 모드 하나뿐**)에 원작자 v3.0(`IrumHahn/pdp-maker-30`)의 **full-image(통이미지) 모드**를 이식한다. 그러면 "텍스트 없는 이미지 + 수동 오버레이"가 아니라, **AI가 한국어 텍스트까지 박은 완성형 상세페이지 섹션**을 바로 생성할 수 있다.

## 1. 현재 상태 (확인 완료)
- 모델: analyze=`gemini-3.1-pro-preview`, image=`gemini-3-pro-image-preview`(Nano Banana Pro, 2K). v3.0와 동일.
- `buildAnalyzePrompt`가 항상 "이미지 내 텍스트 넣지 말 것" 강제 → 텍스트 없는 이미지.
- `buildImagePrompt` 마지막에 "Do NOT include any text" 하드코딩.
- 편집기: AI 카피(headline/subheadline/bullets)를 Copy Library에 두고, 사용자가 클릭→오버레이→html2canvas 내보내기. (레이어 0에서 시작, 수동)
- 결론: **완성형(글자 박힌) 자동 출력 경로가 없다.**

## 2. v3.0 full-image 메커니즘 (코드에서 확인)
`PdpOutputMode = "editable" | "full-image"` 한 플래그가 analyze/image 프롬프트를 분기한다.

**analyze(full-image)**: 각 섹션을 "이미지 자체에 한국어 헤드라인 1 + 짧은 서브카피 1 + 포인트 최대 2개가 든 완성형 디자인"으로 설계. 규칙:
- 1080px 결과가 390px 모바일에서 확대 없이 읽혀야 함(긴 문장/작은 본문/복잡한 표 금지)
- 카드/배너 안에서 잘림·말줄임표 = 실패
- 전 섹션 한글 폰트는 Pretendard/Noto Sans KR 한 계열로 통일
- "사진 위 문구"가 아니라 편집 그리드·여백·위계·칩·콜아웃 카드가 있는 실제 섹션 레이아웃
- 이미지 안 버튼/화살표/링크형 CTA("구매하기" 등) 금지 (통이미지는 링크 못 검)
- CTA 필드는 full-image에서 빈 문자열

**image(full-image)**: buildImagePrompt 끝의 "no text" 대신 →
- "완성형 상세페이지 섹션 이미지다. 제공된 카피로 크고 읽히는 한국어 타이포를 이미지에 직접 넣어라"
- `On-image headline/subheadline/bullets`로 실제 문구 주입
- visualRole별 잠금(리뷰=후기카드, concernList=검은 채팅말풍선, disclosure=제품정보카드)
- 타이포 일관성 잠금(한 산세리프)

**부가**: v3.0는 StoryBrand 서사(Hero→Problem→Guide→Plan→Purchase→Success→Failure→Close), 내부역할명을 카피로 쓰지 말라는 강한 안티-추상문구 규칙, 후기 근거 라벨화 금지 등 카피 품질 규칙도 대폭 강화됨.

## 3. 이식 범위 (Phase 1 = full-image 코어)
최소 변경으로 full-image를 켠다. **editable 모드는 그대로 유지(폴백).**

1. **types** (`packages/pdp-core/src/types.ts`): `PdpOutputMode = "editable" | "full-image"` 추가. `PdpAnalyzeRequest`와 `ImageGenOptions`에 `outputMode?: PdpOutputMode`.
2. **service** (`packages/pdp-core/src/pdp.service.ts`):
   - `buildAnalyzePrompt(outputMode)`: full-image 분기 추가(위 규칙). 미전달 시 editable(현행) 유지.
   - `buildImagePrompt`: 끝의 "no text" 하드코딩을 `outputMode==="full-image"`면 텍스트-렌더 지시(headline/subheadline/bullets 주입)로 교체, 아니면 현행.
   - analyze→첫이미지, generateSectionImage가 outputMode를 프롬프트로 전달.
3. **API** (`apps/web/app/api/pdp/*`): analyze·images 라우트가 `outputMode`를 받아 서비스로 전달.
4. **frontend**:
   - 생성 시작 화면(또는 설정)에 **모드 선택 토글**: "완성형(통이미지)" vs "텍스트 편집형". 기본값은 운영자 결정(추천: 통이미지).
   - full-image면 편집기의 수동 오버레이 단계는 **선택**(이미지가 이미 완성). 갤러리·이어보기·ZIP 내보내기로 바로 사용. 텍스트 미세수정은 계속 오버레이로 가능.

## 4. 유지 원칙 / 리스크
- **두 모드 병존**: Nano Banana Pro 한글 렌더가 좋아졌지만 100% 아님(잘림·폰트 드리프트 가능). v3.0도 그래서 editable 유지 + 강한 가드레일 + 재생성. 통이미지 실패 시 editable로 폴백 가능해야 함.
- **surgical**: 기존 editable 경로·타입·편집기 회귀 없어야 함. outputMode 미전달=현행 동작.
- **비용**: 통이미지도 이미지 1장당 1크레딧(현 정책 그대로). 재생성이 늘 수 있음.
- **카피 품질 규칙(Phase 2)**: v3.0의 StoryBrand·안티추상 규칙은 크지만 별도 단계로. Phase 1은 "텍스트가 이미지에 박힌다"만 확실히.

## 5. 제외 (이번 아님)
전사(transcribe), OpenAI 모델 병행(gpt-5.5/gpt-image-2), 고객리뷰 분석, expand, 대기 미니게임 — v3.0의 큰 기능들. 필요 시 Phase 3+.

## 6. 검증 계획
- 로컬(localhost dev, .env.local 키)에서 실제 제품 사진 1장으로:
  1. full-image 모드 생성 → 각 섹션 이미지에 **한국어 헤드라인/카피가 읽히게 박혀 나오는지** 육안 확인
  2. 잘림·말줄임표·폰트 혼용 없는지
  3. editable 모드가 기존대로 텍스트 없는 이미지로 나오는지(회귀 없음)
- 통과 후 EC2 배포(빌드는 -source 기반, 이번에 규명한 절차).

## 7. 결정 (2026-07-24 확정)
- **범위: v3.0(pdp-maker-30)를 새 생성 기반으로 채택.** 단, 이번 세션에 구축한 **회원제·인증·쿼터·admin·EC2 배포는 유지**하고 그 위에 v3.0 엔진을 얹는다(= v3.0 완전 교체 아님, 회원제 재구축 낭비 방지).
- **기본 출력 모드: 통이미지(full-image).**

## 8. 마이그레이션 계획 (v3.0 엔진 이식 + 회원제 유지)

### 구조 매핑
| v3.0 (단일 Next앱) | → 현재 모노레포 대상 |
|---|---|
| `lib/pdp-server/pdp.service.ts` (4407줄, 엔진) | `packages/pdp-core/src/pdp.service.ts` **교체** |
| `lib/shared/pdp*.ts` (타입·정규화·예산) | `packages/pdp-core/src/` 로 병합 |
| `app/api/pdp/*` (analyze·images·expand·transcribe·optimize·validate 등) | `apps/web/app/api/pdp/*` — **회원제 게이트 씌워** 이식 |
| `app/pdp-maker/*` (PdpEditor·PdpMakerClient·drafts·settings) | `apps/web/app/create/*` 교체 |
| deps: react-rnd·pdfjs-dist·sharp·@vercel/blob | apps/web에 추가 |

### 통합 지점 (v3.0엔 없는 것 — 우리가 씌운다)
- **인증/권한**: analyze·images·expand 등 유료 라우트에 `@supabase/ssr` 세션 검증 + active 회원 확인(현행 미들웨어/서버 게이트 재사용).
- **쿼터**: 성공 이미지 1장당 1크레딧. reserve_generation→finalize_generation + `X-Idempotency-Key`(현행 설계 그대로)를 v3.0 images 라우트에 연결.
- **서버 키 공용**: v3.0는 사용자 키 입력 UI가 있을 수 있음 → 현행처럼 서버 env 키만 쓰도록. 브라우저 키 UI 제거.
- **배포**: 이번에 규명한 `/opt/detail-page-studio-source` 빌드 기반 절차 그대로.

### 단계
- **Phase 0 (de-risk, 지금)**: v3.0를 로컬에 clone·install·run → **full-image로 실제 상세페이지 1개 생성해 육안 검증**(정말 한글 텍스트가 잘 박히나). 통과해야 이식 가치 확정. 실패면 계획 재검토.
- **Phase 1**: 엔진 이식 — `pdp-core`를 v3.0 service/shared로 교체, 타입 정합, 빌드 통과.
- **Phase 2**: API 라우트 이식 + **회원제/쿼터 게이트 연결**(핵심 안전).
- **Phase 3**: 편집기 UI 이식(app/create ← v3.0 pdp-maker), 통이미지 기본 모드.
- **Phase 4**: 로컬 E2E(회원 로그인→통이미지 생성→쿼터 차감→내보내기) → EC2 배포·검증.
- **제외(후순위)**: v3.0의 bug-report 위젯/admin, 대기 미니게임, waiting-video 등 비핵심.

### 리스크
- 규모 큼(4천줄 엔진 + UI + 라우트). **회귀 위험** → Phase마다 빌드·타입·E2E 검증. 라이브는 항상 롤백 가능하게.
- v3.0 코드가 사용자 키/무회원 전제 → 회원제 결선이 가장 손 많이 감(Phase 2).
- 컨텍스트/세션 길이: 큰 작업이라 Phase별로 끊어 진행 권장.

## 9. Phase 1 구현 기록 (2026-07-24)
- pdp-core: `outputMode` 추가, buildAnalyzePrompt/buildImagePrompt에 full-image 분기. editable 분기는 원래 "이미지에 글자 넣지 말 것" 하드 규칙 유지 + 편집 텍스트 여백 가이드 문구만 소폭 추가(모순 없음). 미지정=editable.
- UI(create): analyze/generate 요청에 outputMode 전달, 기본 full-image. 사용자 토글은 후속.
- 검증: 프롬프트 빌더 단위테스트 6/6, 실제 통이미지 생성(한글 완벽 렌더), 타입체크·빌드 통과. 코드리뷰 APPROVE(초기 MEDIUM=editable 프롬프트 모순 → 반영해 해소).
- 미결: 편집기 UI가 full-image에서도 Copy Library(수동 오버레이)를 노출 → 텍스트 중복 혼동 가능(Phase 3 UI 정리 대상). EC2 배포는 이번에 규명한 release+node_modules graft 방식.
