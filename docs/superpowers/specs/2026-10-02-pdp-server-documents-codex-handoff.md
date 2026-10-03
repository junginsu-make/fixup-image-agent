# 상세페이지 작업을 서버에 저장하기 — Codex 작업 지시서

작성 2026-10-02 · Claude Code 세션이 조사·설계, **Codex 가 구현** · 사용자 결정 반영

> **Codex 에게.** 이 문서 하나로 일을 시작할 수 있게 썼다. 줄 번호는 2026-10-02 조사 시점
> 기준이라 바뀌었을 수 있다 — **매 단계 시작 전에 해당 파일을 다시 읽고** 확인한다.
> 사용자는 비개발자다. 보고는 한국어, 결론 먼저, 쉬운 말로 한다(§11).

---

## 0. 한 줄 요약

상세페이지(`/create`) 작업의 **과정 전체**(입력·사진·구성·문구·설정·편집 상태·생성 그림)를
지금은 그 브라우저(IndexedDB)에만 두는데, 이것을 **서버(Supabase 표 + Storage)에 저장**해서
어느 브라우저·어느 컴퓨터에서든 라이브러리 「과정 보기」로 **모든 단계를 결과물과 함께 열고,
고치고, 다시 생성**할 수 있게 한다.

## 1. 사용자 요구 (원문 요지)

- 「이미 만들어진 결과물을 과정 보기 했을 때 모든 스텝들 결과물 포함된 과정들을 그대로 보여 달라.
  그 상태에서도 수정, 재생성될 수 있게.」(캐릭터·상세페이지 둘 다 — 캐릭터는 끝났다, §9.2)
- 「예전에는 브라우저만 사용했어도 됐지만 이제는 웹 서비스라 각 다른 브라우저에서 사용할 계획.
  그래서 어떻게 개선할지 설계가 필요.」

## 2. 확정된 결정 (2026-10-02, 사용자)

| 물음 | 답 |
|---|---|
| 방식 | **A안 — 저장 창구(`draftRepository`) 뒤만 서버로 교체.** 처음 만들기 흐름은 그대로 |
| 과정 보기로 열어 고치고 재생성하면 | **같은 작업에 이어서 저장.** 고치기 전 버전은 서버에 남겨 되돌릴 수 있게. 라이브러리의 그 작업 그림도 새것으로 바뀜 |
| 리디자인(`/redesign`) | **상세페이지 먼저, 리디자인은 다음 작업**(원본 파일·PDF 보관이 따로 필요) |
| 지금 브라우저에만 있는 작업 | **사용자가 열 때 서버로 옮김.** 안 연 것을 몰래 올리지 않음 |
| 서버 작업 보관 | **지울 때까지 보관.** 되돌리기용 이전 버전은 최근 몇 개만(§4.5) |

비교했던 다른 안 — B(9월 v3 문서 모델로 화면 내부까지 전면 교체: 깔끔하지만 위험·장기), C(완성
시점에만 묶음 저장: 만드는 중 작업을 다른 브라우저에서 못 엶 → 요구 불충족). 둘 다 채택하지 않음.

## 3. 지금 구조 (조사 결과)

**한 문장:** 서버에는 완성 그림과 생성 기록만 있고, 작업을 되살리는 데 필요한 입력·설정·편집
상태는 전부 브라우저 IndexedDB 에만 있다.

### 3.1 저장 창구 — 이번 작업의 축

`apps/web/app/create/draft-repository.ts`(55줄) 의 `createDraftRepository(enableV3)` 가
`get / save / preserve / remove / list` 를 내고, 화면은 **이것만** 부른다
(`PdpMakerClient.tsx` :392 list · :506 save · :557 preserve · :638 get · :845·:863 remove).
v3 플래그(`PDP_DOCUMENT_V3==="1"`, `create/page.tsx:18`)가 켜지면 v3 IDB, 아니면 v2 IDB.
**운영의 플래그 값은 확인 못 함**(§10).

### 3.2 작업 한 건이 담는 것 (v2 `PdpDraftRecord`, `pdp-drafts.ts:159-208`)

| 단계 | 필드 | 그림(base64)? |
|---|---|---|
| 업로드 | `preparedImage`·`modelImage`(1024px JPEG q0.84, base64 + 같은 data URL 이중), `styleReference.imageBase64`, 텍스트·옵션(`additionalInfo`·`sellerBrief`·`desiredTone`·`look`·`userInstruction`·`planInstruction`·`attachmentIntents`·`copyIntensity`·`gapPolicy`·`imageModel`·`characterId`/`characterAngles`·`preserveProduct`·`personSource`·`aspectRatio`·`startMode`) | 예 |
| 분석 | `result.originalImage`(앵커, 접두사 없는 base64), `result.blueprint`(섹션 ≤10, 문구·프롬프트), `review`·`productReadingStatus`·`copyGapOutcome`·`planningExecutions`, `analyzedBlueprint`(blueprint 사본) | 예 |
| 글로 시작 | `textDraft`(`pdp-drafts.ts:124-157`) 안 `keyVisual` base64(2K) | 예 |
| 편집 | `sections[].generatedImage`(data URL, **장당 2~5MB**), `editorState`(`sectionKeys`·`sectionOptions`·`overlaysBySection`·`workbench*`) | 예 |

- 실측: 섹션 10장 + 원본·인물·레퍼런스면 **초안 1건 63.4MB**(`draft-save-failure.ts:6-8`)
- `editorState.sections` 와 `result.blueprint.sections` 는 같은 객체(`editor-state.ts:5-14`). JSON 으로
  보내면 두 번 실린다 → 직렬화 때 한 번만
- 재생성은 매 호출에 `originalImageBase64`(앵커, `PdpEditor.tsx:1668·1868`)와 `pageWire()`(`:1599`,
  스타일·인물 base64·지시·모델)가 필요하다 → **복원 때 원본 바이트가 있어야 한다**

v3(`document-state.ts:10-49`, IDB `hanirum-pdp-documents`)는 `assets`(base64 단일 보관)·`references`(assetId)·
`revision`·`stage` 8단계를 가진다. **서버 저장 형식은 이 v3 모양을 쓴다**(§4.2). 알려진 v3 버그: 삭제가
`documents` 만 지우고 `revisions`·`assets` 를 남긴다(`document-store.ts:163-171`).

### 3.3 저장·불러오기 수명

- 자동저장 30초(`draft-save-clock.ts:27-30`), 변경 있을 때만. 편집기 진입 즉시 1회, 덮어쓰기 전 `[보관]` 사본
- id 는 클라이언트 UUID v4(`pdp-drafts.ts:302`)
- 불러오기 `/create?draft=<id>` → `handleLoadDraft`(`PdpMakerClient.tsx:625-720`)가 상태 약 35개를 채우고
  편집기를 다시 마운트. 「저장된 작업을 찾지 못했습니다」는 IDB 에 없을 때(`:640`)
- 보존 30일(`draft-retention.ts:16`). 다중 탭: v2 는 마지막 쓴 쪽이 이김, v3 는 revision 비교

### 3.4 지금 서버에 가는 것

- 라이브러리 `library_items`(`source_id`, `data`=과정 요약 jsonb, **원본 사진 없음** `work-process.ts:106`)·
  `library_images`. 버킷 `library` 비공개, 경로 `{user}/{item}/{pos}-{tag}.{ext}` + `.thumb.webp`.
  저장 때 AI 표기·무손실 WebP 재인코딩 → **복원 원본으로 못 쓴다**
- 생성 기록 `pdp_generation_jobs`/`items`(`202609180001`): 원본 바이트 `{user}/pdp-jobs/{job}/{section}-{attempt}.ext`
- 서버 라이브러리 동기화 `syncPdpDocumentToLibrary`(`lib/pdp/jobs/library-sync.ts:178`): `source_id`=초안 id
  (2026-09-28 이후만). 그 전 작업·브라우저 업로드 길은 이미지 해시 UUID
- 본문 상한: 미들웨어 **16MB**(`next.config.mjs:71`, `middleware.ts:263`) — base64 를 JSON 으로 못 보낸다
- 재사용할 선례: 카드뉴스 `sns_projects`(`data` jsonb + 자산 경로, 갱신 행 수로 소유 확인
  `sns-flow-store.ts:105-129`), 포스터 `poster_images`(회차별 행), 관리자 열람·복사
  `api/admin/works/*`(서비스 키 읽기, 관리자 아니면 404, 복사는 파일 먼저·행 나중)

### 3.5 선행 설계

`docs/superpowers/specs/2026-09-17-pdp-integrated-improvement-design.md` §4~5·§8.1 이 이미
`pdp_documents`/`pdp_document_revisions`, 자산은 Storage(사용자 id 로 시작하는 경로), revision 충돌 409
시 양쪽 보존, 「사용자가 연 초안만 이관」, 로컬 저장소 구현을 정했다. **미구현.** 이 문서는 그 계획의
저장 부분을 A안 범위로 구현한다(작업 큐·실행기 §8.2~8.4 는 범위 밖).

## 4. 설계 (A안)

### 4.1 큰 그림

```
화면(PdpMakerClient) ─▶ draftRepository (같은 get/save/preserve/remove/list)
                               │
                 ┌─────────────┴─────────────┐
           [기존] IndexedDB 저장소      [새] 서버 저장소 (플래그 PDP_SERVER_DOCUMENTS=1)
                                         ├─ 글자 문서(JSON) ─▶ /api/pdp/documents ─▶ pdp_documents
                                         └─ 그림(base64→바이트) ─▶ 서명 업로드 URL ─▶ Storage (브라우저가 직접)
```

- **처음 만들기 코드는 그대로.** 바뀌는 곳은 저장 창구와 그 뒤, 불러오기 진입점(`?doc=`), 라이브러리 연결
- 그림은 **브라우저→Storage 직접 업로드**(서명 업로드 URL). 운영 서버 램 911MB(t3.micro, `DEPLOY.md:273,309`)라
  서버가 그림 바이트를 들고 있지 않는다. 서버가 다루는 것은 작은 JSON 뿐
- 플래그로 켜고 끈다. 끄면 지금과 똑같이 IndexedDB 만 쓴다(되돌리기 쉬움)

### 4.2 저장 형식

- 서버 문서 JSON = **v3 `PdpDocumentV3` 모양**(`createPdpDocument`·`documentToDraft` 가 이미 v2↔v3 변환을 한다).
  단 `assets[id]` 에 base64 대신 `{ path, mimeType, width, height, sha256, bytes }` 를 둔다
  (09-17 설계 §4.1 `AssetReference` 와 같은 뜻)
- 화면이 쓰는 v2 모양(base64)은 **저장 창구 안에서만** 변환한다: 저장 때 base64 → sha256 → (없으면) 업로드 →
  경로로 치환, 불러올 때 경로 → 서명 URL → 바이트 → data URL/base64 로 복원 → `documentToDraft`
- 같은 그림은 sha256 으로 한 번만 올린다(문서 안 자산 목록으로 판단)
- `editorState.sections`/`result.blueprint.sections` 중복은 직렬화 때 한 번만

### 4.3 DB (마이그레이션 — **사용자 승인 후 사용자가 운영에서 실행**)

초안(정확한 SQL 은 구현 단계에서 작성·시험한다):

```sql
create table public.pdp_documents (
  id uuid primary key,                 -- 서버가 (user_id, id) 로 소유를 묶는다. 남의 id 로 쓰기 불가
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid,                        -- 기존 stamp_team 트리거 관례를 따를지 구현 때 확인
  title text not null default '',
  stage text not null,
  schema_version int not null default 3,
  revision int not null default 1,     -- 낙관적 잠금. PUT 은 base_revision 일치할 때만
  document jsonb not null,             -- base64 없음. 수백 KB 이내 목표
  source_draft_id text,                -- IndexedDB 에서 옮겨 온 경우 원래 id(중복 이관 방지)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.pdp_document_revisions (
  document_id uuid not null references public.pdp_documents(id) on delete cascade,
  revision int not null,
  user_id uuid not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  primary key (document_id, revision)
);
alter table public.pdp_documents enable row level security;
alter table public.pdp_document_revisions enable row level security;
create policy "own pdp documents read" on public.pdp_documents for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "own pdp revisions read" on public.pdp_document_revisions for select to authenticated
  using ((select auth.uid()) = user_id);
-- 쓰기는 서버(서비스 롤)만. 회원 JWT 의 직접 쓰기를 막는다(§4.7 의 교훈)
revoke insert, update, delete on public.pdp_documents, public.pdp_document_revisions from authenticated, anon;
```

- Storage: 기존 비공개 버킷(`library` 또는 새 `pdp-documents` — 구현 때 정책·용량 보고 결정, 사용자에게 보고)
  경로 `{user_id}/pdp-docs/{document_id}/{sha256}.{ext}`. 첫 칸이 소유자(기존 버킷 정책 관례)
- 로컬(`LOCAL_STORE=1`)에는 같은 저장소 계약의 파일 구현을 둔다(선례 `lib/pdp/jobs/local-repository.ts`).
  **로컬 `.env.local` 에 운영 Supabase 값을 넣지 않는다**(CLAUDE.md 「로컬 확인」)

### 4.4 서버 API

| 경로 | 하는 일 |
|---|---|
| `GET /api/pdp/documents` | 내 작업 목록(제목·단계·썸네일 경로·갱신 시각). 문서 본문 제외 |
| `GET /api/pdp/documents/:id` | 문서 JSON + 자산 서명 URL(짧은 수명). 남의 것·없는 것은 404 |
| `PUT /api/pdp/documents/:id` | `{ baseRevision, document }`. revision 일치 시 저장·revision+1·이전 본을 revisions 로. 불일치 **409** + 서버 최신본 |
| `POST /api/pdp/documents/:id/assets` | `{ sha256, mimeType, bytes }` → 서명 업로드 URL 발급(크기·형식 검사). 이미 있으면 「있음」 |
| `DELETE /api/pdp/documents/:id` | 문서·이전 본·자산 삭제(소유자만) |
| 관리자 | 기존 `api/admin/works` 관례: 서비스 키 읽기(관리자 아니면 404), 「내 것으로 복사」(파일 먼저 복사·행 나중) |

- 모든 입력은 zod 로 경계 검증. 오류 문구는 내부 구조를 흘리지 않는다
- PUT 본문은 16MB 상한보다 훨씬 작아야 한다 — 문서에 base64 가 섞이면 400 으로 거부(실수 방지)
- supabase-js 서명 업로드(`createSignedUploadUrl`/`uploadToSignedUrl`)는 **쓰기 전에 context7 로 현재 API 확인**

### 4.5 저장·충돌·이전 버전

- 자동저장 주기·조건은 지금과 같다(30초, 변경 있을 때). 보내는 것은 JSON 뿐
- 새 그림은 생길 때(업로드·분석·생성 완료) 한 번 올린다. 올리기 실패 시 저장 완료로 표시하지 않고 알린다
- 409(다른 창·다른 기기에서 먼저 고침): 덮어쓰지 않는다. 지금 화면 내용을 **별도 사본 문서로 보존**하고
  사용자에게 알린다(09-17 설계 §5.2 와 같은 원칙)
- 이전 버전: 문서당 **최근 20개**만 남긴다(그 이상은 오래된 것부터 삭제). 이전 버전만 쓰던 자산은 지금은
  지우지 않는다(정리는 후속)

### 4.6 「과정 보기」·이관·옛 작업

- 라이브러리 상세페이지 작업의 「과정 보기」(`works-tab.tsx` → 지금은 보기 전용 `/library/works/[id]`):
  그 항목의 `source_id` 가 **내 `pdp_documents.id`**(또는 `source_draft_id`)와 맞으면 `/create?doc=<id>` 로
  도구를 연다. 아니면 지금의 보기 전용 화면(옛 작업)
- `/create?doc=<id>`: 서버 문서를 불러와 `handleLoadDraft` 와 같은 상태 채우기 경로로 모든 단계를 연다
  (`handleLoadDraft` 의 채우기 블록 `:645-708` 재사용 — 그 함수 자체는 바꾸지 않는 쪽을 먼저 찾는다)
- 고친 결과는 **같은 문서**에 이어서 저장, 생성 그림은 기존 라이브러리 동기화(`library-sync`)가 같은
  `source_id` 항목을 갱신한다 — 섹션 id 를 보존해야 같은 항목으로 판단된다(`library-sync-plan.ts:86-129`)
- 이관: 플래그가 켜진 뒤 사용자가 IndexedDB 의 작업을 **열면** 서버로 올린다(`source_draft_id` 로 중복 방지).
  브라우저 사본은 바로 지우지 않는다(30일 규칙대로 자연 정리). 목록은 「서버 작업 + 아직 안 옮긴 이 브라우저 작업」
- 옛 작업(서버 문서도, 이 브라우저 초안도 없음): 지금처럼 결과만 보기. 「이 작업은 과정이 저장되기 전에
  만들어졌습니다」를 보여 준다(이미 문구 있음, `detail-client.tsx:148-156`)

### 4.7 보안 (이번 세션에서 실제로 겪은 것)

- 소유는 **세션의 user_id** 로 강제한다. 본문의 user_id·문서 id 로 남의 것을 건드릴 수 없어야 한다
- 회원 JWT 의 직접 쓰기 차단(revoke) — 기존 `character_views`·`library_*` 는 회원이 `path` 를 남의 경로로
  써서 서비스 롤 서명·삭제를 유도할 수 있는 틈이 있었다(별건, §9.3). 새 표는 처음부터 막는다
- 서비스 롤로 Storage 를 만지기 직전 경로를 **화이트리스트로** 검사한다: 첫 칸 소유자, 각 칸
  `/^[\w-]+(\.[\w-]+)*$/` (`.`·`..`·빈 칸·`%`·탭·`?`·`#`·`\` 거부). 선례 `apps/web/lib/character-carry.ts`
  의 `isOwnedPath` — storage-js 는 경로를 인코딩하지 않고, URL 해석이 탭을 지우고 `%2e%2e` 를 접는다
- 서명 URL 은 짧은 수명. 문서 JSON 에는 경로만 둔다(서명 URL 저장 금지 — 1시간 뒤 깨짐)

### 4.8 처음 만들기 경로 — 0줄 변경 (사용자 지시)

끝에 `git diff` 로 0줄 증거를 보인다. 대상:

- `PdpMakerClient.tsx`: `handleAnalyze`(:919-1028), `handleTextModeComplete`(:1034-1070)
- `TextModeFlow.tsx`: `handlePlan`(:166), 대표이미지(:223), 확정·승인(:241-257)
- `PdpEditor.tsx`: `generateSectionImage`(:1638), `handleGenerateImage`(:1747), `handleGenerateAllMissing`(:1795),
  `pageWire`(:1599), `librarySyncFields`(:1631)
- `analyze-request.ts:56`, `page-wire.ts:51`
- 라우트 `api/pdp/analyze`·`analyze/progress`·`plan-from-text`·`key-visual`·`images`·`images/batch`·`library-sync`,
  `lib/pdp/request.ts`, `packages/pdp-core/src/pdp.service.ts`

판단이 같아야 하는 로직은 복제하되 처음 만들기와 나란히 비교하는 시험으로 묶는다.

## 5. 범위 밖

- 리디자인 서버 저장(다음 작업 — 원본 파일·PDF 보관 설계 필요)
- 화면 내부의 v3 전면 전환(B안), 작업 큐·워커 실행기(09-17 §8.2~8.4)
- 기존 `character_views`·`library_*`·`style_references` 의 경로 보안 틈(§9.3 — 사용자가 따로 리뷰)
- 브라우저 초안 일괄 업로드·삭제, 보관 기간 단축

## 6. 구현 순서 (단계마다: 설계·코드 재확인 → 시험 먼저 → 구현 → 독립 리뷰 → 다음)

| 단계 | 내용 | 끝났다는 증거 |
|---|---|---|
| S1 | 마이그레이션 SQL 작성(로컬 Supabase 또는 SQL 시험으로 검증), 서버 저장소 계약 + Supabase/로컬 구현 | 소유·409·revision 20개 정리·남의 id 404 시험 |
| S2 | `/api/pdp/documents*` 라우트, 자산 서명 업로드 발급, 경로 화이트리스트 | 라우트 시험(400/404/409, base64 섞인 문서 거부, 경로 변조 거부) |
| S3 | 클라이언트 서버 저장소(창구 인터페이스 그대로) + 자산 분리·복원, 플래그 `PDP_SERVER_DOCUMENTS` | 같은 입력 → 저장 → 다른 「브라우저」(빈 IDB)에서 불러와 v2 레코드가 같음(그림 바이트 포함) |
| S4 | `/create?doc=` 진입, IDB → 서버 이관(열 때) | 이관 후 브라우저 사본 유지·중복 이관 없음 시험 |
| S5 | 라이브러리 「과정 보기」 → 서버 문서면 도구, 아니면 보기 전용. 관리자 보기·복사 | 화면 배선 시험 + 로컬 브라우저 확인 |
| S6 | 전체 확인: 처음 만들기 0줄 증거, `tsc`·`eslint`·`vitest` 전체, 로컬 화면 확인, 최종 독립 리뷰 | 명령 출력 |
| S7 | 배포: 마이그레이션은 사용자가 실행, 플래그 끈 채 배포 → 운영 확인 → 플래그 켜기 | `docs/DEPLOY.md` 「매 배포」 절차 |

## 7. 합격 기준

- 회사 PC 에서 만든(또는 만드는 중인) 작업을 집 PC 에서 라이브러리 「과정 보기」로 열면 입력~편집 모든 단계가
  결과물과 함께 열리고, 문구를 고쳐 한 섹션을 다시 생성할 수 있다. 결과는 같은 작업에 저장되고 라이브러리
  그림도 바뀐다
- 두 창에서 같은 작업을 고치면 늦게 저장한 쪽이 덮어쓰지 않고, 사본이 남고 알림이 뜬다
- 다른 회원의 문서 id·경로로는 읽기·쓰기·삭제가 전부 404/거부
- 플래그를 끄면 지금과 똑같이 동작한다
- 처음 만들기 경로 0줄 변경(§4.8), 전체 시험 실패 0

## 8. 시험 원칙 (이 저장소에서 겪은 것)

- 소스 문자열만 찾는 시험은 아무것도 안 잡고 통과한 적이 두 번 있다 — **값으로 재고, 고장 내 본다**
  (수정을 되돌려 시험이 실패하는지 확인 → 복원)
- 비동기 훅 시험은 한 번의 `act` 로 다 안 풀릴 수 있다 — 비우기 도우미를 쓰되 단언을 약하게 하지 않는다
- vitest 에서 `mockRejectedValue` 가 처리 전 거절로 잡힌 적이 있다 — `mockRejectedValueOnce` 나 지연 throw
- 원격(Supabase) 분기는 가짜 클라이언트로 호출 인자(필터·경로·본문·contentType)를 단언한다

## 9. 다른 작업과의 조율 (2026-10-02 현재)

### 9.1 다른 터미널 — 상세페이지 400 진단 (`fix/pdp-request-diagnose`)

- 워크트리 `.worktrees/pdp-400-diagnose`, 커밋 `a8aae23f fix(pdp): 요청 형식 거절 때 어느 칸인지 서버에 남긴다`
  (`apps/web/lib/pdp/request.ts` +13, 시험 1개). 이미지 생성이 「요청 형식이 올바르지 않습니다」로 거절된 원인 진단
- 미커밋 임시 진단 시험 7개(`tmp-*.test.ts`: 사진·글 경로 요청 몸통 행렬, 편집 상태, **초안 저장 v2/v3 갈림** —
  「v3 로만 저장된 작업은 라이브러리(listPdpDrafts, v2 전용)에 안 보인다」)
- **겹치는 곳**: `lib/pdp/request.ts`(처음 만들기 쪽 — 이 작업은 건드리지 않음), 초안 저장 v2/v3 동작(이 작업의 S3·S4).
- **순서**: 400 수정은 운영 버그라 **먼저** 끝내고 master 에 넣는다. 이 작업은 그 뒤 master 를 기준으로 시작하고,
  진단 시험이 밝힌 v2/v3 갈림을 S3 설계에 반영한다. 두 작업을 같은 PR 에 섞지 않는다

### 9.2 캐릭터 「과정 보기」 (끝, 미커밋)

- 워크트리 `.worktrees/double-shell`, 브랜치 `fix/double-studio-shell`(origin/master `1dee226b` 기준), **커밋 안 됨**(사용자 규칙)
- 내용: `/library/works/[id]`·`/characters/[id]` 셸 중복 제거(+전체 페이지를 훑는 시험), 캐릭터 도구를 과정 보기로 열기,
  `POST /api/characters/[id]/carry`, `listCharacters({ ids })`, `isOwnedPath` 화이트리스트
- **이 작업과 닿는 곳**: `/library/works/[id]/page.tsx`(S5 가 여기를 바꾼다) — 캐릭터 브랜치가 먼저 들어가면 그 위에서,
  아니면 그 셸 수정을 놓치지 않게 확인
- 설계 `docs/superpowers/specs/2026-10-02-reopen-work-in-tool-design.md` 의 「2단계 — 브라우저 초안 연결」은
  **이 문서로 대체**된다(사용자가 서버 저장으로 방향을 정함)

### 9.3 기존 보안 틈 (별건, 사용자가 이 작업 뒤 따로 리뷰)

`character_views`·`library_items`·`library_images`·`style_references` 의 경로 칸을 회원이 직접 써서 서비스 롤
서명·다운로드·삭제를 유도할 수 있다(저장소 기준 HIGH, 운영 미확인). 이 작업에서 고치지 않는다. 새 표만 처음부터 막는다.

### 9.4 운영 상태 메모

- 운영은 2026-10-02 기준 hotfix 브랜치 릴리스로 돈다(master 와 다를 수 있음). 배포 전 운영 `current` sha 와
  기준 브랜치 관계를 확인한다. 다른 터미널의 master 머지·마이그레이션이 섞였으면 멈추고 사용자에게 묻는다
- 마이그레이션은 사용자가 Supabase SQL 편집기에서 직접 실행해 왔다. Claude/Codex 는 운영 DB 에 직접 접근하지 않는다

## 10. 확인 못 한 것 (구현 전에 확인)

- 운영의 `PDP_DOCUMENT_V3` 값, 현재 인스턴스 타입
- Supabase 요금제의 Storage 용량·전송량 한도(사용자 원칙: 추가 과금 회피 — 넘을 듯하면 먼저 보고)
- 운영에서 `source_id` 가 초안 id 인 상세페이지 작업 수(과정 보기로 열 수 있는 비율)
- supabase-js 서명 업로드 API 의 현재 시그니처(context7)

## 11. 사용자와 일하는 규칙 (요약)

- **한국어**로 답한다. 결론을 첫 문장에. 기술 용어 대신 쉬운 말과 비유. 사용자는 비개발자다
- 커밋·푸시는 **사용자가 요청할 때만**. 기본 브랜치에서 작업하지 않는다(워크트리·브랜치)
- 3개 파일 이상·DB·API 변경은 **계획 먼저, 승인 뒤 코드**. 매 단계 시작 전 설계 문서·현재 코드 재확인
- TDD, 실패를 먼저 보고, 고장 내 보기로 시험을 검증. 「통과했다」는 그 메시지에서 돌린 명령 출력으로만 말한다
- 처음 만들기 경로 0줄 변경(§4.8). 요청 밖 개선 금지, 인접 코드 정리 금지
- 범위 밖 문제를 발견하면 **한 번 짧게 보고하고 기록한 뒤 본 작업을 계속**한다(결정 질문으로 멈추지 않는다)
- 사용자 계정의 것(릴리스·아티팩트·서버 파일)을 지우기 전에 반드시 묻는다. 배포는 `docs/DEPLOY.md` 를 열어서 한다
- 화질은 타협하지 않는다(그림 재인코딩·축소본으로 복원하지 않는다 — 원본 바이트를 보관)
