# Fixup Image Agent

상세페이지 · 리디자인 · 카드뉴스 · 포스터를 한 곳에서 만든다.
`detail-page-studio` 를 씨앗으로 복제했으나 이후로는 별개 제품이다. 원본을 참조하지 않는다.

> **현재 쓰는 최신 상세페이지 시스템입니다.** (저장소 생성 2026-07-21)
> 한이룸 상세페이지 도구 **2건**(`redesign-maker-10` + `pdp-maker-201`)을 하나로 통합한 것으로,
> 이전의 두 저장소를 대체합니다. 상세페이지 작업은 여기서 합니다.

한국 이커머스 셀러를 위한 **AI 상세페이지 통합 플랫폼**. 두 도구를 하나의 앱으로 합쳤습니다.

- **새로 만들기 (`/create`)** — 상품 사진 한 장 **또는 글만으로** 상세페이지를 새로 생성
- **리디자인 (`/redesign`)** — 기존 상세페이지(이미지/PDF)를 분석해 전환율 중심으로 개선 (OpenAI / Gemini + RAG)

이 시스템의 값어치는 이미지가 아니라 **팔리는 구조를 설계하는 것**에 있습니다. 구성안은 판매 원칙에 비추어 별도 심사를 거치고, 미달이면 다시 만듭니다.

원본 두 프로젝트(`redesign-maker-10`, `pdp-maker-201`)의 **백엔드 로직은 보존**하고, **프론트엔드는 공통 디자인 시스템으로 통합**했습니다.

## 작업 흐름 (`/create`)

두 갈래로 시작합니다.

```
이미지로 시작:  사진 업로드 ─┐
                            ├→ 구성 시나리오 → 대표 이미지 → 섹션 생성 → 편집 · 내보내기
텍스트로 시작:  글 입력 ────┘
```

**텍스트로 시작**은 사진이 없는 무형 상품·서비스를 위한 경로입니다. 되묻지 않고 진행하되, AI가 지어낸 부분은 시나리오 화면에 그대로 보여줍니다.

이미지를 만들기 전에 **구성 시나리오**를 문서처럼 읽고 고칠 수 있습니다. 여기서 고친 내용이 그대로 이미지에 반영됩니다.

### 편집기

- **갤러리** — 만든 섹션을 격자로 한눈에 검토. 카드 크기 3단계
- **이어보기** — 세로로 이어 붙여 실제 상세페이지 모습 그대로 확인
- **크게 보기** — 카드를 누르면 모달. `←` `→` 이동, `Esc` 닫기
- **섹션 순서 변경 · 추가 · 삭제** — 레이어는 섹션 고유 키로 저장되어 순서를 바꿔도 따라옵니다
- **내보내기** — 현재 섹션 1장 또는 전체 ZIP

## 품질 장치

### 구성안 심사

구성안을 만든 호출과 **다른 호출**로 심사합니다. 같은 호출 안에서 매기는 점수는 방금 쓴 글을 스스로 칭찬하는 것에 가깝습니다.

심사자에게는 구성안과 판매 원칙만 줍니다. 브리프 원문은 주지 않습니다 — 주면 "이 브리프로는 이 정도면 잘 쓴 것"이라는 변호를 합니다. 사는 사람은 브리프를 못 봅니다.

항목은 여섯입니다: **대상 · 문제 · 차별점 · 반론 · 흐름 · 행동 유도**. `fail`이 하나라도 있으면 지적사항을 담아 다시 만듭니다(최대 2회). 끝까지 남은 지적은 **숨기지 않고 화면에 띄웁니다.**

판매 원칙은 `packages/pdp-core/src/pdp.sales-principles.ts`가 단일 출처입니다.

### 스타일 레퍼런스

레퍼런스 이미지 한 장이 그 페이지 전체의 디자인 언어(색·서체·구성)를 정합니다. 효과가 세기 때문에 두 가지를 지킵니다.

- **페이지당 한 장**만 씁니다. 섹션마다 다르면 섹션 간 통일이 깨집니다.
- 어울리는 것이 없으면 **아무것도 쓰지 않습니다.**

고르는 것은 유사도 검색이 아니라 LLM입니다. 질의는 상품 얘기인데 레퍼런스 서술은 디자인 얘기라 임베딩으로는 변별되지 않습니다(측정 근거: `docs/superpowers/specs/2026-07-27-style-reference-rag-design.md`).

등록은 세 갈래입니다 — 업로드(`POST /api/pdp/style-references`) / 미리 넣은 견본 8종 / 갤러리의 "레퍼런스로 저장".

### 이미지 모델 선택

생성은 fal.ai를 경유하고 세 모델 중 고릅니다. 원가가 4.6배까지 벌어져 크레딧 가중치를 둡니다.

| 모델 | 가중치 | 한 묶음 | 특징 |
|---|---|---|---|
| GPT Image 2 (기본) | 4 | 3장 | 글자가 가장 정확. 명조 계열도 표현 |
| Nano Banana Pro | 3 | 6장 | 빠름. 글자는 고딕 계열 |
| Nano Banana | 1 | 6장 | 가장 저렴. 글자가 적은 장면에 |

섹션 이미지는 한 장씩이 아니라 **묶음으로 한 번에** 만듭니다. 순차 호출은 장마다 크레딧을 예약해 동시 실행 제한에 스스로 걸렸습니다. 묶음 크기가 모델마다 다른 이유는 서버리스 함수 상한(300초)입니다 — GPT는 6장에 288초가 걸려 상한에 닿습니다.

## 구조 (pnpm 모노레포)

```
apps/web/                통합 Next.js 프론트엔드 + 얇은 API 어댑터 (단일 배포 대상)
  app/                   홈 · /create · /redesign · /library · /settings
                         /login · /signup · /demo · /admin
  app/api/pdp/*          → @fixup/pdp-core 위임
  app/api/redesign/*     → @fixup/redesign-core 위임
  lib/membership/        회원 권한 · 월 이미지 크레딧 · API 게이트
  lib/supabase/          브라우저/SSR/서버 전용 Supabase 클라이언트
  lib/library.ts         두 IndexedDB 저장소 통합 조회
packages/pdp-core/       pdp-maker 백엔드 (텍스트 진입·심사·이미지 제공자)
  pdp.text-plan.ts       글 → 판매 브리프 → 구성안 (+ 심사 루프)
  pdp.review.ts          구성안 심사 (6항목 · 재생성 판단)
  pdp.sales-principles.ts 판매 원칙 단일 출처
  pdp.image-provider.ts  fal.ai 3종 모델 어댑터 · 크레딧 가중치
  pdp.style-reference.ts 레퍼런스 분석·선택 규칙 (DB 를 모른다)
  pdp.style-picker.ts    LLM 이 레퍼런스를 고른다
packages/redesign-core/  redesign 백엔드 + 저장소 (RAG·지식·스타일)
  rag.ts                 pgvector 지식 저장소 (kind: sales | redesign)
  style-store.ts         스타일 레퍼런스 저장소
packages/ui/             공통 디자인 시스템 (Tailwind v4 + shadcn, 다크모드)
packages/shared/         교차 타입 (통합 설정·라이브러리)
```

설계·구현 문서: `docs/superpowers/specs/`, `docs/superpowers/plans/`

## 개발

```bash
corepack enable pnpm      # pnpm 활성화 (최초 1회)
pnpm install
pnpm dev                  # http://localhost:3000
```

기타: `pnpm -r typecheck`, `pnpm build`

## 회원·사용량·API 키

- Supabase 이메일 인증 후 관리자가 승인한 회원만 생성 도구에 접근합니다.
- migration의 현재 기본 한도는 매월 1일 KST 기준 이미지 30장이지만, 운영 적용 전 최종 숫자를 확정해야 합니다. 성공한 이미지 결과만 차감됩니다.
- Gemini/OpenAI/fal 키는 EC2의 root 소유 환경파일에만 둡니다. 회원의 브라우저 키 입력과 전송 경로는 없습니다.
- 이미지 크레딧은 모델별 가중치(4 / 3 / 1)로 차감됩니다. 묶음 생성은 한 번에 예약하고, **성공한 장수만** 차감합니다.
- `/settings`는 계정 상태와 이번 달 사용량을 보여줍니다.
- 작업 초안과 결과는 1차에서 IndexedDB에 유지되므로 현재 브라우저에만 존재합니다.

DB migration은 `supabase/migrations/`, 환경변수는 `apps/web/.env.example`, 실제 운영 연결 순서는 `docs/MEMBERSHIP_DEPLOYMENT.md`를 참고합니다.

## 배포

다음 운영 배포는 **가비아 A 레코드 → EC2 Elastic IP → Caddy(80/443) → Next.js standalone(127.0.0.1:3000)** 구조입니다. 회원 DB/Auth는 Supabase, 기존 리디자인 RAG는 Neon을 그대로 사용하며 EC2에 DB를 추가하지 않습니다.

EC2용 런타임은 Linux에서 생성합니다. Windows 로컬은 pnpm/Next standalone의 심볼릭 링크와 Linux native runtime 차이 때문에 검증용 `pnpm build`만 사용합니다.

### 절차

`main`에 머지하면 `.github/workflows/build-ec2-release.yml`이 배포 꾸러미를 자동으로 만듭니다. 그것을 받아 호스트에서 풀면 끝입니다.

```bash
gh run download <run-id> --dir ./release
scp release/.../detail-page-studio-<sha12>.tar.gz ubuntu@<host>:/tmp/
ssh ubuntu@<host> 'sudo bash deploy/ec2/deploy-release.sh /tmp/detail-page-studio-<sha12>.tar.gz <sha12>'
```

배포 스크립트가 기동을 확인하고, 실패하면 **직전 릴리스로 자동 롤백**합니다. 수동 롤백은 `deploy/ec2/rollback-release.sh`.

### 꾸러미가 이식 가능해야 하는 이유

`dist/ec2`에는 standalone 서버, workspace 런타임 의존성, `public`, `.next/static`만 모이며 로컬 `.env*`는 제거됩니다.

한동안 이 꾸러미는 **빌드한 기계에서만** 돌았습니다. pnpm이 만든 `node_modules` 심볼릭 링크가 빌드 머신의 절대 경로를 가리켰기 때문입니다. 2026-07-28 운영 배포에서 `Cannot find module 'next'`로 죽고 롤백된 뒤에야 드러났습니다.

지금은 `scripts/prepare-ec2-release.mjs`가 그 링크를 **상대 경로로** 바꿉니다. 링크 구조 자체는 유지해야 합니다 — pnpm은 그 구조로 모듈을 해석해서, 실제 파일로 풀어버리면 `next`는 찾아도 그 옆의 `styled-jsx`를 못 찾습니다.

빌드 중에 검사가 돌아, 링크가 하나라도 꾸러미 바깥을 가리키면 **거기서 멈춥니다.** 배포해 봐야 아는 실패를 막기 위한 것입니다.

### 운영 환경변수

호스트의 `/etc/detail-page-studio/app.env`(root 소유, `640`)에서만 읽습니다. systemd `EnvironmentFile`로 주입되며 꾸러미에는 들어가지 않습니다.

이미지 생성에는 **`FAL_KEY`가 반드시 있어야 합니다.** 없으면 생성이 전부 실패합니다. `DATABASE_URL`·`OPENAI_API_KEY`는 지식·스타일 레퍼런스 저장소용으로, 없으면 그 기능만 조용히 꺼지고 생성은 계속됩니다. 템플릿은 `deploy/ec2/app.env.example`.

systemd·Caddy·배포/롤백 자산은 `deploy/ec2/`, 전체 순서는 `docs/MEMBERSHIP_DEPLOYMENT.md`를 참고합니다.

### 현재 상태

**운영은 EC2입니다.** 저장소에 연결된 Vercel 프로젝트는 구버전이며 운영이 아닙니다 — 환경변수가 일부만 있어 인증도 동작하지 않습니다. PR 체크에 Vercel이 뜨더라도 배포 판단 근거로 삼지 마십시오.

## 참고

소스 코드의 모델 ID(`gpt-image-2`, `gemini-3.1-pro-preview`, `fal-ai/nano-banana-pro` 등)는 실제로 접근 가능한 것들입니다. 동작은 키/모델 접근 권한에 의존합니다.

설계 문서는 `docs/superpowers/specs/`에 있습니다. 구현 중 측정으로 뒤집힌 설계는 문서에 이유와 함께 남겨 뒀습니다 — 특히 **작고 전부 필요한 지식은 검색(RAG)하지 말고 프롬프트에 통째로 넣어야 한다**는 것이 두 번 확인됐습니다.
