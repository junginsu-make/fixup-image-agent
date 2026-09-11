# 상용화 개선 진행 기록

기준: `57e9bee`, 작업 브랜치 `fix/commercial-readiness`, 별도 `.worktrees/commercial-hardening`.
사용자 승인: 설계 대조, 순차 구현·검증·별도 리뷰·필요한 반영 승인. 클로드 동시 작업 범위 확인은 진행 중.
범위 재확인: 사용자는 설계 밖의 발견 이슈를 이번에 수정하지 말라고 명시했다. 기준 설계의 항목과 연결되는 구현·검증만 진행한다. 추가 발견은 별도 확인 대상으로 남기며 자동으로 범위를 늘리지 않는다.

| 단계 | 구현 | 검증/별도 리뷰 | 운영 적용 |
|---|---|---|---|
| 0 기준 고정/분리 | 별도 worktree 및 의존성 설치 | 최신 운영 관측 포함 설계 복사 | 변경 없음 |
| 1 실제 DB RED | 임시 로컬 PostgreSQL 격리 시험 작성 | 4개 의도한 실패 재현, 실패 원인 확인 | 변경 없음 |
| 2 DB 호환 기반 | v2 실행/시도/정산·예산·lease, v1 호환, 팀 자식 RLS | DB 단계 시험 10개 성공; 전체 기존 3260개 성공; 별도 검토에서 날짜 경계 보완 | 미적용 |
| 3 권한/예산 | admin quota·감사, 소유권 guard, 서버 저장소/열 권한, 자산 검증, 원자적 팀 변경 | 웹 161파일/1849시험, 타입 검사, 변경 영역 lint 성공; DB 권한/팀 변경/자산 경계 시험 성공 | 미적용 |
| 4 비동기 실행 | 서버 run/attempt 기반 SNS·포스터, 조회 전용 status, 원고/실행 분리, 로컬 기록 복구 | 코어/재시작 모사/결과 연결 시험 성공; 실제 자동 호출은 단계 6 | 미적용 |
| 5 동기/LLM | 구현 및 단계 검증: LLM/PDP/리디자인/캐릭터 연결, 비공개 결과·입력 보존, 저장 fence | 웹 전체 1957시험, DB 전체 37시험 후 계약 시험 추가 통과; 운영 통합 검증은 후속 단계 | 미적용 |
| 6 운영 처리기 | 실행기·timer·journal 복구·운영자 비용 대조·배포 점검 구현 | 전체 웹 1975시험, DB/배포 helper 49시험, 타입·lint 통과; 실제 systemd·배포 검증은 단계 8 | 미적용 |
| 7 웹 보안 | canonical origin·공통 next/back·공개 health 축소·admin 진단·CSP 보고 모드 구현 | 웹 1980시험/타입/lint 통과, 실제 로컬 Next 내부 인증·Chromium 화면 확인; HTTPS/Auth·CSP 강제 모드 미완료 | 미적용 |
| 8 출시 검증 | CI 사전 검증 완료, 운영 전환 조건 대기 | 최종 조합 웹 1982시험·DB/배포 51시험·타입/lint/감사·Linux 빌드·패키지 실행 성공 | 미적용, 출시 판정 미완료 |

## 단계 5 진행 기록: LLM 경로

### 단계 8 사전 검증 (운영 전환 승인으로 해석하지 않음)

**최종 코드 검증 기준: `385c7f5`.** [Linux CI 34590020065](https://github.com/junginsu-make/fixup-image-agent/actions/runs/34590020065)에서 verify/integration/build 모두 성공했다. 웹 1982시험, DB/배포 51시험, 타입·lint·실제 의존성 감사, manifest/helper/schema/build identity 검증, 패키지 Node 실행(liveness 200·미설정 readiness 503의 최소 응답·무인증 tick 404), artifact 업로드까지 성공했다. 운영 릴리스 발행과 서버/DB 적용은 하지 않았다.

마지막 배포 대조에서 현재 HTTP 설정과 HTTPS 필수 앱의 충돌을 앱 전환 전에 차단하도록 보완했다. 릴리스에 빌드 당시 publicSiteOrigin을 기록하고, 서버의 HTTPS origin과 같아야 배포 제어가 진행된다. 불일치하면 환경 파일·DB 변경 이전에 거절한다. 이 보호와 UI `39c4f5c`가 모두 최종 CI에 포함됐다. 이 뒤 진행 기록만 수정한 커밋은 실행 코드 변경이 아니다.

- 코드 기준 `f277d85`, Linux CI [34589440557](https://github.com/junginsu-make/fixup-image-agent/actions/runs/34589440557) 전체 성공. verify·별도 DB integration·Linux build·패키지 실제 Node 실행·artifact 업로드 성공. DB/배포 도구 50시험 성공. 이후 추가한 구형 롤백 차단 shell 시험은 Windows Git Bash에서 별도 1시험 성공이며 이 CI 수치에 포함하지 않는다.
- 병행 UI의 완료 커밋 `39c4f5c`를 추가 통합했다. library-picker/pick-cell/SavedImagePicker 세 파일이며 API·DB 변경은 없다. 이 기능을 여기서 새로 설계하거나 수정하지 않았으며, 통합 뒤 타입 검사 성공. 최종 조합의 CI를 다시 실행한다.
- 첫 Linux DB 실행은 pg_ctl 시작 실패였다. Linux 기본 Unix socket 디렉터리에 의존하지 않고 TCP만 사용하도록 시험 도구를 수정하고, 실패 시 원래 PostgreSQL 로그를 보존해 출력한다. 다시 실행한 Linux 50시험은 성공했다. 운영 PostgreSQL 설정을 바꾼 것이 아니다.
- 별도 리뷰에서 §17의 fal 명시 실패/일시 조회 장애 구분 누락을 확인했다. SDK 422 및 명시 error 응답은 실패로 기록하고 비용은 미확인으로 남긴다. 503 등 일시 조회 장애는 확정 실패로 바꾸지 않는다. 관련 adapter/상태 전이 시험과 실패 원가 대조 DB RED→GREEN을 통과했다.
- 운영 재조회: current는 `20260911T074130Z-68b10827`, 웹 active, collector masked, NRestarts 0, 메모리 약 171 MiB, 디스크 여유 5.6 GiB. v2 테이블/RPC 없음, 신규 기본 quota 30, v1 reserved 0. 확인 시점의 값이며 배포 직전 다시 확인한다.
- 설치된 systemd의 `systemd-analyze verify`와 Caddy 2.11.4의 임시 설정 validate 성공. 별도 loopback 임시 Caddy 프로세스로 내부 tick 404, 생성/구형 status/stop 점검 503, 기존 health 읽기 200을 확인했다. 운영 사이트 설정·서비스는 수정하지 않았고 임시 프로세스/파일은 종료·정리했다.
- 중간 브랜치의 릴리스 발행은 GitHub integration 권한 403으로 실패했다. 검증 브랜치는 패키지 빌드·검사까지 하고 production 릴리스 발행은 master로 제한했다. 실패했던 실행을 성공으로 표시하거나 GitHub 권한을 넓히지 않았다.

남은 출시 게이트:

| 구분 | 남은 일 |
|---|---|
| T24 | 실제 도메인 DNS/TLS·Auth redirect·Turnstile 및 가입/로그인/메일 확인/비밀번호 재설정, CSP 관측 후 강제 적용 |
| T02/T19/T28 운영 계층 | staging의 브라우저 종료·timer/웹 재시작·장애·호환 롤백 실연과 결과/정산 대조 |
| DB 적용 | 공유 page.mktinsight 소비 앱 확인, 실제 schema delta/백업·복구 범위 확정, 승인된 migration 0010–0031 적용 후 실제 역할/Storage 검증 |
| 비용/부하 | 운영자 일일 비용·미해결 확보액 확정, 보수적인 run 최대비용으로 정상 요청이 허용되는지 확인, 메모리·디스크·처리 지연 측정 |
| 최종 통합 | 최신 사용자 기능 변경과 master 통합 대조, 동작별 제한된 유료 smoke 및 제공자 기록 대조, 최종 출시 판정 |

지금까지의 자체 설계/diff 재검토와 격리 시험을 실제 운영 적용·독립된 다른 리뷰어의 검증·상용화 완료로 표현하지 않는다. 운영 전환은 도메인·예산·공유 DB 소비 앱에 대한 사용자 입력을 기다린다.

### 단계 7: 코드 검증과 운영 확인 경계

- T22/T23 RED 3개에서 악성 forwarded-proto가 javascript origin으로 반영되고 역슬래시 next가 통과하며 공개 health가 설정을 노출함을 재현했다. production은 설정된 HTTPS origin만 사용하고, auth confirm/login/team back을 같은 경로 검증으로 통일했다. 기존 개발 포트는 유지한다.
- 공개 readiness는 ok/status만 반환하고 실제 모델 주 제공자·fallback 키 유무를 검사한다. 상세 진단은 API admin 인증 뒤에만 조회한다. 키 존재와 실제 provider 인증 성공은 구분한다.
- CSP 보고는 16 KiB/프로세스당 분당 60요청/요청당 5항목으로 제한한다. 비밀이 있을 수 있는 URL 경로·query·본문은 버린다. 아직 강제 모드는 아니다. 정적 페이지·Next 테마 스크립트·비용 전략실 inline script의 production 관측이 남았다.
- 실제 Next 15.5.24 BaseServer가 loopback에도 x-forwarded-*를 자동 생성함을 발견했다. 6단계의 전면 거절을 로컬 host/http/loopback IP 정확 일치 검사로 바로잡았다. 비밀키 없는 실제 요청 404, 올바른 요청 GET/POST 200을 로컬 서버에서 확인했다. 외부 프록시 경로는 계속 차단한다.
- Chromium으로 /guide, /library, /admin/cost-lab의 200과 pageerror 0을 확인했다. 처음 networkidle 대기는 개발 CSP/eval 보고 때문에 timeout했으므로 성공으로 세지 않았고 DOM 로딩 기준으로 다시 확인했다. iframe 내부 계산과 실제 운영 Auth를 검증한 것은 아니다.
- 전체 pnpm test 성공(웹 190파일/1980시험), 타입·lint 성공. 신규 설치는 HTTP IP 자동 설정을 제거하고 설계의 HTTPS 도메인을 요구한다. 현재 운영 DNS/TLS/Auth/Turnstile 값은 바꾸지 않았다. 도메인·예산·공유 DB 소비 앱 확인이 없어 운영 전환과 단계 7 전체 완료를 주장하지 않는다.

### 단계 6 구현과 별도 설계 대조

- 브라우저와 무관한 loopback 실행기와 독립 systemd timer를 연결했다. 인증키·릴리스·프로토콜을 검사하고 공개 프록시에서는 내부 경로를 차단한다. 빈 큐에서도 heartbeat를 기록하며 heartbeat/journal 장애는 새 비용을 막는다. 이미 받은 결과의 회수·정산은 유지한다.
- 수락 journal을 제한된 크기로 순회하고 확정한 cursor만 저장한다. 살아 있는 lease는 건드리지 않고, 알려진 수락 ID는 DB에 복구한다. 동기 응답 캐시를 찾으면 재호출 없이 정산하고, 미완성·불명 결과는 대조 목록에 남긴다.
- §11/T25 비용 화면 누락을 추가 대조해 v1/v2 통합 집계에 연결했다. 과거 단가는 최초 확인 snapshot으로 고정하며 이중 집계를 막는다. 관리자만 예산·중단 정책과 증거가 있는 비용 대조를 처리하며 감사 기록을 남긴다.
- 배포는 점검 → admission 닫기 → 실행 대기 → 웹 health → 실행기 시작 → heartbeat/schema → 기존 정책 복원 순서다. 첫 closed 정책을 자동 개방하지 않으며 운영자가 중간에 바꾼 정책을 보존한다. collector mask를 유지한다. 구형 v1 앱으로 자동 복귀하는 경로는 별도 리뷰에서 제거했다.
- 릴리스에 helper·commit·schema min/max·build run ID를 포함한다. 현재 지원 범위는 schema 31이며 미래 스키마의 호환성을 근거 없이 허용하지 않는다. 배포 문서에 첫 전환과 호환 롤백 절차를 반영했다.
- 전체 lint에서 서버 판별 함수의 use 접두사가 React hook으로 해석되는 오류를 발견해 isDurableGenerationEnabled로 이름만 바로잡았다. 전체 lint 성공, 기존 이미지 최적화 경고는 별도 기능 변경 없이 유지했다.
- 검증은 실제 로컬 PostgreSQL과 fake provider/HTTP 기반이다. 별도 검토는 설계·diff를 다시 읽은 자체 검토이며, 다른 독립 리뷰어가 확인한 것으로 표현하지 않는다. 실제 Linux 서비스·Auth·유료 smoke·운영 DB 적용은 아직 미완료다.

- 다섯 무차감 LLM 경로를 v2 run에 연결했다. 사용자 크레딧은 0이며 호출 제한·원가 예산은 적용한다. SDK 재시도는 끄고, 원본 응답과 토큰·검색 도구 호출을 해석 전에 기록한다. topic 연구도 같은 경계를 통과한다.
- 동기 HTTP 처리의 lease를 begin 트랜잭션에서 받는다. 같은 키로 경쟁한 두 번째 요청에는 원래 lease를 노출하지 않는다. 별도 비공개 Storage bucket `generation-internal`에 응답을 보존하며, 광범위한 다른 Storage 정책이 있어도 authenticated 접근을 제한하는 실제 SQL 시험을 통과했다.
- 정산 DB 장애 중 최초 결과는 반환하지만 재조회가 실패하는 결함을 새 시험에서 재현하고 수정했다. 성공 응답은 유지하고 정산 대기 상태를 복구한다. 통신 단절 후 provider 결과 불명은 재제출하지 않는다. 새 동작 시험 7개 통과.
- 설계 재대조에서 늦은 기획·캡션이 수정된 원고를 덮어쓸 수 있음을 확인했다. 읽었을 당시의 updated_at을 캐시 결과에도 보존하고, 행 잠금 안에서 비교하는 service-role RPC로 저장한다. 실제 DB에서 오래된 버전 거절·현재 원고 보존·새 버전 허용을 확인했다. v2 기획은 실행 결과 카드 행을 삭제하지 않는다.
- PostgreSQL 전체 27개 통과 후 원고 충돌 1개와 LLM 동시 경쟁 1개를 추가하고 해당 suite를 각각 통과했다. 최초 경쟁 fixture는 SNS resource를 빠뜨려 두 요청이 모두 거절됐으므로 증거로 삼지 않았으며, resource가 필요 없는 두 실제 LLM operation으로 수정하여 하나만 승인되는 것을 확인했다.
- 아직 단계 5 전체 완료가 아니다. PDP·리디자인·캐릭터 동기 이미지 생성의 v2 전환, 원본 응답 복구·실제 단가 일치, 포스터 기획과 나머지 LLM 경로 전환을 계속해야 한다. timer/대조 처리기와 운영 반영은 후속 단계다.

### 후속: PDP 기획 전환과 재검토

- PDP analyze/plan-from-text는 production/v2에서 별도의 내구성 있는 기획 경로를 사용한다. 기존 응답의 result 구조·긴 레퍼런스 분할·기획 재시도·텍스트 기본값을 유지한다. 크레딧은 기존대로 0이며 실제 LLM 호출은 run/attempt에 남긴다. 로컬 기존 경로는 유지한다.
- 새 경로는 인증 후 최대 32 MiB의 JSON을 스트리밍 검사한다. Content-Length가 없어도 크기 제한을 적용한다. 해시에는 분석/텍스트 모드를 포함해 같은 키를 다른 경로에 재사용하지 못한다. 클라이언트에 v2 프로토콜 헤더를 연결했다.
- 기존 도메인 함수가 통신 단절 예외를 잡고 계속하면 다음 LLM을 호출할 수 있는 RED를 재현했다. 한 실행의 계량 컨텍스트에 중단 상태를 보존하여 이후 유료 호출을 차단했다. 이 시험과 SNS 순차 생성 회귀를 통과했다.
- 검증: 웹 169개 파일/1876개 시험 통과, 타입 검사·변경 파일 lint·diff 공백 검사 통과. 외부 AI 유료 호출은 실행하지 않았다. 운영 서버/DB에는 적용하지 않았다.
- **새로 확인한 포스터 기획 경계:** 현재 코드의 poster plan은 0크레딧이 아니다. 레퍼런스 문법/인물 읽기를 먼저 유료 호출하고 그 뒤 poster_image로 확보한 후, 실제 LLM 금액을 크레딧으로 정산한다. 후속 전환 시 이 요금 정책을 유지하면서 모든 호출보다 admission을 앞세워야 한다. 다섯 무료 LLM 경로와 혼동해서 0으로 바꾸지 않는다.
- **다른 작업과의 통합 경계:** 원본 master는 아직 57e9bee지만 캐릭터 API·characters.ts·pdp.character.ts 등에 미커밋 수정이 있다. 새 `202609110004_character_turnaround_sheet.sql`은 character_views.angle에 sheet를 추가한다. 이 다각도 한 장 기능의 호출 수·가격을 확인한 뒤 캐릭터 v2 변경과 합쳐 검증한다. 해당 원본 수정은 건드리지 않았다.

### 후속: 포스터 기획의 설계 범위 대조

- §9의 명시 대상인 포스터 plan을 유료 호출 이전에 v2 admission하도록 연결했다. §11.1의 현재 분류 추적 요구에 따라 이미지 생성과 구분되는 poster_plan으로 기록하되, 사용자 요금은 기존의 LLM 비용/크레딧 환산을 유지한다. 무료 LLM 다섯 경로는 계속 0크레딧이다.
- §7.3의 늦은 LLM 응답 덮어쓰기 방지를 위해 기존 poster store update에 expectedUpdatedAt 조건을 추가했다. SQL 조건부 UPDATE와 로컬 원자적 update 안에서 검사한다. 기획 결과 캐시에도 최초 revision을 남긴다.
- T08에 따라 사용량 누락은 0원 정산 대신 needs_reconciliation으로 남는다. T11의 단일 정산과 이미지 생성 상태를 건드리지 않는 동작을 실제 PostgreSQL에서 확인했다. 해당 DB suite 11개 통과. 호출 전 한도 확인·원래 캐시 revision 재사용에 대한 웹 시험 3개 통과; 타입 검사와 변경 영역 lint 통과.
- 별도 검토: 모델/품질을 바꾸거나 크레딧 단위를 바꾸지 않았다. 정상 응답이 확보한 크레딧을 초과하면 기존 설계대로 대조 상태가 되며 임의 추가 차감하지 않는다. 실제 운영 정책 값 및 정상 입력의 예산 적합성 검증은 출시 전에 남아 있다.

### 후속: §9 PDP 동기 이미지 처리

- key-visual/images/batch를 v2 실행에 연결했다. fal 응답은 다운로드 전에 비공개 회차 캐시에 보관하고, 완성된 이미지와 최종 응답도 보관한 뒤 정산한다. 다운로드 실패는 동일 응답에서 재시도하고, 불명확한 제출은 재제출하지 않는다.
- 사용자에게 제공한 이미지의 digest 집합으로 delivered_images를 확정한다. QA 중 버린 이미지는 원가에 남기고 사용자에게 중복 청구하지 않는다. 대표 이미지도 실제 모델·크기·모드 단가를 확보/정산에 사용한다.
- 기존 배치 Promise.allSettled·부분 성공 응답·섹션 위치·강조어·캐릭터/스타일 전달을 유지했다. 병렬 재실행 순서가 바뀌어도 LLM 응답이 다른 섹션으로 붙지 않도록 입력 hash와 동일 입력 발생 순번으로 식별한다.
- 실제 파일 저장소와 가짜 fal을 연결한 시험에서 정산 DB 실패, 원본 응답 DB 기록 실패, 다운로드 실패 후 복구를 확인했다. 동일 키 재요청의 외부 생성은 한 번이었다. 활성 lease는 재요청이 빼앗지 않으며, 만료를 모사한 후 복구를 검증했다. 운영 DB 권한 시험을 대신하는 증거는 아니다.
- 웹 전체 173파일/1892시험, 타입 검사, 변경 파일 lint 통과. 자동 executor의 복구 연결은 단계 6에서 해야 한다. 단계 5의 리디자인·캐릭터 경로는 계속 진행 중이다.

### 후속: §9 리디자인 생성/수정 처리

- core에 선택적 provider 호출 hook을 주입하고 web adapter가 원본 응답·완성 이미지·정산을 기록한다. 기존 프롬프트·선택 경로·출력 품질은 유지한다. generate는 high 직접 호출과 fal max 경로를 구분하고, edit는 실제 low 설정을 유지한다.
- edit 단가는 기존 저장소 이력 0d2efb8(low $0.02), e858b28(high $0.21)과 현재 Google $0.13을 구분한다. fal 새 모델의 $0.165를 low 수정에 덮어씌우지 않는다. 고정 1 정산 대신 실제 경로의 snapshot으로 계산한다.
- T21 실제 로컬 장부+가짜 HTTP 시험: OpenAI low edit 1, Google edit 3, 재요청 외부 호출 1회. generate는 OpenAI 직접/Google 직접/fal 각각의 실제 단가와 부분 성공을 확인했다. 생성 중 지식 검색을 켠 경우의 embedding도 같은 호출 hook을 통과한다. 독립 지식 색인 API는 이번 범위에서 수정하지 않았다.
- 입력은 인증 뒤에 최대 64 MiB multipart/32 MiB JSON으로 읽는다. 클라이언트의 기존 요청 식별자를 보존하고 v2 헤더를 붙였다. 실제 청구서는 별도 대조 대상이며 이 시험은 provider 요금 청구 검증이 아니다.
- 웹 전체 175파일/1899시험, redesign-core 64시험, 타입 검사·변경 파일 lint·diff 검사 통과.
- 별도 확인 대상(이번에 기능 변경하지 않음): 기존 generateImage 주입은 Google 선택에도 fal 이미지 생성기를 사용한다. 이번 장부는 실제 호출된 제공자를 기록하지만, 선택 UI/라우팅 정책 자체는 변경하지 않는다.
- 진행 중 master에 사용자 기능 PR #98–#101이 병합되어 기준이 68b1082로 전진했다. 캐릭터를 수정하기 전에 격리 브랜치에 최신 기준을 통합한다. 새로운 사용자 기능을 이 작업에서 설계하거나 추가하는 것은 아니다.

### 단계 5 마무리와 별도 대조

- master 68b1082를 393e1c5에서 통합한 뒤 새 캐릭터 구조에 연결했다. 후보·각도·sheet의 실제 모델/비율로 계산하고 정면 재사용은 차감하지 않는다. 정면만 저장하는 0크레딧 흐름도 유지했다.
- 캐릭터 생성은 run ID를 저장 ID로 재사용하고 참고 이미지 ID도 회차/각도로 고정한다. 재시도에 캐릭터·각도·참고 이미지가 늘어나지 않는 실제 파일 저장소 시험을 통과했다. 각도 파일은 회차 경로를 쓰며, 유효 lease가 없는 작업자의 메타데이터 쓰기는 PostgREST 헤더와 DB trigger로 차단한다. 헤더는 REST에만 보내고 Storage/Auth에는 보내지 않는다.
- 생성 중 DELETE는 파일 삭제 전에 차단한다. 실제 PG에서 오래된 작업자·다른 소유자 쓰기·활성 작업 삭제를 재현한 후 수정했다. 새 마이그레이션은 0026–0028이며 운영 미적용이다.
- 원본 응답 캐시는 불변이며 최종 응답은 lease epoch별 객체로 분리한다. DB가 승인한 resultRef 또는 복구 가능한 회차 파일을 조회하여 늦은 실행이 최신 결과를 덮어쓰지 않는다. 로컬 파일은 완성한 임시 파일의 hard link로 원자적으로 게시한다.
- 다시 해석하는 캐릭터 바이트·PDP 조립 입력·리디자인 지식 검색 결과를 별도 비공개 입력 캐시에 고정한다. 재시도 때 사용자가 바꾼 자료가 기존 실행에 섞이지 않도록 한 §9 입력 보존 구현이다.
- §11 표 재대조에서 v2가 PDP의 ANALYZE_HOURLY_LIMIT과 v1 승인 횟수를 빠뜨린 것을 실제 DB RED로 확인하고 수정했다. 30/시간 합산은 명시된 무료 LLM 다섯 작업에 적용한다. poster plan에 별도의 임의 시간당 상한을 만들지 않는다.
- 전사 입력은 기존 8개 스트립/2048×2560 정상 최대를 통과하는 byte/pixel 검사를 추가했다. 원본 이미지 바이트는 변경하지 않는다. V2 operation type과 실제 DB check/RPC 허용 목록의 일치도 검사한다.
- 검증: 전체 pnpm test 성공(웹 182파일/1957시험 포함), 실제 PG 37시험 성공. 이후 추가한 operation 계약 DB 시험과 generation/전사 관련 49시험 성공. 타입 검사·변경 파일 lint·diff 검사 성공.
- 남은 경계: 자동 실행/대조·heartbeat·운영 예산·CSP/HTTPS·실제 운영/통합 검증은 6–8단계다. 코드 구현을 운영 적용이나 최종 상용화 판정으로 보지 않는다.
- 사용자 병행 작업: 라이브러리 da07cbe는 UI/선택 값 전달 변경이며 API/DB diff는 없었다. 이 커밋도 통합한 뒤 검사한다. 설계 밖의 UI 개선은 이 브랜치에서 추가하지 않는다.

운영 DB에서 mutation 회귀시험을 실행하지 않는다. test-postgres는 운영 URL/키를 읽지 않고 localhost 전용 임시 클러스터를 생성한다. Auth/Storage 최소 스키마는 fixture이며 실제 Supabase Auth E2E를 대신하지 않는다.

실행: `node --test scripts/tests/usage-database.test.mjs`. PostgreSQL bin은 `TEST_PG_BIN`으로 지정 가능. Windows 기본값은 설치된 PostgreSQL 17 bin. CI는 PostgreSQL bin을 PATH에 제공한다.

## 단계 1 실패 증거

PostgreSQL 17.10, 정본 번호형 migration 전체 replay. 2026-09-11 실행 결과: tests 4, pass 0, fail 4, duration 8273ms. 설정 실패가 아닌 assertion 실패를 확인했다.

```text
T29 teammate can read shared cards: actual '0', expected '1'
T04 browser cannot write server settlement data: actual 't', expected 'f'
T01 completed expired generation: consumed actual '0', expected '8'
T14 concurrent team quota: team quota 10, held 16
```

별도 검토: T14는 서로 다른 psql 연결/트랜잭션으로 재현했고, T29는 postgres가 아니라 `SET LOCAL ROLE authenticated` 및 auth.uid fixture로 확인했다. T04는 실제 PostgreSQL 열 권한 질의다. JWT 검증·Supabase HTTP 계층은 아직 시험하지 않았다. 정본 SQL에는 운영 미적용 default 100 파일도 있으므로 이 시험의 seed가 quota를 명시적으로 고정한다; 운영 기본 30을 바꾸지 않는다.

## 단계 2 결과와 리뷰

- 새 실행 시험: 최초 4개는 함수/표 미구현으로 RED. 구현 후 4/4 성공.
- 정산/오래된 lease 시험: 추가 2개 RED 후 구현하여 6/6 성공.
- 별도 diff 검토에서 날짜가 바뀌면 전날 확보분이 당일 예산에서 빠지는 문제 발견. T03/T19를 먼저 추가해 `Missing expected rejection` 실패를 확인하고 수정, 7/7 성공.
- 기존 재현 시험 중 단계 2 대상 T29/T01/T14는 3/3 성공. T04는 다음 단계의 앱 저장소 전환 후 권한을 회수해야 하므로 아직 실패하며, 통과로 계산하지 않는다.
- `pnpm test`: 250 test files / 3260 tests 성공. 문자열 기반 구형 시험과 별개로 실제 PostgreSQL 테스트를 실행했다.
- provider 비용은 개별 시도의 실제 제출일로 집계한다. 미해결 run 전체 확보분은 날짜와 무관하게 오늘의 새 비용 admission에도 포함하는 보수적인 정책이다. 문서의 prepared 확보분을 하루마다 이동시키는 구현보다 단순하고, 날짜 변경으로 노출을 잊지 않는다.
- 아직 API가 v2를 호출하지 않는다. 새 admission은 기본 closed다. 이 커밋만 운영에 배포해 모든 결함이 해결됐다고 주장하지 않는다. v1 호환의 늦은 정산 복구는 v1 시간 만료 후 추가 비용을 완전히 방지하는 해결책이 아니며, v2 전환/구형 실행 drain이 필요하다.
- 이행 판단: DB 기반에 한해 다음 단계로 진행 가능. 운영 적용/최종 리뷰는 미완료.

## 단계 3 결과와 리뷰

- 소유권 선검사 route 시험 7개 RED→GREEN. 실제 guard의 actor/id 조건·DB 오류·허용 자산 부분 누락도 별도 검사.
- T04 실제 column grant가 false로 바뀌고, 기존 앱은 authenticated 읽기와 server-owned 쓰기를 분리. title 등 정상 입력/팀 읽기 범위는 유지한다.
- quota 2개, 자산 2개, 팀 이동/보관 5개 실제 DB 시험 통과. 마지막 팀장·다른 팀 빼오기·중간 work update 실패의 rollback 검증.
- 별도 리뷰에서 metadata 소유자만 확인하면 자기 metadata에 타인 Storage 경로를 넣을 수 있음을 발견. RED `1 !== 0` 뒤 저장 경로 첫 namespace도 원 소유자와 대조하도록 수정.
- 팀 자식 RLS에 ‘부모 ID=자기 폴더 ID’인 fixture를 추가하여, 같은 팀의 부모 하나가 다른 팀의 모든 자식 조회를 허용하지 않는지 검증.
- 팀 이동의 오래된 source-string 시험은 실제 RPC adapter 시험과 DB transaction 시험으로 교체했다. 실패 검증 자체를 제거한 것이 아니다.
- 세션 전용 membership/server를 팀 조회 모듈에 static import했을 때 로컬 읽기가 React cache 오류를 내는 회귀를 잡아, 쓰기 경로에서만 로드하도록 수정. 로컬 모드 11개 시험 통과.
- 웹 전체 1849개 시험·tsc·관련 lint 성공. DB 전체 19개 성공 후 추가한 archive 1개와 RLS 악조건 1개도 각 suite에서 성공(총 21개).
- 다음 단계: API의 영속 run/attempt 연결과 서버 진행. 단계 3만으로 구형 JSON 정산을 안전한 서버 실행 전체로 대체했다고 보지 않는다. 운영 적용은 하지 않았다.

## 단계 4 결과와 별도 검토

- SNS/포스터 생성 및 수정은 production에서 v2 run을 생성한다. status는 제공자 호출·정산 없이 run 상태와 결과만 읽는다. 로컬 기존 흐름은 유지하고 `GENERATION_EXECUTION_V2=1`로 파일 기반 v2를 확인할 수 있다.
- 요청 ID/가격은 서버 snapshot과 attempt에서만 사용. 공급자 수락 뒤 checkpoint 유실 시 attempt의 ID로 흐름을 재구성한다. 결과 저장 오류는 재생성이 아니라 저장 재시도다.
- 서로 다른 생성 회차의 SNS 파일 경로를 분리. 포스터 이미지 중복 저장은 회차/변형 unique를 사용. 제출 전 호환 request 행도 기록한다.
- 브라우저 없이 tick 함수만 실행해 SNS 두 장이 순차 생성되고 정산이 한 번 일어나는 시험 통과. 수락 후 checkpoint 실패를 주입해도 제출은 두 번(각 카드 한 번)이다. SDK와 파일 저장은 가짜 제공자/저장 adapter를 사용했으며 운영 생성은 하지 않았다.
- 원고는 data.flow, 서버 실행 결과는 data.executionFlow. 실제 DB에서 실행 중 원고 수정 뒤 checkpoint가 와도 수정 내용이 살아 있음을 확인했다. 결과/라이브러리/초기 화면 선택도 새 projection을 읽도록 연결했다.
- 로컬 JSON 기록을 다시 열어도 run/accepted ID가 유지되고 한 번만 정산하는 시험 통과. 로컬 모드는 PostgreSQL 권한/다중 프로세스 동시성 증거가 아니다.
- 새 프로토콜 헤더가 없는 구형 화면은 비용 발생 전에 새로고침 안내. 원고/결과 flow 차이로 구형 화면에 생성물이 안 뜨는 혼합 버전 문제를 막는다.
- LLM의 실행 중단/불명 응답을 fallback 대상으로 잘못 읽으면 추가 호출이 발생하므로 공통 제어 예외를 분리. 실제 실패 시험에서 backup 호출을 확인한 뒤 수정했다. SNS LLM 호출별 기록 기반은 단계 5의 의존 부분으로 함께 추가했다.
- 별도 검토 추가: 캡션 run을 이미지 run으로 잘못 조회하지 않도록 operation까지 조회 조건에 포함. 프로젝트 완료와 정산은 같은 SQL 트랜잭션에서 확정.
- 별도 검토 추가: 이전 팀 사용량 20/새 팀 잔량 10 사례에서 DB와 UI 둘 다 -10을 반환하는 RED를 확인. effective quota와 UI를 고쳤고, 팀 집계는 PostgREST 페이지 제한 대신 SQL 집계로 전환하여 1100건+만료된 v2 확보 5를 1105로 확인.
- 자산 경로에 owner/../other 경로를 넣는 후속 RED를 추가해 canonical path 검사로 차단. 운영 데이터 변조 실험은 하지 않았다.
- 최근 전체 기존 suite: shared 81개, web 1860개 포함 전부 성공. 이후 추가한 quota/경로 시험도 개별 성공. 최종 전체 재검증은 통합 단계에서 반복한다.
- 미완료 경계: systemd 자동 실행, journal 소비/운영자 대조, 직접 호출 PDP/리디자인의 영속 완료 처리, 나머지 LLM 경로 계량/제한, HTTPS/CSP, 실제 배포와 운영 smoke. 이 단계만으로 상용화 완료라 하지 않는다.
