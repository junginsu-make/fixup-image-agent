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
| A-1 | 미착수 | f82b21d | W1 / T-SAVE |
| A-2 | 미착수 | f82b21d | W1→W2 / T-STATE, 되돌리기 |
| A-3 | 미착수 | f82b21d | W2 / T-STATE |
| A-4 | 미착수 | f82b21d | W2 / T-SECTION |
| A-5 | 미착수 | f82b21d | W2 / T-MIGRATE, T-SECTION |
| A-6 | 미착수 | f82b21d | W2 / T-STATE, 두 제품 교차 |
| A-7 | 미착수 | f82b21d | W2 / T-STATE |
| A-8 | 미착수 | f82b21d | W1→W2 / T-SAVE |
| A-9 | 미착수 | f82b21d | W1 / T-SAVE, fake timers |
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
| B-7 | 미착수 | f82b21d | W1 보존→W2 undo / T-STATE |
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
| C-1 | 미착수 | f82b21d | W1 / T-INPUT, T-SETTLE; W4 recovery |
| C-2 | 미착수 | f82b21d | W1/W4 / T-SETTLE |
| C-3 | 미착수 | f82b21d | W3 / T-COST |
| C-4-a | 미착수 | f82b21d | W3 / Fable 포함 성공·실패 meter |
| C-4-b | 미착수 | f82b21d | W3/W8 / 실제 호출별 meter |
| C-5 | 미착수 | f82b21d | W1 / T-SETTLE |
| C-6 | 미착수 | f82b21d | W1/W4 / 전역·개별 오류 분리 |
| C-7 | 미착수 | f82b21d | W8 / T-LIMIT, pagination |
| C-8 | 미착수 | f82b21d | W1 / T-INPUT |
| C-9 | 미착수 | f82b21d | W1/W8 / T-LIMIT |
| C-10-a | 미착수 | f82b21d | W1 / 스키마 먼저, 안정된 오류 |
| C-10-b | 미착수 | f82b21d | W1/W3 / 상한+1 |
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
| F-7-2 | 미착수 | f82b21d | W1/W4 / 두 라우트 T-SETTLE |
| F-7-3 | 미착수 | f82b21d | W5/W7 / 분석 실패 주입 |
| F-7-4 | 미착수 | f82b21d | W3 / 실행 endpoint·model capture |
| F-7-5 | 미착수 | f82b21d | W3 / T-COST, 품질 payload |
| F-7-6 | 미착수 | f82b21d | W3 / T-COST |
| F-7-7 | 미착수 | f82b21d | W3/W4 / 청크 독립 금액 |
| F-7-8 | 미착수 | f82b21d | W4 / T-JOB |
| F-7-9 | 미착수 | f82b21d | W3/W8 / 성공·실패 meter와 limit |
| F-7-10-a | 미착수 | f82b21d | W3/W4 / T-COST |
| F-7-10-b | 미착수 | f82b21d | W1/W8 / T-INPUT, T-LIMIT |
| K-01 | 미착수 | f82b21d | W2 / T-STATE |
| K-02 | 미착수 | f82b21d | W1/W2 |
| K-03 | 미착수 | f82b21d | W2 / T-STATE |
| K-04 | 미착수 | f82b21d | W4 / T-JOB |
| K-05 | 미착수 | f82b21d | W1 보호/W4 완료 |
| K-06 | 미착수 | f82b21d | W1/W4 |
| K-07 | 미착수 | f82b21d | W1/W4 |
| K-08 | 미착수 | f82b21d | W7 / T-PLAN |
| K-09 | 미착수 | f82b21d | W5 / T-EVIDENCE |
| K-10 | 미착수 | f82b21d | W5 / T-REVIEW |
| K-11 | 미착수 | f82b21d | W5 / T-IDENTITY |
| K-12 | 미착수 | f82b21d | W5 / T-REVIEW |
| K-13 | 미착수 | f82b21d | W1/W4 |
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
| X-01 | 미착수 | f82b21d | T-SAVE/T-STATE |
| X-02 | 미착수 | f82b21d | T-SETTLE/T-COST |
| X-03 | 미착수 | f82b21d | T-MODEL/T-COST |
| X-04 | 미착수 | f82b21d | T-INPUT/T-JOB |
| X-05 | 미착수 | f82b21d | T-REF/T-PLAN |
| X-06 | 미착수 | f82b21d | 실제 config/output 대조 |
| X-07 | 미착수 | f82b21d | T-SECTION/T-EXPORT |
| X-08 | 미착수 | f82b21d | T-MODEL/T-REF |
| X-09 | 미착수 | f82b21d | W8 검증 산출물 |
