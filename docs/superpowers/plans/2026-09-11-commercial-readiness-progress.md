# 상용화 개선 진행 기록

기준: `57e9bee`, 작업 브랜치 `fix/commercial-readiness`, 별도 `.worktrees/commercial-hardening`.
사용자 승인: 설계 대조, 순차 구현·검증·별도 리뷰·필요한 반영 승인. 클로드 동시 작업 범위 확인은 진행 중.

| 단계 | 구현 | 검증/별도 리뷰 | 운영 적용 |
|---|---|---|---|
| 0 기준 고정/분리 | 별도 worktree 및 의존성 설치 | 최신 운영 관측 포함 설계 복사 | 변경 없음 |
| 1 실제 DB RED | 임시 로컬 PostgreSQL 격리 시험 작성 | 4개 의도한 실패 재현, 실패 원인 확인 | 변경 없음 |
| 2 DB 호환 기반 | 미착수 | 미실행 | 미적용 |
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
