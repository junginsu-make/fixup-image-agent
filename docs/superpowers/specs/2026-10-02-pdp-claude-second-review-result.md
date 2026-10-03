# 상세페이지 개선 — Claude Code 2차 리뷰 결과

작성 2026-10-02 · 대상: `feat/pdp-server-documents` 미커밋 코드(기준 HEAD `a8aae23f`)
방식: 원본 수정 없이 읽기·재현·검증. 리뷰어 넷(① 생성 오류 ② 서버·보안 ③ 화면 저장·충돌 ④ 라이브러리 연결)
의 결과를 컨트롤러가 합쳤고, High 항목은 컨트롤러가 코드에서 직접 다시 확인했다.

## 0. 결론

- **생성 오류 5건(G1~G5)은 해결됐다.** 생성 코드에서 요청과 무관한 변경은 없다(HEAD 직접 대조).
- **서버 저장은 핵심 흐름이 실제로 돈다**(두 브라우저 왕복·원본 바이트·재생성·복원·관리자 복사).
  회원 JWT 로 표·SQL 함수·버킷을 직접 써서 서비스 롤을 속이는 틈은 찾지 못했다.
- **그러나 지금 상태로 운영에서 `PDP_SERVER_DOCUMENTS` 를 켜면 안 된다.** High 4건: 작업 전체가 지워지는 삭제,
  새 버전이 조용히 덮이는 저장 순서, 911MB 서버의 문서 통째 읽기, 탈퇴 회원 원본 사진 잔류.
- 플래그를 끈 상태는 대체로 예전과 같다(작은 차이 §3 L-D2).

## 1. 직접 실행한 검증 (이번 메시지들에서 실행)

| 검사 | 결과 |
|---|---|
| 코드 지문 대조(`2026-10-02-pdp-review-code-manifest.json`) | 81/81 일치 |
| 웹 전체 `vitest run` (조용한 상태 재실행) | **557 파일 통과 · 6,666 통과 · 38 건너뜀 · 실패 0** |
| 〃 첫 실행(다른 검사 동시 실행) | 1건 실패 — `install-host-duplicate-site.test.ts` 5초 시간 초과. 단독 2회 통과. 부하 탓, 무관 |
| pdp-core `vitest run` | 60 파일 · **1,153 통과** |
| `tsc --noEmit` | 오류 0 |
| `next lint` | 오류 0. 변경 파일의 경고는 전부 HEAD 에도 있던 것(`PdpMakerClient.tsx:406` 포함) |
| SQL (`pdp-documents-sql.test.mjs`, PGlite 0.5.8 — 저장소 밖 설치) | 1/1 통과 |
| 브라우저 (`pdp-documents-browser.mjs`, 3117, 새 임시 저장소) | **9/9 통과**. 콘솔: AppShell key 경고(기존), 409(충돌 시험), 404(삭제 확인), 500 = `/api/showcase/manage`(로컬 Supabase 없음, 기존 — 이번 `showcase/store.ts` 변경은 게시 경로라 무관) |
| 보호 경계 `pdp-server-boundary.mjs` | 12 파일·7 함수 동일 — **단 기준이 `.worktrees/pdp-remediation`**. HEAD 대비 생성 코드 변경은 리뷰어 ①이 직접 분류(§4) |

리뷰어들이 따로 돌린 것: ① 웹 8파일 56개 + 코어 2파일 26개, ② `lib/pdp/documents` 8파일 35개 + PGlite 별도 탐침,
③ `app/create` 6파일 64개, ④ 라이브러리·문서 28파일 301개 — 모두 통과. 재현 스크립트는 전부 저장소 밖(§7).

## 2. 고쳐야 할 결함 — High

**H1. 「저장된 이미지에서 고르기」 휴지통이 상세페이지 작업 전체를 지운다** (재현 ④, 코드 확인 컨트롤러)
- 경로: `app/create/SavedImagePicker.tsx:180-199` → `saved-image-delete.ts:39-40` → `DELETE /api/library` →
  `lib/server-library.ts:910-911` → `lib/pdp/documents/library-adapter.ts:62-67`(`markDeleted`→`removeAll`→`finishDelete`)
- 재현: 플래그 on, /create 또는 /redesign 고르기 창에서 문서 표지의 휴지통 → 확인
- 영향: 그림 한 장을 지운다고 생각했는데 입력·기획·원본 사진·이전 버전이 영구 삭제. 편집 중이면 이후 저장도 막힘
- 수정: `/api/library` DELETE 는 문서를 지우지 않는다(문서 삭제는 `/api/pdp/documents/:id` DELETE 만). 또는 고르기 창에서 문서 항목의 휴지통 제거

**H2. 새 버전이 충돌 표시 없이 덮이고, 방금 한 복원이 조용히 취소된다 (R3 반례)** (재현 ③, 코드 확인 컨트롤러)
- 위치: `app/create/server-draft-repository.ts:55`(`previous=opened.get(id)` 를 **줄에서 실행될 때** 읽음), `:85`(PUT baseRevision);
  화면 `PdpMakerClient.tsx:667→674`(불러오기 대기 중 자동저장 미차단), `:943`(30초 자동저장)
- 재현 A: A창 rev2 저장 → B창이 같은 작업 다시 열기 → 응답 대기 중 B 자동저장이 줄에 섬 → get 이 opened 를 rev2 로 갱신 →
  B 의 옛 화면 내용이 rev2 를 기준으로 충돌 없이 저장. 재현 B: 이전 버전 복원 직후 자동저장 → 복원 취소
- 기존 시험 `server-draft-repository.test.ts:62` 가 이 동작을 정답으로 고정하고 있다
- 수정: 화면이 **읽은 revision 을 입력과 함께** 넘겨 그 값을 baseRevision 으로 쓴다. 또는 불러오기·복원 중 자동저장 중지

**H3. 문서 목록·단건 찾기가 문서 본문 전체를 매번 읽는다 (911MB 서버)** (코드 확인 ②④·컨트롤러, 메모리 크기는 추론)
- 위치: `lib/pdp/documents/supabase-repository.ts:34`(`select("*")` 100행씩 전 페이지), `library-adapter.ts:12,16`
  (`resolve` 가 `list(viewer)`, 관리자는 `list(null)` = 전 회원), `server-library.ts:739,755,814`, 라이브러리 page/works-tab/admin 목록
- 재현: 관리자가 옛 라이브러리 항목 하나를 열면 전 회원 문서 본문을 3번 읽음(④ R-C)
- 영향: 문서 1,000건(건당 ~100KB) → 클릭 한 번에 ~300MB. 「지울 때까지 보관」이라 계속 커짐
- 수정: 목록은 SQL 에서 요약 칸만(`document->>'title'` 등), 찾기는 `eq("id")` / `eq("source_draft_id")` 단건

**H4. 탈퇴해도 `pdp-documents` 버킷의 원본 사진이 남는다** (코드 확인 ②·컨트롤러)
- 위치: `lib/membership/withdraw-account.ts:29,38-58` — `library` 버킷만 비움. 계정 삭제는 행만 cascade, 닫기 경로는 행·파일 모두 남음
- 영향: 탈퇴 회원 원본 영구 보관 — 개인정보 처리방침과 어긋날 수 있음
- 수정: 탈퇴 정리에 `pdp-documents/{userId}/` 접두사 추가, 닫기 경로에서도 문서 삭제 후 파일 정리

## 3. 고쳐야 할 결함 — Medium / Low

| 번호 | 내용 | 위치 | 수정 방향 |
|---|---|---|---|
| M-B1 | 1MB 한도를 앱(압축 JSON)과 DB(`document::text`, jsonb 공백 ~1.2배)가 다르게 잼 → 0.85~1MB 문서 자동저장이 503 「연결 못 함」으로 계속 실패 (재현: 956,395B) | `model.ts:73`, SQL:14, `supabase-repository.ts:11` | 기준 통일, 제약 위반은 413 + 명확한 문구 |
| M-C2 | 「변경 전으로 되돌리기」 단추가 다른 문서로 옮겨도 남아, 누르면 이전 문서를 확인 없이 복원(R12 반례) | `PdpMakerClient.tsx:587`, `:611` | `handleLoadDraft` 에서 `undoDraftId` 비우기 |
| M-C3 | 보관 지점이 이전 버전 20개 보관에서 밀려(~10분 편집) 되돌리기 실패 | `preserve` + 20개 정리 | 보관 지점을 정리 대상에서 빼거나 별도 문서로 |
| M-C4 | 응답 유실 뒤 가짜 충돌·사본 중복(R2 반례) | `server-draft-repository.ts:45-51` | 409 의 `current.lastRequestId` 가 내 직전 요청이면 내 커밋으로 인정, 사본 id 를 확인까지 유지 |
| M-C5 | 복구 사본이 문서를 열 때마다 새로 생기고 그림 전체 재업로드 | `PdpMakerClient.tsx:680`, `:837-846` | 같은 원본의 복구 사본 재사용 |
| M-C6 | `originalImage` 가 data URL·빈 값인 옛 초안은 이관 불가 → 플래그 on 에서 열 수 없음(원본은 남음) | `pdp-drafts.ts:489,521`, `document-state.ts:118`, 코덱 `:26` | 코덱이 data URL 접두사 제거·빈 값 허용 |
| M-C7 | 첫 서버 저장 실패 시 편집기가 막히고 로컬 대체 저장 없음, 「설정으로 돌아가기」가 비용 낸 분석 결과를 버림 | `PdpMakerClient.tsx:1287-1293` | 실패 시 IndexedDB 임시 보관 + 재시도 |
| M-D1 | 이관된 문서가 있으면 같은 출처의 옛 라이브러리 작업 전체를 숨김 — 옛 작업에만 있던 그림이 목록·고르기·/ad 에서 사라짐 | `server-library.ts:968-969`, `document-works.ts:5-6` | 문서에 없는 그림은 옛 항목으로 계속 표시 |
| M-D2 | 문서 작업은 서버 라이브러리 동기화를 건너뜀 → 문서 저장 전 창을 닫으면 결과가 라이브러리에 안 남음(09-28 결정 후퇴), 플래그를 다시 끄면 켜 있던 동안의 결과가 안 보임 | `lib/pdp/jobs/library-sync.ts:99-105,194-197`, `PdpEditor.tsx:2389-2400` | 동기화는 계속 쓰고 표시만 문서를 정본으로 |
| M-D3 | 문서를 지워도 연결된 옛 라이브러리 행·파일이 남아 직접 주소로 열리고 플래그 off 에서 다시 나타남 | `http.ts:100-102`, `library-adapter.ts:62-67` | 문서 삭제 때 연결된 옛 항목도 정리(사용자 확인 문구와 함께) |
| M-D4 | 서명 주소 하나만 실패해도 라이브러리 전체(목록·고르기·/ad·게시)가 500 | `server-library.ts:966`(`Promise.all`), `storage.ts:49-56`, `showcase/store.ts:185-187` | 실패한 항목만 빼고 나머지 표시 |
| M-D5 | 서버 모드 「라이브러리에 저장」이 글자·도형 편집본을 더 남기지 않는데 「저장했습니다」라고 알림 | `PdpEditor.tsx:2389` | 편집본 처리 분기 유지 또는 문구 수정 |

Low (요약):
- **L-A1** 금지 문구 검사가 `prompt_en` 만 봄 → G2 로 빈 `prompt_en` 이 허용되면서 `prompt_ko`·섹션 이름의 근거 없는 문구가 장면에 실림(재현). `lib/evidence-gate.ts:79` → `sectionScenePrompt(section)` 검사(한 줄)
- **L-A2** 옛 초안 그림에 가짜 「낡은 그림」 표시(재현) → 크레딧 낭비 유도. `pdp.image-freshness.ts:37-46` 도 `sectionScenePrompt` 사용
- **L-B** 삭제 중간 실패 시 재시도 길 없음(`http.ts:101-102`) · 원격 업로드는 선언 크기·MIME 만 확인(`storage.ts:40`) · base64 거절이 키 이름 목록이라 `editor.layers[].src` data URL 통과(`model.ts:91`, 재현) · 마이그레이션 재실행 시 "already exists"(트랜잭션 롤백, 1회 실행이면 무해) · 업로드 서명·문서 생성 개수 한도 없음 · 문서 id 를 브라우저가 정해 이관 id 선점 가능(`server-draft-repository.ts:123`)
- **L-C** 다른 창이 버전을 바꾼 뒤 복원하면 같은 409 반복(`:101-104`) · 자동저장마다 모든 그림 재해독·SHA-256·존재 확인(램 부담)
- **L-D1** 09-28 이전·브라우저 업로드 작업은 출처 id 가 해시라 이관 뒤 옛 항목과 문서가 둘 다 보임
- **L-D2 (플래그 off 차이)** 작업물 탭이 `/api/pdp/documents` 를 한 번 더 부름(404), `/api/library` 실패 시 알림이 뜸(`works-tab.tsx:237`), `lib/library.ts:29,290,357` 이 플래그와 무관하게 v3 브라우저 저장본도 읽고 지움, `draft-repository` 의 v2/v3 최신 고르기·주소 검사·편집기 바깥 div — 사용자 기능 차이는 확인되지 않음
- **L-D3~6** 관리자 전체 보기에 문서 작성자 메일 없음·첫 화면 표시 사라짐 · 문서 그림 주소 600초·표지가 원본(전송량) · 플래그 전환 전 열린 창의 반복 안내 · `library/page.tsx:146-148` 죽은 분기

참고: 화면의 「그 밖에」 글자 수는 공백 포함, 서버는 잘라서 셈(더 엄격한 쪽이라 400 없음). 540·280 조합 회귀는 G2 이후 G1 을 되돌려도 통과(G1 은 `pdp.scene-prompt.test.ts` 가 잡음). `request-bounds.test.ts:149` 제목과 단언 불일치.

## 4. 항목별 판정

| 항목 | 판정 | 근거 |
|---|---|---|
| G1~G5 | **해결** | 각 경로 끝까지 전달 확인. 부작용 L-A1·L-A2. HEAD 대비 생성 코드 변경은 전부 G1~G5 또는 서버 저장 연결로 분류됨 — 무관 변경 없음 |
| 대표 이미지 결정 | 타당 | `buildKeyVisualPrompt` 는 style_guide 만 읽음 |
| S1 (SQL·저장소) | 조건부 통과 | 회원 JWT insert/update/delete/truncate·함수 실행·anon 조회 거부, 남의 행 0건, 이관 중복 방지·버전 비교·재전송·20개 보관·삭제 후 부활 불가 확인(PGlite). 함수 `security invoker`·`search_path` 고정·실행권 service_role 만. 반례 M-B1 |
| S2 (API) | 조건부 통과 | 인증→소유→본문 순서, 경로 서버 생성 + 재검증(`..`·`%2e%2e`·탭·남의 접두사 거부 재현). Low 들 |
| S3 (코덱) | 부분 | 현행 필드 전부 차이 0 왕복(레이어·섹션 키·비활성 첨부·캐릭터·첨부 지시·글 중간 기획·대표 이미지·같은 그림 두 역할). 반례 M-C6 |
| S4 (저장 창구) | 부분 | 플래그 분기·연 초안만 이관·충돌 시 주소 전환 확인. 반례 H2·M-C4·M-C7 |
| S5 (라이브러리) | **보류** | H1·H3 수정 전 플래그 on 금지. M-D1~5 |
| S6 (검증) | 재현됨 | 위 §1. 단 브라우저 시험은 H2 같은 끼어들기를 다루지 않음 |
| R1 | 통과 | |
| R2 | 반례 | M-C4 |
| R3 | 반례 | H2 |
| R4 | 통과 (같은 창 응답 유실) | L-C 409 반복 |
| R5~R10 | 통과 | R5 공개 버킷 비공개화 재현, R6 status/statusCode, R8 로컬 전용(운영 404), R10 비관리자 404 |
| R11 | 통과 | 재현 |
| R12 | 반례 | URL 진입은 통과, M-C2 |
| R13 | 통과 | 깊이 10만/40만, 4KB 생성 요청 400 재현 |
| R14 | 통과 | `toString`·`__proto__`·`hasOwnProperty` 400 |

## 5. 운영 적용 전 확인 사항

1. **H1~H4 와 M-B1, 그리고 데이터가 안 보이게 되는 M-D1·M-D2 를 고친 뒤** 같은 범위로 재리뷰
2. 원격(Supabase) 분기는 단위 시험이 가짜 클라이언트 중심 — **실제 Supabase(스테이징)에서** 업로드 서명·RLS·버킷 정책·서명 URL 을 한 번 돌려 본다
3. 운영 `storage.objects` 에 대시보드로 만든 전역 정책이 있는지(저장소 마이그레이션에는 버킷별 정책만)
4. Supabase 요금제 Storage 용량·전송량(「지울 때까지 보관」 + 원본 표지 전송, L-D4) — 추가 과금 회피 원칙
5. 운영 현재 SHA 와 master, 400 진단 커밋 `a8aae23f`, 캐릭터 브랜치(`.worktrees/double-shell`, 미커밋) 관계 정리 후 병합 순서 결정
6. 마이그레이션은 **한 번만** 실행(재실행하면 "already exists" 로 롤백) — 사용자 승인 후 사용자가 SQL 편집기에서
7. 플래그는 0 으로 배포 → 운영 확인 → 켜기. 운영 인스턴스 t3.micro(911MB)면 H3 수정 전 켜지 않는다

## 6. 다른 작업과의 통합

- 캐릭터 브랜치(`.worktrees/double-shell`)와 **파일 충돌 없음**. 새 `/library/pdp/[id]` 는 셸을 두 번 씌우지 않음(walker 흉내로 확인).
  이 작업 공간에는 `/library/works/[id]`·`/characters/[id]` 의 두 겹 셸이 아직 있어(캐릭터 브랜치가 고침) 문서로 넘어가기 직전 잠깐 두 겹이 보임 — 캐릭터 브랜치를 먼저 합치면 풀림
- 진단 커밋의 거절 칸 기록은 그대로 동작(리뷰어 ①)

## 7. 범위 밖 (이번에 고치지 않음, 기록만)

- 관리자 삭제 정책 불일치: 옛 항목은 남의 것도 지우지만 문서는 본인 것만(`library-adapter.ts:65`)
- 자동저장마다 문서 전체 2회 읽기·그림 수만큼 순차 존재 확인(`http.ts:44-51,69`)
- 문서 id 를 브라우저가 정해, 관리자 조회·첫 화면 게시가 같은 id 의 옛 작업 대신 회원 문서를 고를 수 있음(남의 id 를 알아야 함)
- 서버 모드 「되찾기」가 원본 옆에 복구 사본을 쌓아 라이브러리에 같은 작업이 둘로 보임
- `undoDraftId` 를 비우지 않는 것 자체는 기존 결함(플래그 off 에선 무해)
- 기존 표 경로 보안 틈(`character_views`·`library_*`·`style_references`) — 사용자가 따로 리뷰 예정

## 8. 재현 자료 (모두 저장소 밖)

- ① `%TEMP%\reviewA\gate.mts`(L-A1), `stale.mts`(L-A2)
- ② `<scratchpad>\revB\sql-probe.mjs`, `size-probe2.mjs`(M-B1), `model-probe.mts`(L-B base64)
- ③ `<scratchpad>\revC\codec-probe.mts`(M-C6·왕복표), `repo-probe.mts`(H2·M-C3·M-C4)
- ④ `%TEMP%\pdp-review-d\s5-repro.test.ts`(H1·H3·M-D1·M-D4), `walker.mjs`(셸 두 겹)
- 브라우저 증거 `%TEMP%\pdp-claude-second-review-evidence\`(results.json·browser-errors.json·PNG 4)

`<scratchpad>` = `C:\Users\PC\AppData\Local\Temp\claude\C--Users-PC-Desktop-coding-fixup-image-agent\25611314-fe09-46df-a675-4fd5d67373be\scratchpad`
