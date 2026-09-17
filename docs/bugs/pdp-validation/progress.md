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
| A-3 | W2 구현·검증 완료 | f82b21d | W2 / T-STATE |
| A-4 | W2 구현·검증 완료 | f82b21d | W2 / T-SECTION |
| A-5 | W2 구현·검증 완료 | f82b21d | W2 / T-MIGRATE, T-SECTION |
| A-6 | W2 구현·검증 완료 | f82b21d | W2 / T-STATE, 두 제품 교차 |
| A-7 | W2 구현·검증 완료 | f82b21d | W2 / T-STATE |
| A-8 | W1 구현·검증 완료 | f82b21d | W1→W2 / T-SAVE |
| A-9 | W1 구현·검증 완료 | f82b21d | W1 / T-SAVE, fake timers |
| A-10 | 미착수 | f82b21d | W3 / T-REF, 설정 복구 |
| A-11 | 미착수 | f82b21d | W2/W3 / T-STATE, T-REF |
| A-12 | W2 구현·검증 완료 | f82b21d | W2 / T-STATE |
| A-13 | W2 구현·검증 완료 | f82b21d | W2/W7 / 모드별 재기획·busy·오류 표시 |
| A-14 | 미착수 | f82b21d | W3 / 목록 오류와 현재 참조 표시, 제출 검증 |
| A-15 | W2 구현·검증 완료 | f82b21d | W2 / T-SECTION |
| A-16 | 미착수 | f82b21d | W2/W4 / 생성 중 reorder 대역 |
| A-17 | W2 구현·검증 완료 | f82b21d | W2 / T-STATE |
| A-18 | W2 구현·검증 완료 | f82b21d | W2 / T-MIGRATE |
| B-1 | 미착수 | f82b21d | W6 / T-EXPORT |
| B-2 | 미착수 | f82b21d | W6 / 실제 width/height·원본 보존 |
| B-3 | 미착수 | f82b21d | W6 / T-EXPORT |
| B-4 | 미착수 | f82b21d | W6 / 폰트 없는 OS 검증 |
| B-5 | 미착수 | f82b21d | W6 / T-EDITOR |
| B-6 | 미착수 | f82b21d | W6 / T-EDITOR |
| B-7 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1 보존→W2 undo / T-STATE |
| B-8 | W2 구현·검증 완료 | f82b21d | W2 / 선택 UUID 유지 |
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
| K-01 | W2 구현·검증 완료 | f82b21d | W2 / T-STATE |
| K-02 | W1 보호 완료, 후속 단계 남음 | f82b21d | W1/W2 |
| K-03 | W2 구현·검증 완료 | f82b21d | W2 / T-STATE |
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
| U-09 | W2 구현·검증 완료 | f82b21d | W2 / T-SECTION |
| U-10 | 미착수 | f82b21d | W5/W7 |
| U-11 | 미착수 | f82b21d | W2/W7 |
| U-12 | 미착수 | f82b21d | W5/W7 |
| U-13 | 미착수 | f82b21d | W5/W7 / T-EVIDENCE |
| U-14 | 미착수 | f82b21d | W7 / T-PLAN |
| U-15 | 미착수 | f82b21d | W2/W5/W7 |
| U-16 | 미착수 | f82b21d | W9 보고. 전환율 개선을 출시 합격으로 위장하지 않음 |
| U-17 | 미착수 | f82b21d | W3 / T-MODEL |
| U-18 | 미착수 | f82b21d | W3/W5/W9 |
| X-01 | W2 구현·검증 완료 | f82b21d | T-SAVE/T-STATE |
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


## W2 — 작업 정본·단계·v3 초안

- TDD RED: `w2-state-red.txt`(구성안 왕복·새 장면), `w2-scenario-save-red.txt`(확정 전 자동 저장에 옛 편집본), `w2-metadata-red.txt`(공통 디자인 소실), `w2-review-red.txt`(동시 수정 사본·이미지 중복), `w2-retention-red.txt`, `w2-delete-red.txt`, `w2-scene-red.txt`.
- `w2-document-red.txt`, `w2-migration-red.txt`, `w2-revision-red.txt`는 새 계약/함수 부재 RED와 구분해 보관했다.
- `PdpEditor`는 부모 구성안의 sections를 controlled 값으로 사용한다. 저장과 재진입도 같은 섹션 배열을 사용하며 배치·옵션은 section ID로 따라간다.
- 신규 섹션·AI 응답에 안정된 UUID를 부여한다. 장면 수정은 이전 영문 장면과 섞지 않고 현재 장면을 사용한다. 기존 영어를 그대로 유지하라는 옛 시험은 새 설계 계약에 맞춰 RED→수정했다.
- 실제 IndexedDB v3 저장소(documents/revisions/assets), 낙관적 revision 검사, 충돌 사본 보관, copy-on-write 이관, 원본 v2 유지. 생성 이미지·대표 이미지·텍스트 참조를 revision JSON에 반복 저장하지 않고 assets에서 복구한다.
- `PDP_DOCUMENT_V3=1`에서 새 저장 경로. 기본값은 off이며 이미 v3로 저장한 작업은 off에서도 읽을 수 있다. 다른 프로젝트의 환경변수는 변경하지 않았다.
- 새 revision 저장은 이전 저장소의 원본을 삭제하지 않는다. quota/쓰기 실패, 다른 탭 충돌, 보관된 이미지·레이어 복구 시험 통과.
- 입력 필드 나열 대신 저장 snapshot의 변경값으로 revision을 관측한다. ID/알림 갱신은 dirty로 만들지 않는다.
- 데이터가 없는 텍스트 stage는 입력으로 복구한다. 01 버튼은 실제 텍스트 입력으로 돌아간다. 구성안에서 유료 결과 섹션을 삭제할 때도 보관하고 이전 초안으로 되돌릴 수 있다.
- 리뷰 보완: 확정 전 자동 저장도 편집기 사본과 구성안이 일치하도록 `editorForSections`를 공유했다. 원문 디자인 metadata를 정규화가 버리는 문제도 실제 저장 시험으로 고쳤다. 공개되지 않은 새로운 기능은 추가하지 않았다.
- GREEN: `w2-web-regression.txt` — 웹 2712 passed / 6 skipped. `w2-core.txt` — pdp-core 620 passed. `w2-typecheck.txt` 통과. `w2-lint.txt` 오류 0, 기존 img 경고 4.
- 실제 브라우저: `w2-browser.cjs` / `w2-browser.txt` — 분리 worktree의 Next dev(3107), Edge headless, 두 모드의 입력→수정/추가→생성→왕복→v3 저장/새로고침, 이미지 3장과 수정 문구 복구 통과. 유료 `/api/pdp` 호출은 전부 mock이며 실제 AI 품질 시험은 아니다.
- 코드 리뷰는 구현자 자체 diff 리뷰다. 새 문서의 서버 저장/승인 snapshot/QA 상태·원가 모델은 각각 W4/W5/W3에서 확장한다. v3의 보관기간 및 자산 GC·용량 측정은 E-6-3/W8 검증 과제이며 기존 v2 이관 전에 청소하지 않는다.
- 레거시에 원래 기록되지 않았던 원문·모델 선택은 복원할 수 없다. 새 필드 기본값과 보존된 결과를 사용한다.


## W3 — 기획 모델·참조·원가 (이어받아 진행)

코덱스가 실호출 검증에서 멈춘 지점을 이어받았다. 멈춘 원인부터 밝히고 고쳤다.

### 멈춘 원인 — 텍스트 기획이 잘려 죽었다

`w3-live-planning.txt` 의 두 줄이 그대로 증거다.

```
image : passed  (섹션 6개, 4호출, $1.00, 241초)
text  : failed  (INVALID_REQUEST, 111초)
```

추적 결과 `normalizeTextBlueprint`(`pdp.text-plan.ts:409`)의 「섹션이 0개」였다.
그 앞을 거슬러 가면 원인은 **모델이 답을 끝까지 못 썼는데 아무도 안 봤다**는 것이다.

- `viaAnthropic`(`apps/web/lib/pdp/providers.ts`)이 `stop_reason` 을 확인하지 않았다.
  `max_tokens` 로 끊긴 조각난 도구 인자가 정상 응답처럼 아래로 흘렀다.
- 코어가 `maxTokens: 8192` 를 손으로 실어 보내 제공자의 모델별 정책을 덮었다
  (`pdp.text-plan.ts` 의 `depsFrom`, `pdp.service.ts` 의 `legacyContentsClient`).
- 그래서 사용자는 111초를 기다리고 값을 다 치른 뒤 「구성안을 만들지 못했습니다」만 받았다.

이는 설계 §10.1 「잘림은 명시 오류다. 모델 종료 이유·응답 크기를 남긴다」와
Claude 리뷰 D-7 에 해당한다.

### 고친 것

| 항목 | 내용 | 증거 |
|---|---|---|
| D-7 | `stop_reason === "max_tokens"` 를 `PdpResponseTruncatedError` 로 즉시 던진다. 잘림은 예비 모델로 넘기지 않는다 — 같은 길이를 또 치르고 또 잘린다 | `providers.test.ts` 3건 RED→GREEN |
| D-7 | 기획 호출의 길이 상한을 목적별로 나눴다(`PLANNING_MAX_TOKENS = 32768`, 검수는 8192 유지) | 같은 시험 |
| D-7 | 잘림을 `AI_RESPONSE_INVALID` 로 매핑해 「처리 중 오류」로 뭉개지 않는다 | `pdp.planning-call.test.ts` |
| §3 | 이름→목적 표(`purposeOfCall`)를 **코어 한 곳**에 두고 제공자가 그것을 쓴다. 코어는 길이 상한을 손으로 정하지 않는다 | `pdp.planning-call.test.ts` 3건 |
| C-3 / E-6-1 | 대표 이미지가 `imageCreditUnits(model, 1)` 로 예약하고 **같은 값**으로 확정한다. flare 기준 1장 → 5장 | `route-reliability.test.ts` 2건 |
| F-7-6 | 섹션 수정의 예약과 차감이 같은 값에서 나온다(전에는 예약 4장·차감 1장) | `redesign/settlement.test.ts` |
| F-7-5 | 섹션 수정도 생성과 같은 길(fal · gpt-image-2.5 `max`)로 그린다. 키가 없을 때만 옛 직접 호출로 떨어진다 | 같은 시험 |

`finalize-safety.test.ts` 의 대표 이미지 행은 장수 리터럴 대신 **던지지 않는 갈래**를
쓰는지만 보도록 고쳤다. 장수는 `route-reliability.test.ts` 가 값으로 잰다 — 설계가 경계한
「소스 문자열 검사를 그대로 늘리는 방식」을 피한다.

### 이어받기 전에 이미 되어 있던 것 (코덱스 작업, 미커밋분에 포함)

- D-1: 참조 상한 초과를 `.slice()` 로 버리지 않고 `assertReferenceBudget` 이 거절한다
- D-2: `withModel` 이면 시스템 프롬프트도 「required」로 갈라진다
- U-01: 사용자 연출 지시가 정체성 보존을 이기지 못한다
- Fable 배선(`PDP_PLANNING_MODEL`), 기획 4xx 는 폴백으로 숨기지 않음, 실행 모델·폴백 사유 기록

### 검증

- `w3-continue-core-green.txt` — pdp-core 628 통과
- `w3-continue-web-green.txt` — 웹 2,723 통과 / 6 skip
- redesign-core 74 통과. 타입 검사 web·pdp-core·redesign-core 모두 0건
- **실호출은 다시 돌리지 않았다.** 텍스트 기획이 실제로 통과하는지는 W3 종료 전
  `w3-live-planning.cjs` 를 한 번 더 돌려 확인해야 한다(이미지 1회 $1 수준)

### 남은 W3 항목

D-9(단건·배치 모델 선택 규칙 통일), F-7-4(속도형 선택이 fal 고정 모델에 무시됨),
F-7-7(1장씩 분할로 올림 반복), F-7-9·F-7-10-a(전사·실패 경로 원가 기록),
C-4-a/b(기획·레퍼런스 분석 원가 기록), U-04~U-07, A-10·A-11·A-14, D-11-d/e.

D-1 은 **예약 전에 알리지 못한다.** `assertReferenceBudget` 이 제공자 안에서 던지므로
사용자는 예약을 잡은 뒤 오류를 본다(크레딧은 0장 확정으로 풀린다). 설계 §6.2 의
「예약/유료 제출 전에 알린다」를 채우려면 각도·조각 수를 예약 앞에서 세야 하는데,
캐릭터 조회가 `reservation.userId` 를 필요로 해 인증·예약 분리가 선행돼야 한다.
W4 의 job 계약에서 함께 처리하는 것이 맞다.

### W3 두 번째 묶음 — 모델 선택·원가·방향

| 항목 | 내용 | 증거 |
|---|---|---|
| F-7-4 | 화면의 선택(정밀형·속도형)이 **실제로 그리는 모델**을 정한다. 속도형→`nano-banana-pro`, 정밀형→`gpt-image-2.5-flare`. 전에는 무엇을 고르든 flare 가 그렸고 선택은 값에만 쓰였다 | `redesign/settlement.test.ts` 2건 |
| F-7-4 | 값도 실제로 그리는 모델에서 뽑는다. fal 키가 없어 옛 직접 호출로 떨어지면 그쪽 단가를 쓴다 | 같은 시험 |
| F-7-6 확장 | 리디자인 생성의 **예약과 차감이 같은 모델 단가**에서 나온다. 고치는 과정에서 예약만 실행 모델이고 차감은 옛 이름이던 불일치를 시험이 값으로 잡았다(예약 5 vs 차감 4) | `it.each(["google","openai"])` |
| F-7-10-a | 생성 실패 경로도 이미 나간 글값(`llmUsd`)을 장부에 남긴다. 분석은 끝났는데 첫 그림이 실패하면 그 요청이 0원으로 보였다 | 같은 파일 |
| U-07 | 화면비가 프롬프트의 `format.orientation` 을 정한다. 4:3·16:9 는 `horizontal`, 1:1 은 `square` | `pdp.orientation.test.ts` 6건 |
| U-07 배선 | **값만 고치면 아무 일도 안 일어난다.** 실제 생성 경로가 `aspectRatio` 를 안 넘기던 것을 시험으로 먼저 잡고(RED) 이었다 | 같은 파일의 생성 경로 시험 |
| D-9 | 이미지 모델은 **페이지가 정한다**로 통일했다. 단건만 `options.imageModel` 을 봤는데 조립기는 `page.imageModel` 로 덮어써, 값은 그 모델로 매기고 그림은 다른 모델로 그렸다 | `route-reliability.test.ts` 2건 |

C-4-a(텍스트 기획 원가)와 리디자인 분석의 `onUsage` 는 W1 에서 이미 이어져 있었다. 확인만 했다.

### 검증

- `w3-final-web-green.txt` — 웹 2,730 통과 / 6 skip
- `w3-final-core-green.txt` — pdp-core 635 통과. redesign-core 74 통과
- 타입 검사 web·pdp-core·redesign-core·shared 모두 0건

### W3 에서 의도적으로 넘긴 것과 이유

| 항목 | 왜 여기서 안 하나 | 어디로 |
|---|---|---|
| F-7-9 전사 계량·한도 | `reserve_generation` 이 네 가지 작업만 받는다(`202609070005_team_credit.sql:166`). 새 작업 종류는 **마이그레이션**이 필요하고, 그것을 앱보다 먼저 적용하면 운영이 멈춘다 | W4(DB 작업과 함께) |
| F-7-7 1장씩 분할 과금 | 화면(`redesign-wizard.tsx`)이 8장을 1장짜리 8번으로 쪼갠다. 논리 작업 단위 정산은 job 계약이 있어야 성립한다 | W4 |
| D-1 「예약 전에 알린다」 | 참조 장수를 세려면 캐릭터 조회가 필요한데 그것이 `reservation.userId` 를 요구한다. 인증·예약 분리가 선행돼야 한다 | W4 |
| U-04·U-05·U-06 | 인물/캐릭터 충돌 선택, 각도 정책 설명, 지시 목적 분리는 모두 **화면에 새 칸**이 필요하다 | W7 |
| A-11·A-14 | 레퍼런스 토글 상태와 캐릭터 목록 오류 표시. 화면 상태 작업이다 | W7 |
| C-4-b 레퍼런스 분석 원가 | `style-references` 는 예약 자체가 없다. 한도·용량과 함께 다뤄야 한다 | W8 |

### 실호출 재검증 — 통과 (2026-09-17 15:0x)

`w3-live-planning-pass.txt`. **두 모드 모두 Fable 로 통과했다.**

```
image : passed  섹션 6개 · anthropic/claude-fable-5 · $0.83 · 4호출 · 189초
text  : passed  섹션 6개 · anthropic/claude-fable-5 · $1.22 · 5호출 · 264초
```

- 텍스트 기획이 살아났다. 전(`w3-live-planning.txt`)에는 111초 뒤 `INVALID_REQUEST` 였다.
- 기획 호출은 전부 `purpose: planning` · `claude-fable-5` 다. 폴백은 한 번도 안 걸렸다.
- 출력 토큰이 이미지 13,395 · 텍스트 22,696 이다. **텍스트 기획이 옛 상한 8,192 를
  두 배 넘게 쓴다** — 잘린 이유가 이 숫자로 확인됐다. 지금 상한 32,768 은 그 위로 여유가 있다.
- 기획 한 번에 $0.8~1.2 다. 재작성이 붙으면 더 든다. W3 의 원가 기록이 이 값을 장부에 남긴다.

**돌리는 법**: `npx tsx docs/bugs/pdp-validation/w3-live-planning.cjs`.
`node` 로 직접 돌리면 안 된다 — 이 저장소의 `.ts` 는 매개변수 프로퍼티와 확장자 없는
import 를 쓰고, Node 의 타입 제거 모드는 둘 다 지원하지 않는다.

### 다음 차례가 먼저 할 일

W3 는 닫혔다. 다음은 W4(영구 생성·복구)이며, 그 안에서 F-7-9·F-7-7·D-1 의
「예약 전에 알린다」를 함께 처리한다.


## W4 — 영구 생성·복구 (진행 중)

설계 §8 은 테이블 넷·RLS·워커·정산 SQL 을 한 묶음으로 적어 두었지만, 그대로
한 번에 하면 검증이 얕아지고 **스키마는 되돌리기 어렵다.** 설계 §15 의
「독립 실패 시나리오 단위로 커밋」에 따라 넷으로 쪼갠다.

| 조각 | 내용 | 운영 영향 | 상태 |
|---|---|---|---|
| W4-a | 작업 상태 기계(순수 로직) | 없음 | **완료** |
| W4-b | 멱등·지문·lease 판단(순수 로직) | 없음 | **완료** |
| W4-c | SQL 마이그레이션 + repository | DB 적용 필요 | 미착수 |
| W4-d | job API + 워커 entrypoint | 배포 필요 | 미착수 |

### W4-a·W4-b — 무엇을 값으로 잴 수 있게 했나

`apps/web/lib/pdp/jobs/{state,claim}.ts`. **DB·네트워크를 모르는 순수 함수다.**

세 축이 서로 독립이라는 것이 핵심이다(설계 §8.2).

```
생성(generation) · 정산(settlement) · 보존(persistence)
```

- 정산이 실패해도 결과는 살아 있다. `result_available` 에서 `failed` 로 가는 길이 아예 없다
- 그림을 받았어도 저장 전에는 `done` 이라고 말하지 않는다
- 저장이 실패하면 **그 결과로** 다시 시도한다. 생성 축을 되돌리지 않는다 — 되돌리면 두 번 낸다
- 제출이 불확실하면(`submission=uncertain`) 자동 재전송하지 않는다. 공급자 멱등을
  확인하지 않았고, 확인 없이 보내면 두 번 낸다. 사람이 볼 일로 남긴다
- **생성이 끝났어도 정산·보존이 남으면 `isTerminal` 이 거짓이다.** 워커가 여기서
  손을 떼면 크레딧이 영영 안 닫힌다

멱등은 요청 key 만으로 판단하지 않고 **내용의 지문**을 함께 본다.
같은 key + 같은 지문이면 기존 작업을, 다른 지문이면 409 다. 끝난 작업도 같은
내용이면 그것을 돌려준다 — 다시 만들면 두 번 낸다. 섹션 **순서**는 지문에서 뺐다.
정렬을 바꾸는 날 같은 작업이 두 번 만들어지지 않게.

### 검증 — 변이로 시험을 시험했다

이 저장소는 「빨개질 수 없는 가드 시험」을 이미 겪었다(리뷰 기억 `fixup-vacuous-guard-tests`).
그래서 시험이 진짜 재는지 변이를 넣어 확인했다.

| 변이 | 잡혔나 |
|---|---|
| 결과 받은 뒤 실패로 가게 허용 | ○ |
| 불확실한 제출도 재전송 허용 | ○ |
| 저장 실패가 생성 축을 되돌림 | ○ |
| 정산이 남아도 완료로 판정 | **처음엔 ✗ → 시험 보강 후 ○** |
| 불확실 표시 제거 | ○ |
| 지문 불일치를 무시 | ○ |
| 섹션 순서를 지문에 포함 | ○ |
| revision 을 지문에서 뺌 | ○ |
| lease 를 항상 만료로 | ○ |
| 빈 lease 를 못 잡게 | ○ |

**4번이 처음에 안 잡혔다.** 시험이 `persisted`(비종료 상태)에서만 재고 있어서,
`completed` + 정산 미완 조합을 통과시켰다. 그 조합을 재는 시험을 더해 잡았다.
가장 중요한 경로였다 — 크레딧이 안 닫히는 자리다.

- `w4-state-green.txt` — jobs 33건 통과
- 웹 전체 2,763 통과 / 6 skip. 타입 검사 0건

### W4-c 에 넘기는 제약 (지금 확인한 것)

- `generation_events.operation` 은 **check 제약과 `reserve_generation` 화이트리스트
  두 곳**에 적혀 있다. 2026-09-08 에 한쪽만 고쳐 이미지 만들기·카드뉴스가 전부
  거절됐다(`202609140001` 머리말). 전사 계량(F-7-9)을 넣으려면 **둘을 함께** 고친다
- 적용 순서는 **SQL 먼저 → 코드 배포**다. 반대로 하면 예약이 거절되고 사용자는
  「사용량을 확인하지 못했습니다」만 본다
- 예약 만료는 10분이고 `reserve_generation` 이 부수적으로 청소한다. 워커가 더 오래
  도는 job 을 이 로직에 그대로 맡기면 안 된다(설계 §8.4)
- `requested_units` 상한은 `max_reserve_units()` 다(202607270001 에서 60 으로 올림)

### W4-c — 저장소 계약과 SQL (적용 안 함)

| 조각 | 상태 |
|---|---|
| W4-a 상태 기계 | 완료 |
| W4-b 멱등·지문·lease | 완료 |
| **W4-c 계약 + 로컬 구현 + SQL** | **완료 (DB 미적용)** |
| W4-d job API + 워커 | 미착수 |

**계약 → 로컬 구현 → SQL 순서로 했다.** 계약을 시험으로 못 박아야 SQL 이 그것을
만족하는지 볼 수 있고, SQL 을 먼저 쓰면 코드가 그 모양을 따라가게 된다.

- `jobs/repository.ts` — 저장 방식과 무관한 계약
- `jobs/local-repository.ts` — `LOCAL_STORE=1` 용 파일 구현. **메모리가 아니다.**
  이 기능이 하려는 일이 「다시 띄워도 되찾기」인데 메모리에 두면 로컬에서 확인할 수 없다
- `supabase/migrations/202609180001_pdp_jobs.sql` — 같은 계약의 운영 구현

저장소가 지키는 것 넷을 계약 시험(13건)이 잰다. 로컬 구현으로 돌지만 Supabase
구현도 같은 시험을 통과해야 한다.

1. 같은 요청을 두 번 받아도 한 번만 만든다. **열쇠는 사용자마다 따로다**
2. 남의 작업은 못 읽고 못 바꾼다. job ID 만 알아서는 있는지조차 모른다
3. 두 워커가 동시에 잡아도 하나만. 잡은 워커가 죽으면 시간이 지나 풀린다
4. 결과는 어떤 실패에도 안 사라진다. base64 는 저장소에 안 담고 경로만 남긴다

### SQL 이 하는 일과 안 하는 일

**기존 것을 한 글자도 안 건드린다.** 새 표 둘과 새 함수 둘만 더한다.
`generation_events` 의 제약도 `reserve_generation` 본문도 그대로다 — 그래서 이
SQL 을 먼저 적용해도 옛 코드가 그대로 돈다(아무도 이 값을 안 읽는다).

새 함수 둘은 설계 §8.4 가 요구한 것이다.

- `renew_pdp_job_lease()` — 예약은 10분 뒤 만료된다. 워커가 더 오래 도는 작업을
  그 로직에 맡기면 아직 만드는 중에 예약이 풀려 다음 요청이 `concurrent_limit` 에
  걸린다. **살아 있는 워커의, 그 작업의 예약만** 늘린다
- `settle_expired_pdp_job()` — 만료 뒤에 결과가 나오면 `finalize_generation` 이
  그 행을 안 건드려(`status`가 `reserved`가 아니다) **결과는 있는데 차감이 안 된다.**
  새 예약을 만들지 않고 그 행을 한 번만 성공으로 고쳐 적는다

`finalize_generation` 이 이미 중복 확정을 막고 있음을 확인했다(`if v_event.status =
'reserved'`). 설계 §8.4 의 「중복 확정은 추가 차감하지 않는다」는 이미 만족된다.

### 검증 — SQL 과 코드가 갈리지 않게 값으로 잰다

상태 이름이 두 곳에 있다(TS union · SQL check). 한쪽만 고치면 **그 상태로 가는
순간 DB 가 거절하고 이미 값을 치른 작업이 멈춘다.** 2026-09-08 에 `operation`
목록으로 같은 사고가 났다. 그래서 눈으로 대조하지 않고 시험이 잰다(16건).

변이 10종으로 시험을 시험했고 **두 번 헛시험을 잡았다.**

| 변이 | 결과 |
|---|---|
| 상태 하나 누락 / 멱등 열쇠 변형 / 회원 insert 허용 | ○ |
| 늦은정산 중복 허용 / 결과 없어도 정산 / RLS 끔 | ○ |
| **사용자 예약 전체 갱신** | **처음 ✗ → 보강 후 ○** |
| 남의 lease 갱신 허용 / 남의 예약까지 갱신 | ○ (보강으로 추가) |

**「사용자 예약 전체 갱신」이 처음에 안 잡혔다.** 시험이 파일 전체에서 문자열을
찾았는데 같은 낱말이 다른 함수에도 있어서, 정작 `renew` 함수에서 그 줄을 지워도
통과했다. 제 리뷰가 지적한 「자기대조 가드」와 같은 꼴이다. **함수 본문만 떼어내
재도록** 고쳤고, 그 과정에서 「남의 lease」·「남의 예약」 두 가지를 더 막았다.

- `w4c-green.txt` — jobs 62건 통과
- 웹 전체 2,792 통과 / 6 skip. 타입 검사 0건

### 적용 전에 알아야 할 것

- **이 SQL 은 아직 DB 에 적용하지 않았다.** 적용은 사용자 결정이다
- 순서: SQL 먼저 → 코드 배포. 코드가 먼저 가도 `PDP_JOBS_ENABLED` 가 꺼져 있으면
  안전하지만, 켜면 표가 없어 500 이 난다
- 되돌리기는 표 둘·함수 둘을 drop 하면 된다. 기존 표에 흔적이 없다
- 파일 안에 확인 쿼리를 적어 두었다(회원이 insert 를 못 하는지, 함수가 닫혀 있는지)
