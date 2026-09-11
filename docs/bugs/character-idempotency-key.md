# 캐릭터 만들기가 400 「요청 식별자가 올바르지 않습니다」로 막힌다

- 발견: 2026-09-04
- 상태: **수정 완료** (2026-09-11 확인)
- 고친 방법: 캐릭터 화면이 생 `fetch` 를 버리고 공용 래퍼 `lib/billable-fetch.ts` 의 `billableFetch` 를 쓴다.
  그 래퍼가 `x-idempotency-key` 를 요청마다 하나씩 넣는다 — 아래 「고칠 때 참고」의 근본 처방 쪽이다
- 영향: `/characters` 화면의 **캐릭터 만들기 전 과정**. 로그인 상태에서 100% 재현
- 한 줄 요약: **캐릭터 화면만 `x-idempotency-key` 헤더를 안 보낸다.** 서버는 크레딧을 차감하는 모든 요청에 이 헤더를 요구한다

## 증상

브라우저 콘솔:

```
api/characters:1  Failed to load resource: the server responded with a status of 400 (Bad Request)
```

화면 메시지: `요청 식별자가 올바르지 않습니다.`

## 원인

### 1. 서버가 헤더를 요구한다

`apps/web/lib/membership/api.ts:66`

```ts
const requestId = request.headers.get("x-idempotency-key");
if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
  return { ok: false, response: membershipApiError(400, "idempotency_key_required", "요청 식별자가 올바르지 않습니다.") };
}
```

이 문구를 내는 곳은 코드베이스 전체에서 여기 한 군데뿐이다. 같은 요청을 두 번
받았을 때 크레딧을 두 번 깎지 않으려고 두는 열쇠라서, 없으면 예약 자체를 거부한다.

### 2. 캐릭터 API는 이 검사를 지난다

`apps/web/app/api/characters/route.ts:113` (후보 만들기), `:161` (저장하기)
`apps/web/app/api/characters/views/route.ts:42` (각도 다시 만들기)

셋 다 실제 작업 전에 `reserveAiUsage(req, ...)` 를 먼저 부른다.

### 3. 화면이 헤더를 안 붙인다

`apps/web/app/characters/CharacterStudio.tsx`

| 하는 일 | 그때 | 지금 |
|---|---|---|
| `handleCandidates` — 후보 만들기 | `content-type` 만 | `billableFetch` ✓ |
| `handleCreate` — 고른 후보로 각도 만들어 저장 | `content-type` 만 | `billableFetch` ✓ |
| `handleRedo` — 각도 다시 만들기 | `content-type` 만 | `billableFetch` ✓ |

```ts
const body = await (await fetch("/api/characters", {
  method: "POST",
  headers: { "content-type": "application/json" },   // ← x-idempotency-key 없음
```

후보 만들기부터 막히므로 저장 단계까지 가지도 못한다.

## 다른 화면과 비교

`reserveAiUsage` 를 쓰는 API는 `characters/*`, `pdp/*`, `redesign/*` 셋뿐이다.
**캐릭터 화면만 공용 래퍼를 안 쓰고 생 `fetch` 를 쓴다.**

| 화면 | 헤더 처리 |
|---|---|
| `app/create/pdp-utils.ts:38` (`apiJson`) | POST면 `randomId()` 자동 주입 ✓ |
| `app/create/PdpEditor.tsx:1382` | 명시적으로 넣음 ✓ |
| `app/redesign/redesign-wizard.tsx:463, 766` | 명시적으로 넣음 ✓ |
| **`app/characters/CharacterStudio.tsx`** | ~~없음 ✗~~ → `billableFetch` 자동 주입 ✓ |

## 왜 지금 드러났나

`isLocalAuthBypass` 가 켜져 있으면 `reserveAiUsage` 가 헤더 검사 **전에** 그냥
통과한다 (`api.ts:62-64`).

```ts
if (isLocalAuthBypass) {
  return { ok: true, userId: devMemberProfile.id, requestId: "local-dev", usage: devUsageSummary };
}
```

`LOCAL_AUTH_BYPASS=1` 로 화면을 보는 동안엔 안 드러났고, 실제 인증으로 돌리자마자
드러났다. `git log` 상 이 화면은 첫 커밋(`fbe188c`)부터 헤더를 한 번도 보낸 적이 없다.
즉 **새로 생긴 회귀가 아니라 처음부터 있던 구멍**이다.

## 확인한 것 / 배제한 것

- 미들웨어(`apps/web/middleware.ts`)에 헤더를 넣어 주는 코드 없음
- 전역 `fetch` 가로채기 없음 (`globalThis.fetch =` / `window.fetch =` 검색 결과 없음)
- 400 이 zod 본문 검증 실패일 가능성 → 배제. 그 경로는 zod 메시지를 내보내고, 실제로 뜬 문구는 식별자 쪽이다
- `DELETE` (`CharacterStudio.tsx:276`)는 `reserveAiUsage` 를 안 지나므로 정상이다

## 고칠 때 참고

- `CharacterStudio.tsx:11` 에 `randomId` 가 **이미 import 되어 있다** (157줄에서 다른 용도로 사용 중). 새로 가져올 필요 없다
- 세 군데(`189`, `219`, `256`) 모두 고쳐야 한다. 후보 만들기만 고치면 「다시 만들기」가 그대로 막힌다
- 근본 처방을 원하면 `app/create/pdp-utils.ts` 의 `apiJson` 같은 공용 래퍼를 캐릭터 화면에도 쓰는 쪽이다. 같은 실수가 반복될 자리다
- 열쇠는 **요청 한 번에 하나**여야 한다. 재시도 버튼이 같은 열쇠를 다시 쓰면 서버가 `duplicate_request` (409) 로 막는다

## 재현

1. `LOCAL_AUTH_BYPASS` 를 끄고 실제 계정으로 로그인
2. `/characters` 접속
3. 설명을 적고 「후보 만들기」 클릭
4. → 400, `요청 식별자가 올바르지 않습니다.`

## 남은 것

없다. `billableFetch` 는 이미 넣어 준 열쇠가 있으면 존중하므로(`billable-fetch.ts:21`)
재시도에서 같은 열쇠를 쓰고 싶을 때도 길이 있다. 같은 실수가 다시 나지 않도록
**크레딧을 쓰는 새 화면은 생 `fetch` 대신 `billableFetch` 를 쓴다.**
