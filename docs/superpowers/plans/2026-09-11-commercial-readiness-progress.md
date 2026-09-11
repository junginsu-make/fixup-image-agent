# 상용화 개선 진행 기록

기준: `57e9bee`, 작업 브랜치 `fix/commercial-readiness`, 별도 `.worktrees/commercial-hardening`.
사용자 승인: 설계 대조, 순차 구현·검증·별도 리뷰·필요한 반영 승인. 클로드 동시 작업 범위 확인은 진행 중.

| 단계 | 구현 | 검증/별도 리뷰 | 운영 적용 |
|---|---|---|---|
| 0 기준 고정/분리 | 별도 worktree 및 의존성 설치 | 최신 운영 관측 포함 설계 복사 | 변경 없음 |
| 1 실제 DB RED | 임시 로컬 PostgreSQL 격리 시험 작성 | 4개 의도한 실패 재현, 실패 원인 확인 | 변경 없음 |
| 2 DB 호환 기반 | v2 실행/시도/정산·예산·lease, v1 호환, 팀 자식 RLS | DB 단계 시험 10개 성공; 전체 기존 3260개 성공; 별도 검토에서 날짜 경계 보완 | 미적용 |
| 3 권한/예산 | 미착수 | 미실행 | 미적용 |
| 4 비동기 실행 | 미착수 | 미실행 | 미적용 |
| 5 동기/LLM | 미착수 | 미실행 | 미적용 |
| 6 운영 처리기 | 미착수 | 미실행 | 미적용 |
| 7 웹 보안 | 미착수 | 미실행 | 미적용 |
| 8 출시 검증 | 미착수 | 미실행 | 미적용 |

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
