# 상세페이지 개선 — Claude Code 2차 리뷰 인계

작성: 2026-10-02. 대상은 **미커밋 로컬 코드**다. 운영 적용 완료 문서가 아니다.

## 1. 검토할 위치와 기준

- 최종 작업 공간: `C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-server-documents`
- 브랜치: `feat/pdp-server-documents`
- 기준 HEAD: `a8aae23f097cd916ee97cfde9d5e8db6e9cc4329`
- 생성 개선의 비교 사본: `C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-remediation`
- 메인 체크아웃과 다른 터미널의 작업 공간은 검토 대상이 아니다.
- **새 구현 대부분이 untracked다. `git diff`만 보면 빠진다.**
  `git status --short`와 `git ls-files --others --exclude-standard`를 함께 확인한다.
- 같은 폴더의 `2026-10-02-pdp-review-code-manifest.json`에 검증한 코드 파일의 SHA-256을 적었다.

원 인계 문서 두 개는 아직 해당 작업 공간에서 직접 읽어야 한다.

1. `C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-400-diagnose\docs\superpowers\specs\2026-10-02-pdp-image-400-handoff.md`
2. `C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\double-shell\docs\superpowers\specs\2026-10-02-pdp-server-documents-codex-handoff.md`

재리뷰 계약과 검증 기록:

- `docs/superpowers/plans/2026-10-02-pdp-server-documents-review-gates.md`
- `docs/superpowers/plans/2026-10-02-pdp-remediation-progress.md`
- `docs/superpowers/plans/2026-10-02-pdp-remediation-validation.md`

## 2. 사용자가 요청한 범위

생성 요청 오류 5건을 먼저 고치고, 그 뒤 상세페이지의 과정 전체를 서버에 저장해
다른 브라우저에서 열고 수정·재생성하게 한다. 각 단계에서 실패 재현, 수정, 직접 리뷰,
검증을 거쳤다. 이후 발견한 범위 내 결함도 아래와 같이 추가 수정했다.

캐릭터의 별도 작업, 리디자인 서버 저장, 기존 library/character/style-reference 테이블의
경로 보안 문제, 기존 IndexedDB 자산 청소는 이번 변경에 섞지 않았다.
커밋·푸시·병합·배포·운영 DB 적용도 하지 않았다. 독립 2차 리뷰는 지금 Claude Code에 요청한다.

## 3. 생성 오류 5건

| 번호 | 바뀐 동작 | 주요 구현 | 주요 검증 |
|---|---|---|---|
| G1 | 장면 설명이 비면 영어 → 한국어 → 제목 → 섹션 이름 → 기본 장면 순서로 복구한다. 사진/글 기획·편집 병합·최종 프롬프트가 같은 규칙을 쓴다 | `packages/pdp-core/src/pdp.scene-prompt.ts`, `pdp.service.ts`, `pdp.text-plan.ts`, `pdp.image-prompt.ts`, `scenario-sections.ts` | `pdp.scene-prompt.test.ts`, 사진 기획/540조합 회귀 |
| G2 | 이미 저장된 초안의 빈칸·누락·공백도 단건/일괄/대표 이미지 요청을 통과시킨다. 잘못된 섹션 번호·타입은 계속 거절한다 | `apps/web/lib/pdp/request.ts`, 생성 코어 정규화 | `legacy-scene-request.test.ts`, `request-reject-log.test.ts`, 라우트 회귀 |
| G3 | 생성 전에 pageContext 500자 초과를 알려 준다 | `image-request-length.ts`, `PdpEditor.tsx`의 공통 검사 인자 | `image-request-length.test.ts`, 실제 편집기 단추 시험 |
| G4 | AI가 쓴 레퍼런스 서술을 분석 결과와 요청 입력 양쪽에서 2,000자 이내로 맞춘다 | `pdp.style-reference.ts`, `request.ts` | `style-description-limit.test.ts`, 기존 스타일 시험 |
| G5 | conceptOnly가 화면 판단 → 요청 → 옵션 조립 → 모델 지시까지 전달된다 | `pdp.image-options.ts` | `pdp.concept-only.test.ts`, 글 280조합 회귀 |

대표 이미지는 원래 브리프의 결과·톤에서 브랜드 분위기를 만든다.
`buildKeyVisualPrompt`는 첫 섹션의 장면을 쓰지 말라는 기존 설계이므로 그 동작을 유지했다.
빈 prompt_en을 가진 대표 이미지 입력도 실제 함수 호출까지 검증했으며,
이를 섹션 장면을 대표 이미지에 주입하도록 바꾸지는 않았다.

93바이트 400을 재현한 결함은 확인했지만, 당시 운영 모델 응답이 없으므로 당시 사건의
유일한 원인이었다고 단정하지 않는다. `a8aae23f`의 거절 필드 로그는 남겨 두었다.

## 4. 서버 저장 구현

| 단계 | 구현 내용 | 중심 파일 |
|---|---|---|
| S1 | 소유권, 사용자별 이관 중복 방지, 버전 비교·이전 본 저장·갱신을 한 SQL 함수에서 처리. 요청 재전송 확인, 이전 버전 20개, 삭제 표시 | `supabase/migrations/202610030001_pdp_documents.sql`, `lib/pdp/documents/{repository,local-repository,supabase-repository}.ts` |
| S2 | 문서 생성/목록/읽기/저장/삭제, 업로드 서명, 버전 목록/복원 API. 인증 먼저, 본문 크기·구조·소유 경로·업로드 상태 검사 | `lib/pdp/documents/{model,http,storage,index}.ts`, `app/api/pdp/documents/**` |
| S3 | v3 구조의 이미지 칸을 파일 참조로 치환. 같은 바이트 중복 업로드 방지, 원본 바이트·MIME·편집 상태·텍스트 중간 상태 복원 | `app/create/server-document-codec.ts` |
| S4 | 기존 저장 창구 뒤에 서버 구현 연결. 사용자가 연 초안만 이관, v2/v3 최신 사본 선택, 충돌 시 별도 사본과 주소 전환, 전 단계 버전 복원 | `server-draft-repository.ts`, `draft-repository.ts`, `PdpMakerClient.tsx`, `ServerDocumentHistory.tsx` |
| S5 | 확정 저장된 문서를 라이브러리 표시의 정본으로 사용. 그림 없는 초안도 표시. 기존 이미지 선택기·다운로드·과정 보기·관리자 복사·게시 연결 | `library-adapter.ts`, `document-works.ts`, `server-library.ts`, `library.ts`, `works-tab.tsx`, `publication.ts` |
| S6 | 두 브라우저 왕복, 원본 바이트, 실제 편집기 재생성 단추, 복원, SQL, 기존 기능 회귀, 처음 만들기 보호 경계 검사 | `scripts/tests/pdp-documents-browser.mjs`, `pdp-documents-sql.test.mjs`, `pdp-server-boundary.mjs` |

경로의 `lib/`·`app/`은 `apps/web/` 아래다.

저장 형식은 schemaVersion 3의 저장용 봉투다. 자산 목록과 나머지 v3 필드(body)를 분리한다.
기존 화면 상태 전체를 새로운 모델로 바꾸지는 않았다. 서버 문서가 관리하는 결과는
문서의 저장 버전이 정본이며, 기존 비동기 생성 완료 순서로 library_images를 덮지 않는다.
기존 라이브러리 읽기 API에도 문서를 반영해 참조 이미지 선택·내려받기가 빠지지 않게 했다.
이관 전 라이브러리 결과 행은 파괴하지 않고 중복 표시를 걸러 낸다.

새 버킷은 비공개 `pdp-documents`다. 키는 사용자/문서/그림 해시로 서버가 만든다.
업로드는 원격에서는 브라우저가 Storage에 직접 보내고, 로컬에서만 별도 파일 API를 쓴다.
저장할 때는 파일의 존재·크기·MIME를 확인하고, 내려받아 복원할 때는 SHA-256과 바이트 길이도 확인한다.
원본을 축소하거나 재인코딩하지 않는다.

## 5. 마지막 재리뷰에서 추가 수정한 14건

| 번호 | 재현한 문제 | 수정 및 시험 |
|---|---|---|
| R1 | 이관 중 문서 번호만 만들어지고 본문 저장이 실패하면 재열기가 막힘 | 미완료 문서는 남아 있는 로컬 원본으로 이관 재개. `server-draft-repository.test.ts` |
| R2 | 충돌 사본 저장 응답이 유실되면 재시도 때 새 사본이 또 생김 | 같은 사본 ID·요청을 재사용. 같은 시험 |
| R3 | 늦게 도착한 일반 읽기 응답이 저장소의 마지막 버전을 과거로 되돌림 | 읽기·저장·보관·복원·삭제를 같은 창의 순서로 처리. 같은 시험 |
| R4 | 복원은 성공했지만 응답/서명이 실패하고 대상 과거 버전이 정리되면 재시도 불가 | 복원 요청 ID·대상 버전 유지, 이미 완료된 복원을 먼저 확인. 변경된 재사용 요청은 거절. 클라이언트 및 API 시험 |
| R5 | 같은 버킷이 이미 public=true로 있으면 SQL이 그대로 둠 | 충돌 시에도 비공개·크기·MIME 정책을 설정. 기존 공개 버킷을 넣은 실제 SQL 시험 |
| R6 | SDK의 HTTP status만 있는 404를 저장소 장애로 취급 | status/statusCode 404를 함께 지원. 403은 성공으로 넘기지 않음. `storage.test.ts` |
| R7 | 파일 삭제가 진행되지 않아도 같은 목록을 무한 반복 | 반복 파일 감지 및 요청당 정리 횟수 제한, 실패를 명시. 같은 시험 |
| R8 | 로컬 업로드 본문을 받는 동안 문서를 지우면 삭제 후 파일 쓰기 가능 | 본문 수신 후 문서 상태 재확인. `local-file-route.test.ts` |
| R9 | 관리자 복사는 완료됐는데 응답 유실 후 원본이 삭제/정리되면 재확인 불가 | 이미 완성된 내 복사본을 먼저 확인. `admin.test.ts` |
| R10 | 복사 성공 응답만 믿고 대상 파일이 없는 문서를 확정할 수 있음 | 복사 대상 파일 확인 후 문서 저장. 같은 시험 |
| R11 | 같은 그림을 상품·인물로 쓰면 한쪽 파일 이름으로 합쳐짐 | 바이트는 공유하되 역할별 이름은 별도 메타데이터로 보존. `server-document-codec.test.ts` |
| R12 | 외부 doc/draft URL에 내부 @revision 명령을 넣으면 열기만으로 복원 실행 | 공개 진입 주소 검증. 복원은 확인된 화면 동작에서만 실행. `server-document-ui.test.tsx`, 실제 브라우저 시험 |
| R13 | 너무 깊은 JSON은 재귀 검증기에서 503 발생 | 스키마 검증보다 먼저 깊이 제한, 400 거절. `api.test.ts` |
| R14 | toString/constructor/__proto__ 같은 상속 속성을 실제 자산으로 오인 | 실제 소유 키만 확인, 복원 자산 사전은 prototype 없는 객체 사용. 같은 시험 |

추가로 16MB를 넘는 초안이 100KB 미만의 문서와 별도 파일로 나뉘는 시험도 통과했다.
위 수정은 새 저장 경로의 결함 보완이며 기존 별건 보안·리디자인 작업을 확장한 것이 아니다.

## 6. 최종 검증 결과와 한계

- 웹 전체: **557파일 통과, 3파일 건너뜀 / 6,666개 통과, 38개 건너뜀, 실패 0**.
- pdp-core 전체: **60파일 / 1,153개 통과**, 실패 0.
- 실제 PostgreSQL 엔진(PGlite 0.5.8): 권한·충돌·버전·삭제·기존 공개 버킷 비공개화 통과.
- 실제 브라우저: **9건 통과**. 마지막 항목은 잘못된 열기 URL이 서버 버전을 바꾸지 않는지 확인한다.
- 타입 검사 및 lint: 오류 0. 기존 lint 경고는 별도다.
- 보호 경계: **12개 파일·7개 함수 동일**.
  이는 생성 개선 검증 사본 이후 서버 저장 작업의 변경량이다.
  HEAD a8aae23f와 비교하면 생성 오류를 고친 변경은 당연히 존재한다.
- 원본 수정 제거 시 실패하는 변이 시험을 생성 수정, SQL 버전, 경로 검사와
  추가 사본 재시도·역할별 이름·URL 진입·깊이 제한·자산 소유 키 검사에서 수행했다.

브라우저의 이미지 제공자는 시험 응답이다. 최초 문서는 테스트용 클라이언트로 준비하고,
복원된 실제 편집기의 재생성 단추·버전 선택을 눌렀다. 브라우저 둘은 같은 로컬 회원이며,
타인 접근은 API/저장소/SQL 시험에서 따로 검증했다.
운영 Supabase·유료 AI·실제 운영 회원 데이터·Linux 배포 빌드는 검증하지 않았다.
직접 코드 리뷰 결과이며 독립 리뷰를 통과했다고 표현하지 않는다.

증거:

- `%TEMP%\pdp-claude-final-web.log`
- `%TEMP%\pdp-review-final-core.log`
- `%TEMP%\pdp-claude-final-lint.log`
- `%TEMP%\pdp-claude-final-evidence\results.json`, `browser-errors.json`, PNG 4개
- `%TEMP%\pdp-review-mutation-*.log`

브라우저 로그의 409는 충돌 시험, 삭제 후 404는 의도된 확인이다.
기존 AppShell/StudioLayout key 경고 및 운영 설정을 비운 로컬의 /api/showcase/manage 500은
별건으로 기록했다. 새로운 다른 오류가 생기면 이 설명으로 덮지 말고 조사해야 한다.

## 7. 재실행 명령 — Windows/PowerShell

새 터미널에서 실행한다. 브라우저 서버를 띄운 터미널의 LOCAL_STORE 등의 변수를
전체 단위 시험에 그대로 물려주지 않는다.

```powershell
$reviewRoot = 'C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-server-documents'
Set-Location $reviewRoot
git status --short
git diff --stat HEAD
git ls-files --others --exclude-standard

$env:PATH = 'C:\Program Files\Git\bin;C:\Program Files\Git\usr\bin;' + $env:PATH
Set-Location "$reviewRoot\apps\web"
& '..\..\node_modules\.bin\vitest.cmd' run
# 경로 검사의 부정 시험은 stderr에 '잘못된 주소'를 의도적으로 출력한다.
# 결과 요약과 종료 코드를 확인한다.
& '.\node_modules\.bin\tsc.cmd' --noEmit -p .
& '.\node_modules\.bin\next.cmd' lint

Set-Location "$reviewRoot\packages\pdp-core"
& '..\..\node_modules\.bin\vitest.cmd' run

Set-Location $reviewRoot
node scripts/tests/pdp-server-boundary.mjs
```

SQL 검증 도구는 저장소 밖에 설치한다. repo의 package.json/lockfile 변경은 필요 없다.

```powershell
Set-Location $reviewRoot
$pdpSqlTools = Join-Path $env:TEMP 'pdp-sql-check'
# 없다면 설치한다. 이번 검증은 0.5.8이었다.
npm install --prefix $pdpSqlTools --no-audit --no-fund @electric-sql/pglite@0.5.8
$pdpSqlModule = Join-Path $pdpSqlTools 'node_modules/@electric-sql/pglite/dist/index.js'
$env:PDP_PGLITE_MODULE = 'file:///' + $pdpSqlModule.Replace('\','/')
node --test scripts/tests/pdp-documents-sql.test.mjs
```

브라우저 검증용 별도 터미널:

```powershell
$reviewRoot = 'C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-server-documents'
Set-Location "$reviewRoot\apps\web"
$env:LOCAL_STORE='1'
$env:LOCAL_AUTH_BYPASS='1'
$env:PDP_SERVER_DOCUMENTS='1'
$env:PDP_JOBS_ENABLED='0'
$env:LOCAL_STORE_ROOT=Join-Path $env:TEMP 'pdp-claude-second-review-store'
& '.\node_modules\.bin\next.cmd' dev -p 3117
```

다른 터미널에서:

```powershell
Set-Location 'C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-server-documents'
$env:PDP_BROWSER_EVIDENCE=Join-Path $env:TEMP 'pdp-claude-second-review-evidence'
node scripts/tests/pdp-documents-browser.mjs
```

3117번이 이미 사용 중이면 다른 사람의 서버를 끄지 않는다.
새 포트와 PDP_BROWSER_ORIGIN을 맞춰 실행한다. Chromium 실행 파일은 설치된
Playwright 1.62.1이 찾는 것을 사용했다. 필요한 브라우저 설치는 검토 환경에서 확인한다.
Windows나 운영 EC2에서 배포 빌드를 하지 않는다.

## 8. 2차 리뷰에서 집중할 것

1. 원래 5개 결함이 코드·화면·서버를 실제로 통과하며 해결됐는가.
2. 입력/이미지/분석/텍스트 중간 기획/레이어/섹션 ID/비활성 첨부도 왕복 보존되는가.
3. 두 창, 저장 중 재열기, 응답 유실, 복원 중 저장, 이관 재시도에서 원본이 조용히 덮이지 않는가.
4. 생성 완료와 문서 저장·라이브러리 표시가 경쟁해 옛 결과를 다시 넣지 않는가.
5. 회원/관리자/복사본의 소유자 경계, 경로 변조, 잘못된 자산 참조, 직접 SQL 쓰기가 막히는가.
6. 플래그 off 기존 동작, 이미지 선택기·다운로드·게시·옛 과정 보기 링크가 유지되는가.
7. 기존 시험을 약화하거나 mocked 경로만 통과해 구현을 놓치지 않았는가.
8. 이 문서의 완료 주장에 반례가 있는가. 발견하면 심각도·파일/줄·재현·수정 방향을 적는다.

## 9. 운영 단계와 별도 범위

아직 커밋·푸시·master 병합·운영 SQL·배포를 하지 않았다.
SQL 파일은 사용자 승인 후 사용자가 운영에서 직접 실행한다.
`PDP_SERVER_DOCUMENTS=0`이 기본값이다. 실제 Storage/RLS/한도·전송량·현재 운영 SHA,
master와 진단 커밋의 관계를 확인한 뒤 활성화해야 한다.

다른 터미널의 캐릭터 작업은 미커밋 상태로 double-shell에 있다. 특히 라이브러리 과정 보기
주변을 통합할 때 그 변경을 놓치지 않는다. 진단 커밋의 로그도 빠뜨리지 않는다.

범위 밖: 리디자인 서버 저장, 기존 테이블 경로 보안, 이전 버전 전용 자산/중단 업로드의
고아 파일 정리, 기존 IndexedDB revisions/assets 청소. 삭제와 기존 업로드 서명 완료가 겹쳐
남는 고아 파일도 후속 정리 정책에 포함한다. 삭제된 문서는 재저장으로 되살릴 수 없게 했다.
이미 이관된 문서는 서버 정본을 읽는다. 양방향 오프라인 동기화 기능을 구현한 것은 아니다.

2차 리뷰 결과는 코드 수정 여부와 별도로 남긴다. 처음에는 원본 코드를 고치지 말고
독립 검토와 재현 시험을 진행한다. 수정이 필요하면 근거와 방향부터 사용자에게 보고한다.
