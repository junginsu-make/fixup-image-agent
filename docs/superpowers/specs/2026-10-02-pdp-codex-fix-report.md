# 상세페이지 서버 저장 — 2차 리뷰 수정 보고서

작성: 2026-10-03. 대상: `feat/pdp-server-documents`, 기준 HEAD `a8aae23f097cd916ee97cfde9d5e8db6e9cc4329`.
작업 공간: `C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-server-documents`.

## 상태

F1~F21 구현과 개별 RED → GREEN → 수정 제거 실패 → 복구 통과를 수행했다.
로컬 최종 검증 완료: 웹 6,701개, 코어 1,154개, SQL 1개, 실제 브라우저 11건 통과. 타입·lint 오류 0. 건너뛴 웹 시험 38개는 통과 수에 포함하지 않았다.
커밋·푸시·병합·배포·운영 SQL은 실행하지 않았다. 운영 활성화 승인을 뜻하지 않는다.

## 건별 변경과 결정

경로의 `app/`, `lib/`는 `apps/web/` 아래다. 정확한 현재 줄 번호·실행 출력은 아래 증거 절에서 기록한다.

| ID | 변경 | 중심 파일 및 시험 | 결정 |
|---|---|---|---|
| F1 | 일반 라이브러리 DELETE에서 문서 삭제 연결 제거. 이미지 선택창은 문서 표지의 휴지통을 숨김 | lib/server-library.ts, app/create/SavedImagePicker.tsx, saved-image-picker.ts; library-delete-boundary, saved-image-picker 시험 | 전체 삭제는 문서 전용 API에서만 |
| F2 | 화면이 읽은 serverRevision을 저장 입력과 함께 전달. 대기열 실행 중 읽은 버전으로 교체하지 않음. 읽기·복원 진행 중 자동저장 차단 | server-draft-repository.ts, PdpMakerClient.tsx, pdp-drafts.ts; 저장소/화면 F2 시험 | 같은 화면의 확인된 연속 저장만 버전을 연결하고 재열기·복원 시 연결을 끊음. 기존 잘못된 시험을 실제 두 창 충돌 시험으로 교체 |
| F3 | SQL의 저장된 summary 칼럼으로 목록을 조회. 관리자·출처 연결은 id/source_draft_id 조건 및 limit 1 사용 | migration, supabase-repository.ts, local-repository.ts, library-adapter.ts; 원격 저장소/어댑터/SQL 시험 | 요약은 generated stored 칼럼으로 계산해 직접 서비스 쓰기에도 본문과 일치. 목록 select에 document 없음 |
| F4 | 탈퇴 양쪽 경로에서 문서 숨김 → 본인 파일 정리 → 이전 버전·본문 정리. 실패 시 탈퇴 성공 금지 | membership/withdraw-pdp.ts, withdraw-account.ts; withdraw-pdp/withdraw-account 시험 | 기능 플래그와 무관하게 정리. 아직 설치 전인 표 없음(42P01/PGRST205)만 건너뜀 |
| F5 | 앱의 JSON 크기를 PostgreSQL jsonb 텍스트 기준으로 측정. SQL 과대 요청과 DB 크기 제약 오류는 413 | documents/model.ts, supabase-repository.ts, migration; document-size/SQL 시험 | 공백·UTF-8·지수 숫자의 십진 표기를 포함. 원본 이미지 화질과 무관한 메타데이터 한도 |
| F6 | 작업 불러오기 성공 시 undoDraftId 비움 | PdpMakerClient.tsx; 화면 F6 시험 | 복원·다른 문서 열기 모두 같은 초기화 경로 |
| F7 | 유실된 내 요청 ID가 서버 최신에 있으면 내 저장을 확인하고 이어 저장. 내용이 바뀌어도 미확인 사본 ID 유지 | server-draft-repository.ts; 저장소 F7 시험 | 다른 창의 요청은 계속 충돌 사본 처리 |
| F8 | data URL 원본의 접두사를 제거. 빈 원본을 파일로 업로드하지 않고 결과·기획은 복원 | server-document-codec.ts; 코덱 F8 시험 | 결과 존재 여부와 원본 사진 존재 여부를 분리. 원본이 없다고 결과를 버리지 않음 |
| F9 | 서버 저장 실패 시 IndexedDB 임시 보관. 편집 계속·새로고침 복구·재시도 안내. 임시본을 서버 저장 성공으로 표시하지 않음 | server-draft-repository.ts, pdp-drafts.ts, PdpMakerClient.tsx; 저장소/화면 F9 시험 | 임시 보관마저 실패하면 기존 용량 오류 안내 유지. 보관 전 설정 이동 차단 |
| F10 | 출처 ID 단위의 통째 숨김 제거. 문서와 겹치는 그림만 옛 항목에서 제외. 남은 표지·장수·원래 순번 유지 | model/codec/migration, server-library.ts, library-adapter.ts, document-works.ts; library-image-dedup 시험 | 기존 동기화 파일명에 기록된 원본 SHA-1 8자리와 대조. 새 파일에는 SHA-1 전체를 별도 기록. 지문 없는 옛 자료는 추측해서 숨기지 않음 |
| F11 | 서버 문서라는 이유로 생성 결과의 서버 라이브러리 동기화를 건너뛰던 분기 제거 | jobs/library-sync.ts; library-authority/library-sync 시험 | 생성 후 창을 닫거나 플래그를 꺼도 결과가 기존 보관함에 남음. 표시는 F10 규칙 |
| F12 | 금지 문구 검사가 sectionScenePrompt로 실제 장면을 검사 | lib/evidence-gate.ts; fallback-scene-gate 및 이미지 게이트 시험 | 허용된 생성 코드 예외 1 |
| F13 | 그림 표시값의 영어 장면 자리를 같은 fallback 규칙으로 계산 | packages/pdp-core/src/pdp.image-freshness.ts; image-freshness 시험 | 정상 입력 표시값 유지. 허용된 생성 코드 예외 2 |
| F14 | 일부 서명 실패 시 다른 그림 주소 반환. 문서 목록 실패 시 옛 목록 유지. 문서 조회 오류가 옛 그림 게시를 막지 않음 | storage.ts, server-library.ts, publication.ts; storage/library-image-dedup/showcase 시험 | 문서 전체 복원에서 필요한 원본 누락은 여전히 오류. 목록 부분 성공과 구분 |
| F15 | 보관 지점을 일반 20개 정리에서 제외 | local/supabase repository, http, pin API, migration, server-draft-repository; F15/SQL 시험 | 보관 지점 최근 5개 + 일반 이전 버전 최근 20개. 중복 pin은 같은 버전 하나 |
| F16 | 같은 원본·같은 생성 작업의 복구 사본 재사용 | server-draft-repository.ts, PdpMakerClient.tsx; F16 시험 | source_draft_id 고유 제약으로 새 브라우저에서도 중복 방지. 다른 생성 작업은 결과를 구별하기 위해 별도 사본. 이미 편집한 복구 사본을 자동 덮어쓰지 않음 |
| F17 | 전용 문서 삭제에서 연결된 옛 라이브러리 행·원본·축소본 정리. 확인 문구 보강 | delete-legacy.ts, http/index, PdpMakerClient/works-tab; api/delete-legacy 시험 | 파일 삭제가 실패하면 행을 남겨 재시도. 소유자·출처·경로를 좁혀 다른 회원 자료 보존 |
| F18 | 서버 모드 수동 라이브러리 저장도 글자·도형 합성 분기 사용 | PdpEditor.tsx; duplicate-recovery-live F18 시험 | 합성 실패 시 기존 원본 저장 안내를 유지하며 편집본 성공으로 알리지 않음 |
| F19 | 키 이름과 무관하게 문서 전체의 data: 문자열·긴 base64 거절. 코덱은 레이어 등 data URL도 자산으로 분리 | model.ts, server-document-codec.ts; api F19/코덱 시험 | 크기 경계 시험의 채움 문자를 마침표로 바꿈: 크기 단언은 유지하고 base64 규칙과 독립 |
| F20 | 삭제 중 상태를 유지하고 다음 문서 목록 요청에서 정리 재시도 | model/repository/http/migration; api F20/SQL 시험 | 요청당 최대 20건. 정리 완료 후에만 pending 표시를 해제 |
| F21 | 복원 409의 최신 버전을 기억하고 복원 요청을 초기화. 다시 확인하라는 안내 | server-draft-repository.ts, PdpMakerClient.tsx; 저장소 F21 시험 | 자동 재복원하지 않음. 다음 사용자 확인 동작에서 최신 기준으로 복원 |

## 시험 변경 설명

- 기존 `server-draft-repository.test.ts`의 오래된 입력 덮어쓰기 허용 단언을, 먼저 저장한 창의 내용 보존과 사본 생성을 요구하는 시험으로 교체했다.
- 기존 라이브러리 전체 숨김·서버 문서 동기화 생략·서명 하나 실패 시 전체 실패를 정답으로 삼던 시험은 F10/F11/F14의 새 계약을 구체적으로 검증하도록 바꿨다.
- `retention-and-quota.test.ts`는 첫 번째 오류 상태 문자열을 찾던 위치만 실제 저장 catch로 좁혔다. 기존 300자 범위·문구 호출 단언은 그대로다. 실제 화면에서 용량 오류가 표시되는 시험을 추가했다.
- 시험 도구를 node로 직접 실행하는 변이 검사에서 pnpm의 NODE_PATH가 빠져 PostCSS 로딩 실패가 한 번 났다. 이 출력은 유효한 변이 증거로 세지 않고, 의존 경로를 넣어 단언 실패와 복구 통과를 다시 확인했다.
- SQL 보관 지점 추가 시험을 회원 권한 구간에 잘못 배치해 권한 거절이 난 것을 서비스 권한 검증 구간으로 옮겼다. 기존 회원 권한 거절 단언은 유지했다.

## 남은 것 — 이번에 고치지 않음

실제 Supabase 스테이징의 업로드 서명·RLS·버킷/전역 정책·URL 만료 검증, 운영 Storage 용량·전송량, 현재 운영 SHA와 master/진단 커밋/캐릭터 브랜치의 관계는 운영 적용 전 별도로 확인해야 한다.
SQL은 사용자가 승인 후 직접 한 번 실행한다. 플래그 0 배포 → 운영 확인 → 활성화 순서다.

범위 밖 기록: 원격 업로드의 실제 바이트 검증 수준, 마이그레이션 재실행, 문서·업로드 티켓 개수 한도, 브라우저 선택 문서 ID와 충돌, 자동저장의 전체 그림 해독·해시·존재 확인 비용, 09-28 이전 해시 출처 작업의 중복, 플래그 off 작은 동작 차이, 관리자 이메일·첫 화면 배지, 600초 URL·원본 표지 전송량, 열린 창의 플래그 전환 안내, library/page 죽은 분기, 기존 표 경로 보안, 관리자 삭제 정책 차이, 리디자인 서버 저장, 기존 IndexedDB 자산 청소, 중단 업로드·만료 버전 전용 자산 정리.

## 결함별 실행 증거

아래 출력은 각 명령의 실패 원인·집계 줄을 그대로 발췌했다. 전체 원문은 각 절의 로그 경로에 있다. 변이 검사는 원본 바이트를 보관하고 수정을 제거해 시험을 실행한 뒤 finally에서 복구하고 동일 시험을 다시 실행했다. 구문/의존성 로딩 실패는 통과 증거로 세지 않았다.
### F1

현재 구현: `apps/web/lib/server-library.ts:918`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f1-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/library-delete-boundary.test.ts app/create/__tests__/saved-image-picker.test.ts
```

```text
 FAIL  app/create/__tests__/saved-image-picker.test.ts > toSavedLibraryImages > F1: 문서 표지는 삭제 금지 표식을 고르기 창까지 전달한다
AssertionError: expected { id: 'lib-doc', name: '문서', …(3) } to match object { documentId: 'doc' }
 FAIL  lib/pdp/documents/__tests__/library-delete-boundary.test.ts > F1: 일반 라이브러리 삭제는 서버 문서·그림·이전 버전을 지우지 않는다
AssertionError: expected { Object (document, assets, ...) } to deeply equal { document: true, assets: true, …(1) }
 Test Files  2 failed (2)
      Tests  2 failed | 4 passed (6)
   Start at  23:41:00
   Duration  973ms (transform 296ms, setup 0ms, import 537ms, tests 34ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f1-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/library-delete-boundary.test.ts app/create/__tests__/saved-image-picker.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  6 passed (6)
   Start at  23:41:22
   Duration  1.18s (transform 276ms, setup 0ms, import 564ms, tests 22ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f1-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/library-delete-boundary.test.ts app/create/__tests__/saved-image-picker.test.ts
```

```text
 FAIL  app/create/__tests__/saved-image-picker.test.ts > toSavedLibraryImages > F1: 문서 표지는 삭제 금지 표식을 고르기 창까지 전달한다
AssertionError: expected { id: 'lib-doc', name: '문서', …(3) } to match object { documentId: 'doc' }
 FAIL  lib/pdp/documents/__tests__/library-delete-boundary.test.ts > F1: 일반 라이브러리 삭제는 서버 문서·그림·이전 버전을 지우지 않는다
AssertionError: expected { Object (document, assets, ...) } to deeply equal { document: true, assets: true, …(1) }
 Test Files  2 failed (2)
      Tests  2 failed | 4 passed (6)
   Start at  23:41:40
   Duration  958ms (transform 287ms, setup 0ms, import 501ms, tests 36ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f1-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/library-delete-boundary.test.ts app/create/__tests__/saved-image-picker.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  6 passed (6)
   Start at  23:41:42
   Duration  639ms (transform 293ms, setup 0ms, import 481ms, tests 21ms, environment 0ms)
```

### F2

현재 구현: `apps/web/app/create/server-draft-repository.ts:18`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f2-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts -t F2
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F2: 다시 읽는 동안 대기한 옛 화면 저장은 최신본을 덮지 않고 사본으로 남긴다
AssertionError: expected undefined to be 'c2c42b9b-a07d-4303-8f57-3ead724ee4f7' // Object.is equality
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F2: 복원 뒤 옛 화면 저장이 도착해도 복원 결과는 유지한다
AssertionError: expected undefined to be 'af08d0eb-157a-415d-8b1f-1c30c7d4a3c9' // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 10 skipped (12)
   Start at  23:42:40
   Duration  1.15s (transform 366ms, setup 0ms, import 515ms, tests 59ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f2-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx
```

```text
 Test Files  2 passed (2)
      Tests  18 passed (18)
   Start at  23:43:09
   Duration  1.85s (transform 1.22s, setup 0ms, import 2.08s, tests 419ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f2-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx
```

```text
 FAIL  app/create/__tests__/server-document-ui.test.tsx > 서버 문서 화면 연결 > F2: 복원 응답을 기다리는 중 자동저장은 멈추고 화면 버전을 보낸다
AssertionError: expected undefined to be 7 // Object.is equality
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F2: 다시 읽는 동안 대기한 옛 화면 저장은 최신본을 덮지 않고 사본으로 남긴다
AssertionError: expected undefined to be '63a96877-a696-4440-a1c3-fed32c2d76c2' // Object.is equality
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F2: 복원 뒤 옛 화면 저장이 도착해도 복원 결과는 유지한다
AssertionError: expected undefined to be 'e475f593-bd75-4e80-9ebc-ddce12f731ca' // Object.is equality
 Test Files  2 failed (2)
      Tests  3 failed | 16 skipped (19)
   Start at  23:44:09
   Duration  2.02s (transform 1.27s, setup 0ms, import 2.05s, tests 150ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f2-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx
```

```text
 Test Files  2 passed (2)
      Tests  19 passed (19)
   Start at  23:44:11
   Duration  1.80s (transform 1.17s, setup 0ms, import 1.98s, tests 501ms, environment 0ms)
```

### F3

현재 구현: `apps/web/lib/pdp/documents/supabase-repository.ts:45`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f3-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/supabase-repository.test.ts lib/pdp/documents/__tests__/library-adapter.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/library-adapter.test.ts > 기존 라이브러리 읽기와 서버 문서 연결 > 일반 회원에게 타인의 서버 문서를 합치지 않는다
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 FAIL  lib/pdp/documents/__tests__/library-adapter.test.ts > 기존 라이브러리 읽기와 서버 문서 연결 > F3: 관리자 옛 작업 열기는 단건 조회만 하고 전체 목록을 읽지 않는다
AssertionError: expected undefined to be '33333333-3333-4333-8333-333333333333' // Object.is equality
 FAIL  lib/pdp/documents/__tests__/supabase-repository.test.ts > 원격 문서 저장의 권한 경계 > F3: 목록은 본문 없이 저장된 요약 칼럼만 가져온다
AssertionError: expected [ '*' ] to not include '*'
 Test Files  2 failed (2)
      Tests  3 failed | 5 passed (8)
   Start at  23:45:01
   Duration  735ms (transform 106ms, setup 0ms, import 336ms, tests 25ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f3-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/supabase-repository.test.ts lib/pdp/documents/__tests__/library-adapter.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  23:45:36
   Duration  410ms (transform 99ms, setup 0ms, import 323ms, tests 20ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f3-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/supabase-repository.test.ts lib/pdp/documents/__tests__/library-adapter.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/library-adapter.test.ts > 기존 라이브러리 읽기와 서버 문서 연결 > 일반 회원에게 타인의 서버 문서를 합치지 않는다
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times
 FAIL  lib/pdp/documents/__tests__/library-adapter.test.ts > 기존 라이브러리 읽기와 서버 문서 연결 > F3: 관리자 옛 작업 열기는 단건 조회만 하고 전체 목록을 읽지 않는다
AssertionError: expected undefined to be '33333333-3333-4333-8333-333333333333' // Object.is equality
 FAIL  lib/pdp/documents/__tests__/supabase-repository.test.ts > 원격 문서 저장의 권한 경계 > F3: 목록은 본문 없이 저장된 요약 칼럼만 가져온다
AssertionError: expected [ '*' ] to not include '*'
 Test Files  2 failed (2)
      Tests  3 failed | 5 passed (8)
   Start at  23:46:00
   Duration  668ms (transform 132ms, setup 0ms, import 333ms, tests 26ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f3-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/supabase-repository.test.ts lib/pdp/documents/__tests__/library-adapter.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  23:46:01
   Duration  729ms (transform 134ms, setup 0ms, import 349ms, tests 21ms, environment 0ms)
```

### F4

현재 구현: `apps/web/lib/membership/withdraw-pdp.ts:4`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f4-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/membership/__tests__/withdraw-pdp.test.ts
```

```text
 FAIL  lib/membership/__tests__/withdraw-pdp.test.ts > F4: 탈퇴(close=true)는 내 문서를 먼저 숨기고 내 원본만 없앤다
 FAIL  lib/membership/__tests__/withdraw-pdp.test.ts > F4: 탈퇴(close=false)는 내 문서를 먼저 숨기고 내 원본만 없앤다
AssertionError: expected [ 'u1/pdp-docs/d/a.png', …(1) ] to deeply equal [ 'u2/pdp-docs/d/b.png' ]
 FAIL  lib/membership/__tests__/withdraw-pdp.test.ts > F4: 상세페이지 파일 목록 실패를 탈퇴 성공으로 숨기지 않는다
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  3 failed (3)
   Start at  23:46:44
   Duration  610ms (transform 40ms, setup 0ms, import 60ms, tests 9ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f4-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/membership/__tests__/withdraw-pdp.test.ts lib/membership/__tests__/withdraw-account.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  23:47:14
   Duration  285ms (transform 81ms, setup 0ms, import 160ms, tests 14ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f4-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/membership/__tests__/withdraw-pdp.test.ts lib/membership/__tests__/withdraw-account.test.ts
```

```text
 FAIL  lib/membership/__tests__/withdraw-pdp.test.ts > F4: 탈퇴(close=true)는 내 문서를 먼저 숨기고 내 원본만 없앤다
 FAIL  lib/membership/__tests__/withdraw-pdp.test.ts > F4: 탈퇴(close=false)는 내 문서를 먼저 숨기고 내 원본만 없앤다
AssertionError: expected [ 'u1/pdp-docs/d/a.png', …(1) ] to deeply equal [ 'u2/pdp-docs/d/b.png' ]
 FAIL  lib/membership/__tests__/withdraw-pdp.test.ts > F4: 상세페이지 파일 목록 실패를 탈퇴 성공으로 숨기지 않는다
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 18 passed (21)
   Start at  23:47:40
   Duration  552ms (transform 121ms, setup 0ms, import 173ms, tests 18ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f4-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/membership/__tests__/withdraw-pdp.test.ts lib/membership/__tests__/withdraw-account.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  23:47:41
   Duration  268ms (transform 72ms, setup 0ms, import 140ms, tests 18ms, environment 0ms)
```

### F5

현재 구현: `apps/web/lib/pdp/documents/model.ts:7`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f5-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/document-size.test.ts lib/pdp/documents/__tests__/supabase-repository.test.ts -t F5
```

```text
 FAIL  lib/pdp/documents/__tests__/document-size.test.ts > F5: 956395바이트 레이어 사례를 DB에 보내기 전에 크기 오류로 거절한다
AssertionError: expected function to throw an error, but it didn't
 FAIL  lib/pdp/documents/__tests__/document-size.test.ts > F5: DB 공백을 포함한 정확한 한도 양쪽을 구별한다
AssertionError: expected function to throw an error, but it didn't
 FAIL  lib/pdp/documents/__tests__/supabase-repository.test.ts > 원격 문서 저장의 권한 경계 > F5: DB 크기 제약 위반은 413으로 설명한다
AssertionError: expected Error: 작업 저장소에 연결하지 못했습니다. { …(2) } to match object { status: 413, …(1) }
 Test Files  2 failed (2)
      Tests  3 failed | 5 skipped (8)
   Start at  23:48:13
   Duration  755ms (transform 59ms, setup 0ms, import 228ms, tests 163ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f5-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/document-size.test.ts lib/pdp/documents/__tests__/supabase-repository.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  23:48:40
   Duration  602ms (transform 52ms, setup 0ms, import 209ms, tests 238ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f5-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/document-size.test.ts lib/pdp/documents/__tests__/supabase-repository.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/document-size.test.ts > F5: 956395바이트 레이어 사례를 DB에 보내기 전에 크기 오류로 거절한다
AssertionError: expected function to throw an error, but it didn't
 FAIL  lib/pdp/documents/__tests__/document-size.test.ts > F5: DB 공백을 포함한 정확한 한도 양쪽을 구별한다
AssertionError: expected function to throw an error, but it didn't
 FAIL  lib/pdp/documents/__tests__/supabase-repository.test.ts > 원격 문서 저장의 권한 경계 > F5: DB 크기 제약 위반은 413으로 설명한다
AssertionError: expected Error: 작업 저장소에 연결하지 못했습니다. { …(2) } to match object { status: 413, …(1) }
 Test Files  2 failed (2)
      Tests  3 failed | 5 passed (8)
   Start at  23:49:39
   Duration  462ms (transform 48ms, setup 0ms, import 205ms, tests 182ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f5-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/document-size.test.ts lib/pdp/documents/__tests__/supabase-repository.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  23:49:40
   Duration  816ms (transform 53ms, setup 0ms, import 225ms, tests 271ms, environment 0ms)
```

### F6

현재 구현: `apps/web/app/create/PdpMakerClient.tsx:666`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f6-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-document-ui.test.tsx -t F6
```

```text
 FAIL  app/create/__tests__/server-document-ui.test.tsx > 서버 문서 화면 연결 > F6: 보관한 A를 떠나 B를 불러오면 A 되돌리기 단추를 없앤다
AssertionError: expected [Function] to be undefined
 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  23:49:18
   Duration  1.91s (transform 787ms, setup 0ms, import 1.37s, tests 104ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f6-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-document-ui.test.tsx
```

```text
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  23:49:23
   Duration  1.98s (transform 743ms, setup 0ms, import 1.31s, tests 235ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f6-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-document-ui.test.tsx
```

```text
 FAIL  app/create/__tests__/server-document-ui.test.tsx > 서버 문서 화면 연결 > F6: 보관한 A를 떠나 B를 불러오면 A 되돌리기 단추를 없앤다
AssertionError: expected [Function] to be undefined
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
   Start at  23:49:42
   Duration  1.93s (transform 727ms, setup 0ms, import 1.27s, tests 238ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f6-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-document-ui.test.tsx
```

```text
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  23:49:44
   Duration  1.77s (transform 780ms, setup 0ms, import 1.37s, tests 231ms, environment 0ms)
```

### F7

현재 구현: `apps/web/app/create/server-draft-repository.ts:23`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f7-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts -t F7
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F7: 내 저장 응답 유실 뒤 내용이 바뀌어도 같은 문서에 이어 쓴다
AssertionError: expected '6285c6a1-416a-44a5-aab4-31888f8dc01f' to be '2c3015d8-05e7-4161-b10e-7453bf6c405e' // Object.is equality
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F7: 사본 응답 유실 뒤 내용이 바뀌어도 사본은 하나만 만든다
AssertionError: expected [ { …(12) }, { …(12) }, { …(12) } ] to have a length of 2 but got 3
 Test Files  1 failed (1)
      Tests  2 failed | 12 skipped (14)
   Start at  23:50:26
   Duration  1.02s (transform 368ms, setup 0ms, import 512ms, tests 73ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f7-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  23:50:30
   Duration  1.19s (transform 343ms, setup 0ms, import 472ms, tests 250ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f7-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F7: 내 저장 응답 유실 뒤 내용이 바뀌어도 같은 문서에 이어 쓴다
AssertionError: expected '4ef12c66-7c7a-4c87-9301-db86f0e227c2' to be '6fa61a6f-0f51-447f-85bb-8cbfa8fd55fc' // Object.is equality
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F7: 사본 응답 유실 뒤 내용이 바뀌어도 사본은 하나만 만든다
AssertionError: expected [ { …(12) }, { …(12) }, { …(12) } ] to have a length of 2 but got 3
 Test Files  1 failed (1)
      Tests  2 failed | 12 passed (14)
   Start at  23:51:19
   Duration  928ms (transform 329ms, setup 0ms, import 463ms, tests 286ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f7-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  23:51:20
   Duration  979ms (transform 346ms, setup 0ms, import 478ms, tests 326ms, environment 0ms)
```

### F8

현재 구현: `apps/web/app/create/server-document-codec.ts:22`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f8-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-document-codec.test.ts -t F8
```

```text
 FAIL  app/create/__tests__/server-document-codec.test.ts > 서버 문서의 원본 분리와 복원 > F8: 옛 초안의 data URL을 이관하고 다시 연다
Error: 그림 데이터를 읽지 못했습니다.
 FAIL  app/create/__tests__/server-document-codec.test.ts > 서버 문서의 원본 분리와 복원 > F8: 옛 초안의 빈 원본을 이관하고 다시 연다
Error: 그림 한 장은 20MB 이하여야 합니다.
 Test Files  1 failed (1)
      Tests  2 failed | 5 skipped (7)
   Start at  23:50:51
   Duration  949ms (transform 339ms, setup 0ms, import 485ms, tests 13ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f8-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-document-codec.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  23:51:16
   Duration  1.08s (transform 346ms, setup 0ms, import 481ms, tests 168ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f8-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-document-codec.test.ts
```

```text
 FAIL  app/create/__tests__/server-document-codec.test.ts > 서버 문서의 원본 분리와 복원 > F8: 옛 초안의 data URL을 이관하고 다시 연다
Error: 그림 데이터를 읽지 못했습니다.
 FAIL  app/create/__tests__/server-document-codec.test.ts > 서버 문서의 원본 분리와 복원 > F8: 옛 초안의 빈 원본을 이관하고 다시 연다
Error: 그림 한 장은 20MB 이하여야 합니다.
 Test Files  1 failed (1)
      Tests  2 failed | 5 passed (7)
   Start at  23:51:22
   Duration  1.11s (transform 351ms, setup 0ms, import 498ms, tests 165ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f8-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-document-codec.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  23:51:24
   Duration  759ms (transform 315ms, setup 0ms, import 437ms, tests 161ms, environment 0ms)
```

### F9

현재 구현: `apps/web/app/create/server-draft-repository.ts:126`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f9-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx -t F9
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F9: 첫 서버 저장 실패를 IndexedDB에 보관하고 새 창구에서 되찾는다
Error: 서버 연결 실패
 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  23:52:15
   Duration  1.00s (transform 372ms, setup 0ms, import 545ms, tests 7ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f9-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx
```

```text
 Test Files  2 passed (2)
      Tests  24 passed (24)
   Start at  23:53:06
   Duration  2.09s (transform 1.18s, setup 0ms, import 1.97s, tests 586ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f9-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx
```

```text
 FAIL  app/create/__tests__/server-document-ui.test.tsx > 서버 문서 화면 연결 > F9: 임시 보관본을 열면 편집기를 쓰며 서버 재시도 안내를 본다
AssertionError: expected '{"type":"div","props":{},"children":[…' to contain '임시 보관한 작업'
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F9: 첫 서버 저장 실패를 IndexedDB에 보관하고 새 창구에서 되찾는다
Error: 서버 연결 실패
 Test Files  2 failed (2)
      Tests  2 failed | 22 passed (24)
   Start at  23:54:04
   Duration  1.76s (transform 1.14s, setup 0ms, import 1.97s, tests 521ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f9-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx
```

```text
 Test Files  2 passed (2)
      Tests  24 passed (24)
   Start at  23:54:07
   Duration  2.03s (transform 1.23s, setup 0ms, import 2.01s, tests 531ms, environment 0ms)
```

### F10

현재 구현: `apps/web/lib/server-library.ts:972`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f10-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/library-image-dedup.test.ts app/library/__tests__/document-works.test.ts
```

```text
 FAIL  app/library/__tests__/document-works.test.ts > 서버 문서의 라이브러리 표시 > F10: 같은 초안에 속해도 문서에 없는 옛 그림은 남긴다
AssertionError: expected [ Array(1) ] to have a length of 2 but got 1
 FAIL  lib/pdp/documents/__tests__/library-image-dedup.test.ts > F10: 옛 다섯 장 중 문서와 같은 두 장만 제외하고 나머지 표지·목록·선택을 보존한다
AssertionError: expected [ 2 ] to deeply equal [ 2, 3 ]
 Test Files  2 failed (2)
      Tests  2 failed | 3 passed (5)
   Start at  23:54:41
   Duration  583ms (transform 259ms, setup 0ms, import 435ms, tests 14ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f10-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/library-image-dedup.test.ts app/library/__tests__/document-works.test.ts app/create/__tests__/server-document-codec.test.ts
```

```text
 Test Files  3 passed (3)
      Tests  12 passed (12)
   Start at  23:55:16
   Duration  990ms (transform 728ms, setup 0ms, import 1.06s, tests 168ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f10-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/library-image-dedup.test.ts app/library/__tests__/document-works.test.ts
```

```text
 FAIL  app/library/__tests__/document-works.test.ts > 서버 문서의 라이브러리 표시 > F10: 같은 초안에 속해도 문서에 없는 옛 그림은 남긴다
AssertionError: expected [ Array(1) ] to have a length of 2 but got 1
 FAIL  lib/pdp/documents/__tests__/library-image-dedup.test.ts > F10: 옛 다섯 장 중 문서와 같은 두 장만 제외하고 나머지 표지·목록·선택을 보존한다
AssertionError: expected [ 2 ] to deeply equal [ 2, 3 ]
 Test Files  2 failed (2)
      Tests  2 failed | 3 passed (5)
   Start at  23:55:55
   Duration  580ms (transform 258ms, setup 0ms, import 435ms, tests 12ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f10-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/library-image-dedup.test.ts app/library/__tests__/document-works.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  23:55:57
   Duration  605ms (transform 251ms, setup 0ms, import 444ms, tests 6ms, environment 0ms)
```

### F11

현재 구현: `apps/web/lib/pdp/jobs/library-sync.ts:179`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f11-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/library-authority.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/library-authority.test.ts > 문서 저장과 생성의 충돌 > F11: 문서 저장 전에 창을 닫아도 생성 결과가 플래그와 무관한 라이브러리에 남는다
AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]
 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  23:56:00
   Duration  648ms (transform 263ms, setup 0ms, import 456ms, tests 8ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f11-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/library-authority.test.ts lib/pdp/jobs/__tests__/library-sync.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  26 passed (26)
   Start at  23:56:04
   Duration  1.05s (transform 466ms, setup 0ms, import 912ms, tests 147ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f11-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/library-authority.test.ts lib/pdp/jobs/__tests__/library-sync.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/library-authority.test.ts > 문서 저장과 생성의 충돌 > F11: 문서 저장 전에 창을 닫아도 생성 결과가 플래그와 무관한 라이브러리에 남는다
AssertionError: expected "vi.fn()" to be called with arguments: [ ObjectContaining{…} ]
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 25 passed (26)
   Start at  23:58:36
   Duration  783ms (transform 502ms, setup 0ms, import 942ms, tests 139ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f11-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/library-authority.test.ts lib/pdp/jobs/__tests__/library-sync.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  26 passed (26)
   Start at  23:58:37
   Duration  798ms (transform 491ms, setup 0ms, import 970ms, tests 134ms, environment 0ms)
```

### F12

현재 구현: `apps/web/lib/evidence-gate.ts:77`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f12-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/fallback-scene-gate.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/fallback-scene-gate.test.ts > F12: 영어 장면이 없으면 실제로 쓰일 한국어 장면의 금지 주장을 거절한다
AssertionError: expected undefined to be 400 // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  23:56:53
   Duration  630ms (transform 294ms, setup 0ms, import 367ms, tests 8ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f12-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/fallback-scene-gate.test.ts app/api/pdp/images/__tests__/gate.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  17 passed (17)
   Start at  23:57:00
   Duration  1.10s (transform 894ms, setup 0ms, import 1.28s, tests 63ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f12-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/fallback-scene-gate.test.ts app/api/pdp/images/__tests__/gate.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/fallback-scene-gate.test.ts > F12: 영어 장면이 없으면 실제로 쓰일 한국어 장면의 금지 주장을 거절한다
AssertionError: expected undefined to be 400 // Object.is equality
 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 16 passed (17)
   Start at  23:58:39
   Duration  1.15s (transform 933ms, setup 0ms, import 1.35s, tests 44ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f12-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/fallback-scene-gate.test.ts app/api/pdp/images/__tests__/gate.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  17 passed (17)
   Start at  23:58:40
   Duration  1.12s (transform 950ms, setup 0ms, import 1.34s, tests 61ms, environment 0ms)
```

### F13

현재 구현: `packages/pdp-core/src/pdp.image-freshness.ts:38`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `packages/pdp-core`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f13-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run src/pdp.image-freshness.test.ts -t F13
```

```text
 FAIL  src/pdp.image-freshness.test.ts > 그림을 만들 때의 문구를 적어 둔다 > F13: 빈 영어 장면을 한국어로 채워도 실제 장면이 같으면 낡음이 아니다
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  23:56:56
   Duration  471ms (transform 36ms, setup 0ms, import 52ms, tests 7ms, environment 0ms)
```

**GREEN**, 실행 위치 `packages/pdp-core`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f13-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run src/pdp.image-freshness.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  23:57:03
   Duration  425ms (transform 35ms, setup 0ms, import 53ms, tests 5ms, environment 0ms)
```

**MUTATION**, 실행 위치 `packages/pdp-core`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f13-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run src/pdp.image-freshness.test.ts
```

```text
 FAIL  src/pdp.image-freshness.test.ts > 그림을 만들 때의 문구를 적어 둔다 > F13: 빈 영어 장면을 한국어로 채워도 실제 장면이 같으면 낡음이 아니다
AssertionError: expected true to be false // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
   Start at  23:58:42
   Duration  303ms (transform 36ms, setup 0ms, import 56ms, tests 9ms, environment 0ms)
```

**RESTORED**, 실행 위치 `packages/pdp-core`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f13-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run src/pdp.image-freshness.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  23:58:43
   Duration  419ms (transform 41ms, setup 0ms, import 58ms, tests 4ms, environment 0ms)
```

### F14

현재 구현: `apps/web/lib/pdp/documents/storage.ts:49`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f14-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/storage.test.ts lib/pdp/documents/__tests__/library-image-dedup.test.ts -t F14
```

```text
 FAIL  lib/pdp/documents/__tests__/library-image-dedup.test.ts > F14: 문서 목록만 실패하면 옛 라이브러리 목록은 계속 연다
Error: 문서 서명 실패
 FAIL  lib/pdp/documents/__tests__/storage.test.ts > 문서 그림 원본과 경로 > F14: 한 그림 서명이 실패해도 다른 그림 주소는 반환한다
Error: 그림을 불러오지 못했습니다.
 Test Files  2 failed (2)
      Tests  2 failed | 6 skipped (8)
   Start at  23:57:51
   Duration  590ms (transform 261ms, setup 0ms, import 572ms, tests 11ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f14-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/storage.test.ts lib/pdp/documents/__tests__/library-image-dedup.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  23:57:55
   Duration  633ms (transform 284ms, setup 0ms, import 611ms, tests 20ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f14-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/storage.test.ts lib/pdp/documents/__tests__/library-image-dedup.test.ts
```

```text
 FAIL  lib/pdp/documents/__tests__/library-image-dedup.test.ts > F14: 문서 목록만 실패하면 옛 라이브러리 목록은 계속 연다
Error: 문서 서명 실패
 FAIL  lib/pdp/documents/__tests__/storage.test.ts > 문서 그림 원본과 경로 > F14: 한 그림 서명이 실패해도 다른 그림 주소는 반환한다
Error: 그림을 불러오지 못했습니다.
 Test Files  2 failed (2)
      Tests  2 failed | 6 passed (8)
   Start at  23:58:44
   Duration  614ms (transform 324ms, setup 0ms, import 608ms, tests 24ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f14-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/storage.test.ts lib/pdp/documents/__tests__/library-image-dedup.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  8 passed (8)
   Start at  23:58:46
   Duration  690ms (transform 361ms, setup 0ms, import 698ms, tests 22ms, environment 0ms)
```

### F15

현재 구현: `apps/web/lib/pdp/documents/local-repository.ts:24`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f15-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts -t F15
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F15: 보관 지점은 자동저장 25회 뒤에도 복원한다
Error: 작업을 찾지 못했습니다.
 Test Files  1 failed (1)
      Tests  1 failed | 15 skipped (16)
   Start at  23:58:58
   Duration  808ms (transform 356ms, setup 0ms, import 526ms, tests 97ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f15-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts lib/pdp/documents/__tests__/repository.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  21 passed (21)
   Start at  23:59:43
   Duration  1.04s (transform 416ms, setup 0ms, import 662ms, tests 388ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f15-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts -t F15
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F15: 보관 지점은 자동저장 25회 뒤에도 복원한다
Error: 작업을 찾지 못했습니다.
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  00:05:51
   Duration  1.08s (transform 351ms, setup 0ms, import 510ms, tests 98ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f15-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts -t F15
```

```text
 Test Files  1 passed (1)
      Tests  1 passed | 17 skipped (18)
   Start at  00:05:53
   Duration  1.13s (transform 356ms, setup 0ms, import 520ms, tests 99ms, environment 0ms)
```

### F16

현재 구현: `apps/web/app/create/server-draft-repository.ts:117`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f16-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts -t F16
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F16: 같은 원본과 생성 작업의 복구 사본을 다시 열어도 저장·업로드하지 않는다
TypeError: a.recover is not a function
 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  00:00:49
   Duration  708ms (transform 358ms, setup 0ms, import 527ms, tests 6ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f16-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts app/create/__tests__/server-document-ui.test.tsx
```

```text
 Test Files  2 passed (2)
      Tests  26 passed (26)
   Start at  00:00:53
   Duration  1.99s (transform 1.14s, setup 0ms, import 1.90s, tests 595ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f16-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts -t F16
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F16: 같은 원본과 생성 작업의 복구 사본을 다시 열어도 저장·업로드하지 않는다
AssertionError: expected 'a0a74099-dcce-425a-8522-7d418c8b70d6' to be '6fdb8d55-9b33-4325-83ba-f51df754528f' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  00:05:55
   Duration  1.02s (transform 361ms, setup 0ms, import 524ms, tests 44ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f16-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts -t F16
```

```text
 Test Files  1 passed (1)
      Tests  1 passed | 17 skipped (18)
   Start at  00:05:56
   Duration  1.03s (transform 344ms, setup 0ms, import 504ms, tests 35ms, environment 0ms)
```

### F17

현재 구현: `apps/web/lib/pdp/documents/delete-legacy.ts:4`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f17-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/api.test.ts -t F17
```

```text
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F17: 전용 문서 삭제는 연결된 옛 그림도 정리한 다음 문서를 비운다
AssertionError: expected "vi.fn()" to be called with arguments: [ …(2) ]
 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  00:02:02
   Duration  344ms (transform 51ms, setup 0ms, import 129ms, tests 30ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f17-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/api.test.ts lib/pdp/documents/__tests__/delete-legacy.test.ts
```

```text
 Test Files  2 passed (2)
      Tests  15 passed (15)
   Start at  00:02:26
   Duration  433ms (transform 111ms, setup 0ms, import 261ms, tests 107ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f17-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/api.test.ts -t F17
```

```text
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F17: 전용 문서 삭제는 연결된 옛 그림도 정리한 다음 문서를 비운다
AssertionError: expected "vi.fn()" to be called with arguments: [ …(2) ]
 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  00:05:58
   Duration  611ms (transform 49ms, setup 0ms, import 126ms, tests 37ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f17-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/api.test.ts -t F17
```

```text
 Test Files  1 passed (1)
      Tests  1 passed | 16 skipped (17)
   Start at  00:05:59
   Duration  644ms (transform 53ms, setup 0ms, import 131ms, tests 28ms, environment 0ms)
```

### F18

현재 구현: `apps/web/app/create/PdpEditor.tsx:2388`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f18-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/duplicate-recovery-live.test.tsx -t F18
```

```text
 FAIL  app/create/__tests__/duplicate-recovery-live.test.tsx > 서버 문서의 라이브러리 저장 > F18: 서버 모드에서도 얹은 글자가 있으면 편집본 저장 경로를 실행한다
AssertionError: expected [] to include '/library'
 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  00:03:11
   Duration  2.01s (transform 818ms, setup 0ms, import 1.44s, tests 81ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f18-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/duplicate-recovery-live.test.tsx
```

```text
 Test Files  1 passed (1)
      Tests  26 passed (26)
   Start at  00:03:17
   Duration  2.74s (transform 833ms, setup 0ms, import 1.45s, tests 824ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f18-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/duplicate-recovery-live.test.tsx -t F18
```

```text
 FAIL  app/create/__tests__/duplicate-recovery-live.test.tsx > 서버 문서의 라이브러리 저장 > F18: 서버 모드에서도 얹은 글자가 있으면 편집본 저장 경로를 실행한다
AssertionError: expected [] to include '/library'
 Test Files  1 failed (1)
      Tests  1 failed | 25 skipped (26)
   Start at  00:07:07
   Duration  2.06s (transform 865ms, setup 0ms, import 1.50s, tests 83ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f18-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/duplicate-recovery-live.test.tsx -t F18
```

```text
 Test Files  1 passed (1)
      Tests  1 passed | 25 skipped (26)
   Start at  00:07:10
   Duration  1.97s (transform 817ms, setup 0ms, import 1.42s, tests 82ms, environment 0ms)
```

### F19

현재 구현: `apps/web/lib/pdp/documents/model.ts:99`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f19-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/api.test.ts -t F19
```

```text
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F19: 임의 src 칸에도 그림 문자열은 넣을 수 없다 (0)
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F19: 임의 src 칸에도 그림 문자열은 넣을 수 없다 (1)
AssertionError: expected 200 to be 400 // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 14 skipped (16)
   Start at  00:03:56
   Duration  370ms (transform 52ms, setup 0ms, import 131ms, tests 40ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f19-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/api.test.ts lib/pdp/documents/__tests__/document-size.test.ts app/create/__tests__/server-document-codec.test.ts
```

```text
 Test Files  3 passed (3)
      Tests  25 passed (25)
   Start at  00:03:59
   Duration  1.27s (transform 476ms, setup 0ms, import 812ms, tests 535ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f19-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/api.test.ts -t F19
```

```text
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F19: 임의 src 칸에도 그림 문자열은 넣을 수 없다 (0)
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F19: 임의 src 칸에도 그림 문자열은 넣을 수 없다 (1)
AssertionError: expected 200 to be 400 // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 15 skipped (17)
   Start at  00:07:12
   Duration  623ms (transform 48ms, setup 0ms, import 122ms, tests 38ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f19-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/api.test.ts -t F19
```

```text
 Test Files  1 passed (1)
      Tests  2 passed | 15 skipped (17)
   Start at  00:07:14
   Duration  807ms (transform 53ms, setup 0ms, import 125ms, tests 30ms, environment 0ms)
```

### F20

현재 구현: `apps/web/lib/pdp/documents/http.ts:31`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f20-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/api.test.ts -t F20
```

```text
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F20: 삭제 도중 파일 정리가 끊겨도 다음 목록 요청이 정리를 재시도한다
AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  00:04:45
   Duration  668ms (transform 56ms, setup 0ms, import 133ms, tests 34ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f20-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run lib/pdp/documents/__tests__/api.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  17 passed (17)
   Start at  00:04:49
   Duration  401ms (transform 55ms, setup 0ms, import 130ms, tests 106ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f20-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/api.test.ts -t F20
```

```text
 FAIL  lib/pdp/documents/__tests__/api.test.ts > 문서 API 경계 > F20: 삭제 도중 파일 정리가 끊겨도 다음 목록 요청이 정리를 재시도한다
AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
 Test Files  1 failed (1)
      Tests  1 failed | 16 skipped (17)
   Start at  00:07:15
   Duration  927ms (transform 61ms, setup 0ms, import 137ms, tests 35ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f20-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run lib/pdp/documents/__tests__/api.test.ts -t F20
```

```text
 Test Files  1 passed (1)
      Tests  1 passed | 16 skipped (17)
   Start at  00:07:17
   Duration  433ms (transform 54ms, setup 0ms, import 137ms, tests 35ms, environment 0ms)
```

### F21

현재 구현: `apps/web/app/create/server-draft-repository.ts:152`. 시험 파일은 아래 명령을 따른다.

**RED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f21-red.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts -t F21
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F21: 복원 충돌은 최신 버전을 기억하고 재확인 뒤 다시 복원할 수 있다
AssertionError: expected [Function] to throw error including '다시' but got '다른 창에서 먼저 저장했습니다.'
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  00:05:19
   Duration  1.02s (transform 346ms, setup 0ms, import 505ms, tests 45ms, environment 0ms)
```

**GREEN**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f21-green.log`

```powershell
..\..\node_modules\.bin\vitest.cmd run app/create/__tests__/server-draft-repository.test.ts
```

```text
 Test Files  1 passed (1)
      Tests  18 passed (18)
   Start at  00:05:25
   Duration  1.32s (transform 369ms, setup 0ms, import 528ms, tests 368ms, environment 0ms)
```

**MUTATION**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f21-mutation.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts -t F21
```

```text
 FAIL  app/create/__tests__/server-draft-repository.test.ts > 브라우저 서버 저장 창구 > F21: 복원 충돌은 최신 버전을 기억하고 재확인 뒤 다시 복원할 수 있다
AssertionError: expected [Function] to throw error including '다시' but got '다른 창에서 먼저 저장했습니다.'
 Test Files  1 failed (1)
      Tests  1 failed | 17 skipped (18)
   Start at  00:07:18
   Duration  1.11s (transform 416ms, setup 0ms, import 603ms, tests 49ms, environment 0ms)
```

**RESTORED**, 실행 위치 `apps/web`, 원문 `C:\Users\PC\AppData\Local\Temp\pdp-f21-restored.log`

```powershell
node <작업공간>/node_modules/vitest/vitest.mjs run app/create/__tests__/server-draft-repository.test.ts -t F21
```

```text
 Test Files  1 passed (1)
      Tests  1 passed | 17 skipped (18)
   Start at  00:07:19
   Duration  747ms (transform 358ms, setup 0ms, import 528ms, tests 52ms, environment 0ms)
```

F14의 옛 그림 게시 추가 검증: `node <작업공간>/node_modules/vitest/vitest.mjs run app/api/showcase/__tests__/showcase-thumbnails.test.ts -t F14`

```text
 FAIL  app/api/showcase/__tests__/showcase-thumbnails.test.ts > addShowcaseItem — 표시용 사본 > F14: 문서 조회만 실패해도 옛 라이브러리 그림은 게시할 수 있다
Error: 문서 그림을 읽지 못했습니다.
 Test Files  1 failed (1)
      Tests  1 failed | 18 skipped (19)
   Start at  00:17:21
   Duration  1.10s (transform 94ms, setup 0ms, import 222ms, tests 303ms, environment 0ms)
 Test Files  1 passed (1)
      Tests  1 passed | 18 skipped (19)
   Start at  00:17:23
   Duration  791ms (transform 87ms, setup 0ms, import 195ms, tests 406ms, environment 0ms)
```

## 최종 전체 검증

웹 전체는 단독 실행했다. 첫 전체 실행의 소스 위치 시험 1건 실패 후 검사 대상을 바로잡고 재실행했다.

### 웹 전체

```powershell
Set-Location <작업공간>/apps/web
$env:PATH='C:\Program Files\Git\bin;C:\Program Files\Git\usr\bin;'+$env:PATH
..\..\node_modules\.bin\vitest.cmd run
```

```text
 Test Files  563 passed | 3 skipped (566)
      Tests  6701 passed | 38 skipped (6739)
   Start at  00:12:27
   Duration  47.61s (transform 64.30s, setup 0ms, import 214.99s, tests 147.11s, environment 55ms)
```

전체 원문: `C:\Users\PC\AppData\Local\Temp\pdp-fix-full-web-final.log`.

### 생성 코어 전체

```powershell
Set-Location <작업공간>/packages/pdp-core
..\..\node_modules\.bin\vitest.cmd run
```

```text
 Test Files  60 passed (60)
      Tests  1154 passed (1154)
   Start at  00:11:42
   Duration  3.38s (transform 8.72s, setup 0ms, import 15.16s, tests 669ms, environment 6ms)
```

전체 원문: `C:\Users\PC\AppData\Local\Temp\pdp-fix-core.log`.

### SQL

```powershell
Set-Location <작업공간>
$env:PDP_PGLITE_MODULE='file:///C:/Users/PC/AppData/Local/Temp/pdp-sql-check/node_modules/@electric-sql/pglite/dist/index.js'
node --test scripts/tests/pdp-documents-sql.test.mjs
```

```text
✔ 문서 SQL: 소유권, 버전 보관, 충돌, 직접 쓰기 차단, 삭제 (1771.6643ms)
ℹ tests 1
ℹ pass 1
ℹ fail 0
ℹ duration_ms 1914.4043
```

전체 원문: `C:\Users\PC\AppData\Local\Temp\pdp-fix-sql.log`.

### 타입·lint·보호 경계

```powershell
# apps/web에서
.\node_modules\.bin\tsc.cmd --noEmit -p .
.\node_modules\.bin\next.cmd lint
# 작업 공간 루트에서
node scripts/tests/pdp-server-boundary.mjs
git diff --check
```

타입: 종료 코드 0, 출력 없음. lint: 종료 코드 0, 오류 0. 기존 img/hooks 경고, next lint 폐기 예고 및 workspace-root 경고를 원문에 남겼다. diff --check: 종료 코드 0.

```text
{
  "baseline": "C:\\Users\\PC\\Desktop\\coding\\fixup-image-agent\\.worktrees\\pdp-remediation",
  "unchangedFiles": 12,
  "unchangedFunctions": 7,
  "changedLinesInProtectedCode": 0
}
```

### 실제 브라우저

```powershell
# apps/web, 별도 터미널
$env:LOCAL_STORE='1'
$env:LOCAL_AUTH_BYPASS='1'
$env:PDP_SERVER_DOCUMENTS='1'
$env:PDP_JOBS_ENABLED='0'
$env:LOCAL_STORE_ROOT=Join-Path $env:TEMP 'pdp-fix-review-store-20261003'
.\node_modules\.bin\next.cmd dev -p 3117
# 작업 공간 루트, 시험 터미널
$env:PDP_BROWSER_EVIDENCE=Join-Path $env:TEMP 'pdp-fix-review-browser-20261003'
node scripts/tests/pdp-documents-browser.mjs
```

```text
{
  "passed": 11,
  "evidence": "C:\\Users\\PC\\AppData\\Local\\Temp\\pdp-fix-review-browser-20261003",
  "results": [
    {
      "case": "real browser upload and save",
      "id": "178b360a-13c3-46e8-8288-d129ee0099bb"
    },
    {
      "case": "fresh browser restores original bytes and editor",
      "ok": true
    },
    {
      "case": "two browser conflict preserves both",
      "original": "178b360a-13c3-46e8-8288-d129ee0099bb",
      "copy": "7866f594-134c-46e8-9f56-6443b3fd2518"
    },
    {
      "case": "F2 held reopen response plus timer autosave preserves latest and forks stale screen",
      "ok": true
    },
    {
      "case": "actual regenerate button saves mock provider result to same document",
      "id": "7866f594-134c-46e8-9f56-6443b3fd2518"
    },
    {
      "case": "history button restores original image on same document",
      "ok": true
    },
    {
      "case": "library and saved-image API include documents",
      "ok": true
    },
    {
      "case": "F1 picker has no document trash and library DELETE preserves document assets and revisions",
      "ok": true
    },
    {
      "case": "text planning stage and key visual restored in browser",
      "id": "f68e5486-141a-41b1-b742-63ba68121fda"
    },
    {
      "case": "admin file copy and owner deletion with real local storage",
      "ok": true
    },
    {
      "case": "opening URL cannot invoke a revision restore",
      "ok": true
    }
  ]
}
```

11건 통과. 원본 바이트·편집기 재생성 단추·이전 버전 선택·실제 이미지 선택창·문서 API를 사용했다. F2는 실제 브라우저 저장 창구에서 GET 응답을 지연시키고 타이머로 옛 화면 저장을 보내는 시나리오이며, PdpMakerClient가 로딩 중 자동저장을 차단하는 부분은 별도 실제 마운트 시험으로 검증했다. AI 제공자는 시험 응답이다. 운영 Supabase·유료 생성·Linux 배포 빌드는 실행하지 않았다.

브라우저 로그: 409는 두 충돌 시험, 404는 삭제 뒤 조회다. 500 두 건은 운영 환경변수를 넣지 않은 로컬의 showcase 관리 조회와 F1 일반 라이브러리 DELETE다. F1에서는 반환 코드만 보지 않고 삭제 전후 문서·이전 버전의 동일성과 원본 바이트를 비교했다. 실제 Supabase DELETE 응답 코드 자체를 확인한 것은 아니다. AppShell/StudioLayout의 기존 key 경고는 별건으로 남긴다. 시험 서버는 포트·프로세스 경로를 확인한 뒤 종료했다.

## HEAD a8aae23f 대비 생성 코드 분류

| 파일 | 분류 |
|---|---|
| packages/pdp-core/src/pdp.scene-prompt.ts (신규), index.ts, pdp.service.ts, pdp.text-plan.ts, pdp.image-prompt.ts; app/create/scenario-sections.ts | G1 공통 장면 복구 |
| apps/web/lib/pdp/request.ts | G2 빈 장면 입력 허용, G4 서술 길이 제한. 거절 칸 진단 로그 유지 |
| app/create/image-request-length.ts; PdpEditor.tsx의 길이 검사 pageContext 인자 | G3 |
| packages/pdp-core/src/pdp.style-reference.ts | G4 |
| packages/pdp-core/src/pdp.image-options.ts | G5 conceptOnly 전달 |
| apps/web/lib/evidence-gate.ts | F12 |
| packages/pdp-core/src/pdp.image-freshness.ts | F13 |
| PdpMakerClient.tsx의 저장·불러오기·복원·복구 연결; PdpEditor.tsx의 저장 callback/라이브러리 저장 | 서버 저장 및 F2/F6/F9/F16/F18/F21. 보호한 생성 함수의 본문 변화 없음 |
| apps/web/lib/pdp/jobs/library-sync.ts | F11로 이전의 문서별 생략을 제거. HEAD 대비 실행 동작은 기존 라이브러리 동기화이며 추가 타입/주석만 남음 |
| create page·초안 저장소·이미지 선택·library·showcase·documents 신규 파일 | 저장·조회·삭제 연결. 생성 로직 아님 |

생성 라우트 실행 코드, TextModeFlow, analyze-request, page-wire는 HEAD 및 생성 개선 사본과의 경계를 확인했다. 테스트 파일 변경은 회귀·실패 재현이며 생성 실행 코드 분류와 구분했다. 전체 변경 파일·바이트·SHA-256은 갱신된 manifest를 따른다.

## 3차 리뷰 요청 프롬프트

```text
작업 공간 C:\Users\PC\Desktop\coding\fixup-image-agent\.worktrees\pdp-server-documents 에서 검토해 주세요.
2026-10-02-pdp-codex-fix-prompt.md, pdp-claude-second-review-result.md, pdp-codex-fix-report.md와 갱신된 코드 지문 목록을 먼저 끝까지 읽어 주세요.
F1~F21 각각 실제 코드·시험·SQL을 독립적으로 확인하고 반례를 찾아 주세요.
특히 재열기/복원과 자동저장의 경쟁, 응답 유실 뒤 내용 변경, 임시본의 재열기·재저장,
옛 5장+문서 2장의 보존, 탈퇴와 삭제 실패 재시도, 보관 지점 상한, 합성 편집본을 확인해 주세요.
웹 전체 시험은 다른 무거운 작업 없이 단독 실행하고, 코어·타입·lint·PGlite·브라우저 11건 이상·보호 경계를 직접 재검증해 주세요.
신규 파일이 대부분 미추적 상태이므로 git diff만 보지 말고 git status와 지문 목록도 확인해 주세요.
기존 G1~G5와 생성 보호 함수는 유지되어야 하며 추가 생성 변경은 F12/F13뿐입니다.
검토 단계에서는 코드를 바꾸지 말고, 지적마다 심각도·현재 파일/줄·재현·원인·수정 방향·시험 여부를 기록해 주세요.
커밋·푸시·병합·배포·운영 SQL은 하지 마세요. 로컬 통과와 운영 적용을 구분해 주세요.
```
