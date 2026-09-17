# 상세페이지 개선 실행 기록

기준 SHA: f82b21d61b96525be445c441f484609d06d0673e
브랜치: fix/pdp-integrated-improvement
원본 작업공간의 진행 중인 SNS·포스터·수동 SQL은 가져오거나 변경하지 않았다.

## W0
- 설계 §14의 전체 122개 추적행을 현행 기준에 등록했다. 아래 검증 계획은 설계 원문을 따른다.
- 기존 코드에 대한 단위/타입 검사 결과는 pdp-validation/w0-* 파일이다.
- 이전 보고서의 880개 통과 기록은 재사용하지 않는다.
- 리뷰 방식: 구현자가 별도 diff 검토를 수행한다. 독립 에이전트 리뷰로 표시하지 않는다.

## 이슈 추적 상태

| ID | 상태 | 기준 SHA | 재현/검증 계획 |
|---|---|---|---|
| A-1 | W1 구현·검증 완료 | f82b21d | W1 / T-SAVE |
| A-2 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1→W2 / T-STATE, 되돌리기 |
| A-3 | 미착수 | f82b21d | W2 / T-STATE |
| A-4 | 미착수 | f82b21d | W2 / T-SECTION |
| A-5 | 미착수 | f82b21d | W2 / T-MIGRATE, T-SECTION |
| A-6 | 미착수 | f82b21d | W2 / T-STATE, 두 제품 교차 |
| A-7 | 미착수 | f82b21d | W2 / T-STATE |
| A-8 | W1 구현·검증 완료 | f82b21d | W1→W2 / T-SAVE |
| A-9 | W1 구현·검증 완료 | f82b21d | W1 / T-SAVE, fake timers |
| A-10 | 미착수 | f82b21d | W3 / T-REF, 설정 복구 |
| A-11 | 미착수 | f82b21d | W2/W3 / T-STATE, T-REF |
| A-12 | 미착수 | f82b21d | W2 / T-STATE |
| A-13 | 미착수 | f82b21d | W2/W7 / 모드별 재기획·busy·오류 표시 |
| A-14 | 미착수 | f82b21d | W3 / 목록 오류와 현재 참조 표시, 제출 검증 |
| A-15 | 미착수 | f82b21d | W2 / T-SECTION |
| A-16 | 미착수 | f82b21d | W2/W4 / 생성 중 reorder 대역 |
| A-17 | 미착수 | f82b21d | W2 / T-STATE |
| A-18 | 미착수 | f82b21d | W2 / T-MIGRATE |
| B-1 | 미착수 | f82b21d | W6 / T-EXPORT |
| B-2 | 미착수 | f82b21d | W6 / 실제 width/height·원본 보존 |
| B-3 | 미착수 | f82b21d | W6 / T-EXPORT |
| B-4 | 미착수 | f82b21d | W6 / 폰트 없는 OS 검증 |
| B-5 | 미착수 | f82b21d | W6 / T-EDITOR |
| B-6 | 미착수 | f82b21d | W6 / T-EDITOR |
| B-7 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1 보존→W2 undo / T-STATE |
| B-8 | 미착수 | f82b21d | W2 / 선택 UUID 유지 |
| B-9 | 미착수 | f82b21d | W6 / 공통 완성본 렌더 |
| B-10 | 미착수 | f82b21d | W6 / T-EXPORT, 미재현이면 증거로 종결 |
| B-11 | 미착수 | f82b21d | W6 / T-EDITOR |
| B-12-a | 미착수 | f82b21d | W6 / 실제 다운로드 |
| B-12-b | 미착수 | f82b21d | W6 / 오류 표시·원본 보존 |
| B-12-c | 미착수 | f82b21d | W6/W8 / 드래그 응답과 저장 수 |
| B-12-d | 미착수 | f82b21d | W6 / T-EXPORT |
| B-12-e | 미착수 | f82b21d | W6 / T-EXPORT |
| B-12-f | 미착수 | f82b21d | W6 / 재현 시 수정 |
| B-12-g | 미착수 | f82b21d | W2 / T-MIGRATE |
| C-1 | W1 구현·검증 완료 | f82b21d | W1 / T-INPUT, T-SETTLE; W4 recovery |
| C-2 | W1 구현·검증 완료 | f82b21d | W1/W4 / T-SETTLE |
| C-3 | 미착수 | f82b21d | W3 / T-COST |
| C-4-a | 미착수 | f82b21d | W3 / Fable 포함 성공·실패 meter |
| C-4-b | 미착수 | f82b21d | W3/W8 / 실제 호출별 meter |
| C-5 | W1 구현·검증 완료 | f82b21d | W1 / T-SETTLE |
| C-6 | W1 구현·검증 완료 | f82b21d | W1/W4 / 전역·개별 오류 분리 |
| C-7 | 미착수 | f82b21d | W8 / T-LIMIT, pagination |
| C-8 | W1 구현·검증 완료 | f82b21d | W1 / T-INPUT |
| C-9 | 미착수 | f82b21d | W1/W8 / T-LIMIT |
| C-10-a | W1 구현·검증 완료 | f82b21d | W1 / 스키마 먼저, 안정된 오류 |
| C-10-b | W1 구현·검증 완료 | f82b21d | W1/W3 / 상한+1 |
| C-10-c | 미착수 | f82b21d | W1/W8 / T-INPUT |
| D-1 | 미착수 | f82b21d | W3 / T-REF |
| D-2 | 미착수 | f82b21d | W3 / 동일 실행 의도 검사 |
| D-3 | 미착수 | f82b21d | W5 / T-PARSE |
| D-4 | 미착수 | f82b21d | W8 / T-BUNDLE |
| D-5 | 미착수 | f82b21d | W5/W8 / T-PARSE |
| D-6 | 미착수 | f82b21d | W5 / T-PARSE |
| D-7 | 미착수 | f82b21d | W3/W5 / 잘림·길이 검증 |
| D-8 | 미착수 | f82b21d | W1/W3 / T-INPUT |
| D-9 | 미착수 | f82b21d | W3 / T-COST |
| D-10 | 미착수 | f82b21d | W8 / T-BUNDLE, 활성 prompt capture |
| D-11-a | 미착수 | f82b21d | W5 / T-IDENTITY |
| D-11-b | 미착수 | f82b21d | W5 / T-REVIEW |
| D-11-c | 미착수 | f82b21d | W8 / 호출 그래프 |
| D-11-d | 미착수 | f82b21d | W3/W8 |
| D-11-e | 미착수 | f82b21d | W3/W5/W8 |
| E-6-1 | 미착수 | f82b21d | W3 / T-COST |
| E-6-2-a | 미착수 | f82b21d | W1/W4 / T-SQL |
| E-6-2-b | 미착수 | f82b21d | W4 / T-JOB |
| E-6-3-a | 미착수 | f82b21d | W1/W8 / T-SAVE, T-LIMIT |
| E-6-3-b | 미착수 | f82b21d | W2/W8 / 만료 경계 |
| E-6-3-c | 미착수 | f82b21d | W1 / T-SAVE |
| F-7-0 | 미착수 | f82b21d | W7/W8 / T-PLAN, T-LIMIT |
| F-7-1 | 미착수 | f82b21d | W3/W5/W8 |
| F-7-2 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1/W4 / 두 라우트 T-SETTLE |
| F-7-3 | 미착수 | f82b21d | W5/W7 / 분석 실패 주입 |
| F-7-4 | 미착수 | f82b21d | W3 / 실행 endpoint·model capture |
| F-7-5 | 미착수 | f82b21d | W3 / T-COST, 품질 payload |
| F-7-6 | 미착수 | f82b21d | W3 / T-COST |
| F-7-7 | 미착수 | f82b21d | W3/W4 / 청크 독립 금액 |
| F-7-8 | 미착수 | f82b21d | W4 / T-JOB |
| F-7-9 | 미착수 | f82b21d | W3/W8 / 성공·실패 meter와 limit |
| F-7-10-a | 미착수 | f82b21d | W3/W4 / T-COST |
| F-7-10-b | W1 보호 완료, 후속 단계 남음 | f82b21d | W1/W8 / T-INPUT, T-LIMIT |
| K-01 | 미착수 | f82b21d | W2 / T-STATE |
| K-02 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1/W2 |
| K-03 | 미착수 | f82b21d | W2 / T-STATE |
| K-04 | 미착수 | f82b21d | W4 / T-JOB |
| K-05 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1 보호/W4 완료 |
| K-06 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1/W4 |
| K-07 | W1 구현·검증 완료 | f82b21d | W1/W4 |
| K-08 | 미착수 | f82b21d | W7 / T-PLAN |
| K-09 | 미착수 | f82b21d | W5 / T-EVIDENCE |
| K-10 | 미착수 | f82b21d | W5 / T-REVIEW |
| K-11 | 미착수 | f82b21d | W5 / T-IDENTITY |
| K-12 | 미착수 | f82b21d | W5 / T-REVIEW |
| K-13 | W1 구현·검증 완료 | f82b21d | W1/W4 |
| U-01 | 미착수 | f82b21d | W3 / T-REF |
| U-02 | 미착수 | f82b21d | W5 / T-IDENTITY |
| U-03 | 미착수 | f82b21d | W2/W3 |
| U-04 | 미착수 | f82b21d | W3 / T-REF |
| U-05 | 미착수 | f82b21d | W3 / 각도 선택 fixture |
| U-06 | 미착수 | f82b21d | W3/W7 / T-PLAN |
| U-07 | 미착수 | f82b21d | W3 / 모든 ratio payload |
| U-08 | 미착수 | f82b21d | W1/W7 |
| U-09 | 미착수 | f82b21d | W2 / T-SECTION |
| U-10 | 미착수 | f82b21d | W5/W7 |
| U-11 | 미착수 | f82b21d | W2/W7 |
| U-12 | 미착수 | f82b21d | W5/W7 |
| U-13 | 미착수 | f82b21d | W5/W7 / T-EVIDENCE |
| U-14 | 미착수 | f82b21d | W7 / T-PLAN |
| U-15 | 미착수 | f82b21d | W2/W5/W7 |
| U-16 | 미착수 | f82b21d | W9 보고. 전환율 개선을 출시 합격으로 위장하지 않음 |
| U-17 | 미착수 | f82b21d | W3 / T-MODEL |
| U-18 | 미착수 | f82b21d | W3/W5/W9 |
| X-01 | W1 보호 완료, 후속 단계 남음 | f82b21d | T-SAVE/T-STATE |
| X-02 | W1 보호 완료, 후속 단계 남음 | f82b21d | T-SETTLE/T-COST |
| X-03 | 미착수 | f82b21d | T-MODEL/T-COST |
| X-04 | W1 보호 완료, 후속 단계 남음 | f82b21d | T-INPUT/T-JOB |
| X-05 | 미착수 | f82b21d | T-REF/T-PLAN |
| X-06 | 미착수 | f82b21d | 실제 config/output 대조 |
| X-07 | 미착수 | f82b21d | T-SECTION/T-EXPORT |
| X-08 | 미착수 | f82b21d | T-MODEL/T-REF |
| X-09 | 미착수 | f82b21d | W8 검증 산출물 |


## W1 — 손실·예약 응급 수정

- TDD RED: `w1-save-red.txt`(실제 저장 왕복 2건 실패), `w1-api-red.txt`(요청/정산 10건 실패), `w1-redesign-red.txt`(4건 실패), `w1-checkpoint-red.txt`, `w1-review-red.txt`(앞 섹션 선제출), `w1-partial-red.txt`.
- 새 저장시계/저장상태 모듈의 첫 RED는 모듈 부재다(`w1-autosave-red.txt`, `w1-library-red.txt`). 기존 동작의 실패 재현과 구분한다.
- GREEN: `w1-final-green.txt` — 관련 33파일 267개. `w1-typecheck.txt` — 웹 타입 검사. `w1-lint.txt` — 변경 제품 파일 오류 0, 기존 img 경고 4.
- 넓은 회귀: `w1-web-regression.txt` — 웹 2695 통과, 6 skip(부분 성공 중단 시험 추가 직전). 최종 부분 성공 중단 변경은 위 관련 267개에 포함된다.
- 화면 연결: `draft-ui.test.tsx`가 실제 PdpMakerClient를 React renderer로 구동하여 복원값의 편집기 전달과 30초 연속 입력 저장을 확인했다. 실제 브라우저 픽셀/E2E 확인과는 다르다.
- 코드 리뷰: 같은 구현자가 별도 diff 검토. 배치 옵션 조립 중 먼저 제출되는 결함을 RED로 재현해 전부 조립 후 제출하도록 수정. 이전 비동기 저장 응답이 새 작업 ID를 덮는 것을 저장시계 identity로 방지. IndexedDB abort는 추가 검증에서 기존 코드가 이미 reject함을 확인해 변경하지 않았다.
- 재분석/단건 재생성/편집기 섹션 삭제/텍스트 재기획·대표 이미지 교체 전 별도 보관 초안. 저장 실패하면 변경을 중단한다. 즉시 undo UI와 revision 모델은 W2에서 진행한다.
- 초안 필드 추가·텍스트 중간 상태 보존은 기존 저장소 안에서 적용했다. v3 migration/정본 상태는 W2다. 자동 저장의 전체 필드 dependency는 W2 문서 revision으로 교체한다.
- 리디자인 자동 저장은 로컬과 서버 저장 결과를 구분하고 실패를 지속 표시한다. 서버 영구 job 복구는 W4다.
- 정산 실패는 결과/원래 오류를 보존하지만 기존 만료 정책·late settlement/중복 정산의 DB 수준 검증은 W4에 남는다.
- 인증 후 bounded body 읽기 및 예약 전 구조 검증. MIME signature·픽셀/파일 상한 실측·rate-limit 정책 DB 변경은 W8이다. C-9는 입력 오류의 예약 방지만 해결했고 전체 분석 한도 정책은 미완이다.
- W1 회귀/리뷰를 통과한 뒤에만 W2를 착수한다. Fable·모델 단가·제품 보존 정책은 W3까지 변경하지 않았다.
