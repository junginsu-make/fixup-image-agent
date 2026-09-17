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
