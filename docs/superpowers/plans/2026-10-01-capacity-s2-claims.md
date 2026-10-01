# 100명 대비 S2 — 로그인 확인을 서버가 직접 (getClaims) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버가 로그인을 확인할 때마다 Supabase 까지 다녀오던 `auth.getUser()` 왕복(약 0.2초)을 없애고, 토큰 서명을 서버가 직접 확인하는 `auth.getClaims()` 로 바꾼다. 정지·탈퇴·관리자 판정과 24시간 로그인 규칙은 그대로 둔다.

**Architecture:** `lib/auth/verified-login.ts` 한 곳이 `getClaims()` 결과에서 회원 번호·메일·세션 번호만 꺼낸다. 미들웨어·`authenticateApiMember`·`getMembership`·`/api/session` 이 이 도우미를 쓰고, `profiles` 읽기(정지·탈퇴·승인·관리자 판정)는 지금 자리에 그대로 남긴다. `getClaims` 가 조용히 `getUser` 로 돌아가는 경우(대칭 키·키 번호 불일치)를 놓치지 않도록 서버 쪽 Supabase 클라이언트의 fetch 를 감싸 auth 왕복을 1분 단위로 센다. 상세페이지·리디자인 라우트는 몸통을 읽을 때 한 인증 결과를 크레딧 예약에 넘겨 두 번째 인증을 없앤다.

**Tech Stack:** Next.js 15.5.24(미들웨어는 edge 런타임), `@supabase/ssr` 0.7.0, `@supabase/supabase-js`·`@supabase/auth-js` 2.110.8(잠금 파일 기준), vitest 4.1, k6·Playwright(측정만)

**Spec:** `docs/superpowers/specs/2026-09-29-capacity-100-design.md` — §2.4(호출 수), §3.2(이 단계), §3.6-1, §3.9, §4(S2 단독 배포), §8 M2·M7. 측정 기준선: `docs/capacity/2026-09-29-baseline.md`

## Global Constraints

- 설계 §3.2 그대로: `auth.getUser()`(Supabase 왕복) → `auth.getClaims()`(토큰 서명을 직접 확인). 새 의존성 없음 — 지금 잠금 파일의 supabase-js 2.110.8·ssr 0.7.0 을 쓴다(`apps/web/package.json` 은 `^2.57.4`·`^0.7.0` 범위, 설치본은 2.110.8)
- **관리자 판정은 계속 `profiles.role`** 이다. 토큰의 `role` 은 DB 역할(`authenticated`)이라 쓰지 않는다. `VerifiedLogin` 타입에 `role` 칸을 두지 않는다
- **정지·탈퇴 회원은 profiles 확인에서 그대로 막힌다.** 아래 「profiles 읽기는 그대로」 표의 네 자리를 줄이지 않는다
- **24시간 세션 규칙은 그대로**: `SESSION_MAX_MS`·`SESSION_START_COOKIE`·`SESSION_START_COOKIE_MAX_AGE_S`·`sessionWindow`·만료 때 `signOut({ scope: "local" })` 를 바꾸지 않는다. 세션 번호만 「서명을 확인한 토큰」에서 읽는다
- 맞바꾸는 점(설계 §3.2 결정): 로그아웃한 토큰이 만료(최대 1시간)까지 유효하다
- `getClaims` 가 `getUser` 로 돌아간 횟수를 로그로 센다(설계 §3.2 「돌아간 횟수를 로그로 센다」)
- 한 요청 안에서 두 번 인증하는 곳(`readPdpRequest` → `reserveAiUsage`)은 **인증 결과를 넘겨준다**(React `cache` 는 라우트에서 안 된다)
- S2 는 **단독 배포**(설계 §4). 되돌리기는 이전 릴리스(`docs/DEPLOY.md` 「되돌리기」)
- 화면에 나가는 우리말 문자열에 줄표(—)를 쓰지 않는다(`app/__tests__/ui-text-dash.test.ts` 가 `lib/` 의 한글 문자열도 잰다 — 로그 문장도 포함)
- Windows·EC2 에서 배포 꾸러미를 빌드하지 않는다. 시험 서버용 빌드는 B 에서, 저장소가 공개라 **push 대신 git bundle** 로 옮긴다
- 운영 Supabase 는 상세페이지 제품과 **공유**한다 — JWT 키 회전(rotate)은 이 단계에서 하지 않는다
- 커밋 메시지 `<type>(<영역>): <한국어 설명>` + 끝줄 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push 는 사용자 지시가 있을 때만
- 사용자에게 하는 보고는 한국어·쉬운 말(비개발자)

## 계획을 쓰며 확인한 사실

| 확인 | 결과 | 근거 |
|---|---|---|
| `getClaims()` 동작(설치본 auth-js 2.110.8) | 인자 없이 부르면 `getSession()` 으로 토큰을 꺼낸다(만료가 가까우면 **여기서 갱신**하고 `setAll` 로 쿠키를 다시 씀 — `getUser` 와 같다) → `exp` 검사 → 공개 키로 서명 검증. 로그인이 없으면 `{ data: null, error: null }` | `node_modules/.pnpm/@supabase+auth-js@2.110.8/.../dist/main/GoTrueClient.js:5233-5285` |
| `getUser` 로 돌아가는 조건 | ① `alg` 없음·`HS*`(대칭 키) ② `kid` 없음 ③ WebCrypto 없음 ④ `kid` 가 공개 키 목록에 없음. **④는 부를 때마다 목록을 다시 받고(`fetchJwk` 에 「없음」 보관이 없다) 그다음 `getUser` 까지 해서 지금보다 왕복이 하나 더 많다** | 같은 파일 `:5136-5166`, `:5255-5271` |
| 공개 키 보관 | `GLOBAL_JWKS[storageKey]` — 같은 프로세스의 모든 클라이언트가 함께 쓴다, 10분(`JWKS_TTL`) | `GoTrueClient.js:41-67`, `lib/constants.js:38` |
| 문서(context7, supabase guides) | 비대칭 키면 로컬 검증, 대칭 키면 `getUser` 와 같은 요청. Next.js 미들웨어 예시가 `getClaims()` 를 쓰고 「클라이언트 만들기와 `getClaims()` 사이에 코드를 넣지 말라」. 「폐기된 세션의 access token 은 `exp` 까지 유효하다」(signout 가이드) | supabase.com/docs/guides/auth/jwts, /server-side/creating-a-client, /signout |
| 사용자 지정 fetch 가 auth 까지 가나 | 간다 — `createServerClient` 가 `options.global` 을 넘기고(`ssr/dist/main/createServerClient.js:15-24`), supabase-js 가 `settings.global.fetch` 를 auth 클라이언트에 준다(`supabase-js/dist/index.mjs:694`) | 설치본 |
| 운영 공개 키 목록 | 운영 프로젝트 `bbuweuvylystagohqlhf`(운영 `app.env` 의 공개 주소로 확인) `/auth/v1/.well-known/jwks.json` 에 **ES256 키 하나**(`kid 2ccd50eb-e54e-43a5-844e-daca5c920a83`). **목록에 있다고 그 키로 서명 중이라는 뜻은 아니다** — 대기(standby) 키도 목록에 실린다. 그래서 Task 8 에서 사용자가 대시보드로 「현재 키」를 확인한다 | 2026-10-01 공개 주소 조회 |
| 운영 서버 시계 | `System clock synchronized: yes` (`exp` 검사가 서버 시계를 쓴다) | 운영 `timedatectl` |
| 시험 DB(B) | 공개 키 목록 ES256 `kid b81269f1-…`, 시험 사용자 토큰 머리 `{"alg":"ES256","kid":"b81269f1-…"}`, 수명 3600초 — **시험 서버에서 효과가 그대로 보인다** | B `~/tools/k6/users.json` 첫 사용자 |

## 어느 자리가 무엇으로 바뀌나

**서버의 `auth.getUser()` / `getSession()` 전부**(`grep -rn "auth\.\(getUser\|getSession\|getClaims\)(" apps/web` 기준, 시험 제외):

| 자리 | 지금 | 바뀐 뒤 |
|---|---|---|
| `apps/web/middleware.ts:92` | `getUser()` — 모든 화면·API 요청마다 왕복 | `verifiedLogin(supabase.auth)` |
| `apps/web/middleware.ts:103` | `getSession()` + `sessionIdFromAccessToken`(서명 안 본 토큰에서 세션 번호) | 지움. 세션 번호는 서명을 확인한 `claims.session_id` |
| `apps/web/lib/membership/api.ts:28` `authenticateApiMember` | `getUser()` | `verifiedLogin` |
| `apps/web/lib/membership/server.ts:18` `getMembership` | `getUser()` | `verifiedLogin` (메일도 토큰의 `email`) |
| `apps/web/app/api/session/route.ts:15` (첫 화면 머리) | `getUser()` | `verifiedLogin` |
| `apps/web/app/login/page.tsx:59` | 브라우저 클라이언트 `getUser()` | **안 바꾼다** — 브라우저가 Supabase 로 바로 가는 호출이라 우리 서버·DB 부하와 무관(로그인 화면 한 번) |

**profiles 읽기는 그대로 남는다 — 정지·탈퇴·관리자를 막는 자리:**

| 자리 | 읽는 칸 | 막는 것 |
|---|---|---|
| `middleware.ts:187-193` | `role,status,email_confirmed_at` | `isUsableAccount` → `/access`(승인 대기·정지·탈퇴·메일 미인증·행 없음), `canAccessPage`(관리자 화면은 `role`) |
| `lib/membership/api.ts:32-57` `authenticateApiMember` | profiles 전체 칸 | `profile_not_found`·`email_unconfirmed`·`pending`·`suspended`·`withdrawn` 403. `authenticateApiAdmin` 은 이 결과의 `role` |
| `lib/membership/server.ts:21-31` `getMembership` | profiles 전체 칸 | `requireActiveMember`(`isUsableAccount`)·`requireAdmin`(`role`) |
| `app/api/session/route.ts:22-28` | `status,email_confirmed_at` | 첫 화면 머리의 「쓸 수 있음」 |

**한 요청 안의 두 번째 인증을 없애는 자리**(설계 §3.2): `readPdpRequest` 를 쓰는 다섯 라우트(`app/api/pdp/analyze`·`pdp/images`·`pdp/images/batch`·`pdp/key-visual`·`pdp/plan-from-text`)와 `redesign/edit-section`, `readRedesignForm` 을 쓰는 `redesign/generate`(여기는 캐릭터 고를 때 **세 번째** 인증도 있다, `route.ts:146`).

**이번에 안 하는 것(S6 후보로 넘김):** `authenticateApiMember()` 를 부른 뒤 같은 요청에서 `reserveAiUsage` 를 또 부르는 나머지 생성 라우트 — `poster/projects/[id]/{generate,edit,plan,review}`, `sns/projects/[id]/{generate,plan,caption,cards/[index]}`, `characters`(2곳), `characters/views`, `easy/generate`, `pdp/style-references`, `ad/export`, `redesign/transcribe-strips`. S2 뒤에는 각각 profiles 한 번(0.2초)만 더 든다(auth 왕복은 이미 없다). 화면 열기가 아니라 생성 버튼이라 빈도가 낮다. `reserveAiUsage(…, authenticated)` 인자는 이번에 생기므로 S6 에서 줄 한 줄씩이면 된다.

## 로그아웃과 「최대 1시간」 — 무엇이 달라지나

비유: 지금은 손님이 올 때마다 본사에 전화해 「이 출입증 아직 유효해요?」를 묻는다. 바꾼 뒤에는 출입증에 찍힌 본사 도장(서명)과 유효기간만 보고 들여보낸다. 본사가 출입증을 취소해도 유효기간(최대 1시간)이 끝날 때까지는 도장만으로는 모른다.

- **이 브라우저에서 로그아웃** — `signOut()` 이 로그인 쿠키를 지운다(`app/auth/signout/route.ts`, `settings/actions.ts:65`, `_landing/session-actions.ts:19`). 다음 요청에는 토큰이 없으니 **바로 로그아웃된다. 달라지지 않는다**
- **24시간 만료** — 미들웨어가 서버 쪽 로그인을 끊고 쿠키를 지운다. 이 브라우저는 바로 나간다. **달라지지 않는다**
- **달라지는 것**: 로그아웃·만료 **전에 토큰을 복사해 둔 사람**(탈취)은 그 토큰의 `exp`(발급 뒤 최대 3600초)까지 화면·API 를 쓸 수 있다. 전에는 `getUser` 가 「세션 없음」으로 곧바로 막았다. 관리자가 비밀번호를 직접 바꾼 회원의 다른 기기도 최대 1시간 열려 있을 수 있다(화면 문구가 이미 「다시 로그인해야 **할 수 있습니다**」라 틀리지 않는다)
- **달라지지 않는 것**: 정지·탈퇴·관리자 권한 회수·계정 삭제는 **요청마다 profiles 를 읽으므로 즉시** 막힌다(위 표). 그리고 같은 토큰은 S2 전에도 PostgREST·Storage 가 `exp` 까지 받아 줬다(Supabase signout 문서의 경고) — 서버의 문만 그 수준으로 맞춰지는 것이다
- 받아들이는 이유: 설계 §3.2 가 이 맞바꿈을 결정했다. 막아야 할 사람(정지·탈퇴)은 DB 판정이 그대로 막고, 남는 위험은 「이미 탈취된 토큰의 마지막 1시간」뿐이다. Task 8 에서 운영의 access token 수명이 3600초 이하인지 확인한다(더 길면 그 값이 곧 창의 길이라 보고한다)

## 예상 효과 — 요청마다 빠지는 왕복

시험 조건은 A→DB 왕복 0.2초(기준선). 아래 「빠지는 시간」은 **한가할 때** 앞뒤로 이어진(순차) 왕복이 빠지는 몫이다. 몰릴 때의 효과는 이보다 크다고 보는데, Supabase 쪽 요청 수와 DB 일이 함께 줄기 때문이다 — 숫자는 Task 7 에서 잰다.

| 요청 | 지금 Supabase 호출(순서대로) | S2 뒤 | 빠지는 왕복 |
|---|---|---|---|
| 로그인 후 화면 하나(내비게이션·사이드바 prefetch 모두) | 미들웨어 `auth/v1/user` → `profiles` / 레이아웃 `getMembership` `auth/v1/user` → `profiles` → `credit_summary` → `team_members` (`studio-layout.tsx:33-37` 순차) | `profiles` → `profiles` → `credit_summary` → `team_members` | **`auth/v1/user` 2번(순차) ≈ 0.4초** |
| 목록 API 하나(`/api/library` 등) | 미들웨어 `auth/v1/user` / 라우트 `auth/v1/user` → `profiles` → … | `profiles` → … | **2번 ≈ 0.4초** |
| 상세페이지 생성 POST(`/api/pdp/images/batch` 등) | 미들웨어 `user` / `readPdpRequest` `user`→`profiles` / `reserveAiUsage` `user`→`profiles` | `profiles` 1번 | `user` 3 + `profiles` 1 = **4번 ≈ 0.8초**(생성 시간에 비하면 작다) |
| 로그인 전 화면 | 쿠키가 없으면 `getUser` 도 왕복하지 않았다 | 같다 | **0 — 로그인 전 200명 결과는 바뀌지 않는다** |

몰릴 때 효과의 근거: S0 에서 다섯 화면을 한 번씩 열 때 Kong 이 받은 상위 호출 195건 중 **`GET /auth/v1/user` 가 85건(44%)**, `profiles` 75, `team_members` 16, `credit_summary` 6(`docs/capacity/2026-09-29-baseline.md` 「실제 브라우저 한 번 열기」). `/auth/v1/user` 는 auth 서버가 같은 Postgres 에서 사용자·세션을 읽는 일이라(추정 — Task 7 의 DB CPU 로 확인) 시험 DB CPU 120%(설계 §2.2)를 직접 덜어 준다. 다만 `profiles` 2·`credit_summary`(전역 잠금)·`team_members` 는 S6 몫이라 남는다 — **S2 만으로 설계 §3.9 「로그인 후 화면 보통 2초·느린 쪽 5초(100명)」에 닿는다고 장담하지 않는다.** S2 의 합격 기준은 Task 7 에 따로 적는다.

## File Structure

| 파일 | 할 일 |
|---|---|
| Create `apps/web/lib/auth/verified-login.ts` | `getClaims()` → `{ userId, email, sessionId }` 또는 `null`. 한 가지 일 |
| Create `apps/web/lib/auth/auth-round-trips.ts` | 서버 쪽 Supabase fetch 를 감싸 `GET /auth/v1/user`·`jwks.json` 을 세고, 이상할 때만 1분에 한 줄 경고 |
| Modify `apps/web/lib/supabase/server.ts` | `global.fetch` 에 세는 fetch 를 단다 |
| Modify `apps/web/middleware.ts` | `getUser`·`getSession` → `verifiedLogin`, 세는 fetch |
| Modify `apps/web/lib/auth/session-window.ts` | 쓰는 곳이 없어지는 `sessionIdFromAccessToken` 을 지운다(이 변경이 만든 고아) |
| Modify `apps/web/lib/membership/api.ts` | `authenticateApiMember` → `verifiedLogin`, `ApiMember` 내보내기, `reserveAiUsage` 다섯째 인자 |
| Modify `apps/web/lib/membership/server.ts` | `getMembership` → `verifiedLogin` |
| Modify `apps/web/app/api/session/route.ts` | `verifiedLogin` |
| Modify `apps/web/lib/pdp/request.ts` | `readPdpRequest`·`readRedesignForm` 이 `member` 를 돌려준다 |
| Modify 7 라우트 | `reserveAiUsage(…, parsed.member)` |
| Modify 시험 8개 | `getUser` 흉내를 `getClaims` 흉내로(미들웨어 2·membership 5), `session-window.test.ts` 에서 지운 함수의 시험 삭제 |
| Create 시험 8개 | 아래 각 Task |
| Modify `docs/capacity/2026-09-29-baseline.md` | 「S2 뒤」 절(Task 7) |

## Review Focus

1. **운영 토큰이 아직 대칭 키(HS256)로 서명되는 경우** — 공개 키 목록에 ES256 이 있어도 「현재 키」가 옛 비밀값이면 `getClaims` 는 조용히 `getUser` 로 돌아가 효과가 0 이다. 사람은 아무 차이를 못 느낀다. → Task 2 의 세는 fetch 가 1분에 한 줄 경고, Task 8 Step 1 대시보드 확인·Step 5 로그 확인
2. **키 번호가 목록에 없는 토큰** — 부를 때마다 목록을 다시 받고 `getUser` 까지 해서 **지금보다 왕복이 많아진다.** → Task 2 시험 「공개 키 목록을 1분에 여러 번 받으면 남긴다」, Task 7 Kong 에서 `jwks.json` 횟수
3. **만료가 가까운 토큰의 갱신** — `getClaims` 안에서 갱신하고 `setAll` 로 쿠키를 쓴다. 미들웨어가 그 뒤 `response` 를 새로 만들면 갱신한 토큰이 브라우저에 안 가서 다음 요청마다 갱신하다 끊긴다. → Task 3 시험 「만료가 가까워 getClaims 가 토큰을 갱신하면 새 로그인 쿠키를 응답에 싣는다」
4. **정지·탈퇴·지운 계정의 멀쩡한 토큰** — 서명은 맞으니 profiles 판정을 빠뜨리면 그대로 들어온다. 그리고 profiles 를 **토큰의 회원 번호로** 읽어야 한다. → Task 3·4 시험(상태별 `/access`·403, 행 없음, `eq("id", sub)` 확인)
5. **미들웨어(edge)의 공개 키 보관이 요청마다 비는 경우** — Next standalone 의 edge 샌드박스가 모듈 상태를 요청 사이에 들고 있지 않으면 미들웨어가 요청마다 `jwks.json` 을 받는다(`getUser` 대신 다른 왕복). 단위 시험으로 못 잡는다 → Task 7 Step 4 Kong 의 `jwks.json` 횟수, 많으면 Task 7 Step 5 의 대비(미들웨어를 nodejs 런타임으로)

---

### Task 1: 서명을 확인한 로그인 도우미

**Files:**
- Create: `apps/web/lib/auth/verified-login.ts`
- Test: `apps/web/lib/auth/__tests__/verified-login.test.ts`

**Interfaces:**
- Consumes: `SupabaseClient["auth"]["getClaims"]`(supabase-js 2.110.8)
- Produces: `export type VerifiedLogin = { userId: string; email: string | null; sessionId: string | null }`, `export async function verifiedLogin(auth: Pick<SupabaseClient["auth"], "getClaims">): Promise<VerifiedLogin | null>`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/auth/__tests__/verified-login.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { verifiedLogin } from "../verified-login";

/**
 * **로그인 확인은 토큰 서명으로 한다**(설계 2026-09-29 §3.2).
 *
 * `getUser()` 는 부를 때마다 Supabase 까지 0.2초 왕복이었다. `getClaims()` 는
 * 서명을 이 서버에서 확인한다. 이 도우미는 그 결과에서 **우리가 쓰는 세 값만**
 * 꺼낸다 — 관리자 여부(토큰의 `role` 은 DB 역할 `authenticated` 다)는 일부러
 * 담지 않는다. 관리자는 늘 `profiles.role` 로 본다.
 */
type ClaimsReply = { data: { claims: Record<string, unknown> } | null; error: unknown };
const auth = (reply: ClaimsReply) => ({ getClaims: async () => reply }) as never;
const 정상 = { sub: "user-1", email: "a@b.c", session_id: "session-1", role: "authenticated" };

describe("verifiedLogin", () => {
  it("서명이 맞으면 회원 번호·메일·세션 번호를 돌려준다", async () => {
    await expect(verifiedLogin(auth({ data: { claims: 정상 }, error: null }))).resolves.toEqual({
      userId: "user-1", email: "a@b.c", sessionId: "session-1",
    });
  });

  it("토큰의 role 은 싣지 않는다 — 관리자 판정은 profiles.role 이다", async () => {
    const login = await verifiedLogin(auth({ data: { claims: { ...정상, role: "service_role" } }, error: null }));
    expect(login).not.toHaveProperty("role");
  });

  it("로그인이 없으면(data null, error null) 손님이다", async () => {
    await expect(verifiedLogin(auth({ data: null, error: null }))).resolves.toBeNull();
  });

  it("서명·만료 오류가 있으면 손님이다", async () => {
    await expect(verifiedLogin(auth({ data: { claims: 정상 }, error: new Error("Invalid JWT signature") }))).resolves.toBeNull();
  });

  it.each([undefined, "", 42])("sub 가 %s 이면 손님이다 — 누구인지 모르는 로그인은 없다", async (sub) => {
    await expect(verifiedLogin(auth({ data: { claims: { ...정상, sub } }, error: null }))).resolves.toBeNull();
  });

  it.each([{}, { session_id: "", email: "" }, { session_id: 7, email: 7 }])(
    "세션 번호·메일이 없거나 글자가 아니면(%o) null 로 둔다 — 24시간 규칙은 시각만으로 잰다",
    async (extra) => {
      await expect(verifiedLogin(auth({ data: { claims: { sub: "user-1", ...extra } }, error: null }))).resolves.toEqual({
        userId: "user-1", email: null, sessionId: null,
      });
    },
  );
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/verified-login.test.ts`
Expected: FAIL — `Failed to load url ../verified-login`(파일 없음), `Tests no tests`

- [ ] **Step 3: 구현한다**

`apps/web/lib/auth/verified-login.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 서명을 확인한 로그인(설계 2026-09-29 §3.2).
 *
 * **토큰에서 읽은 세 값뿐이다.** 정지·탈퇴·관리자 여부는 여기 없다 — 그건
 * 요청마다 `profiles` 에서 읽는다. 토큰의 `role` 은 DB 역할(`authenticated`)이라
 * 관리자 판정에 쓰면 안 된다.
 */
export type VerifiedLogin = {
  userId: string;
  email: string | null;
  /** 이번 로그인의 번호 — 24시간 규칙이 시작 시각을 이 로그인에 묶는다. */
  sessionId: string | null;
};

type ClaimsAuth = Pick<SupabaseClient["auth"], "getClaims">;

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

/**
 * `getUser()` 대신 `getClaims()` 로 로그인을 확인한다.
 *
 * 비대칭 키(ES256)면 Supabase 공개 키(10분 보관)로 **이 서버가 직접** 서명을
 * 확인한다 — 왕복이 없다. 대칭 키(HS256)거나 키 번호가 목록에 없으면
 * `getClaims` 가 **조용히** `getUser` 왕복으로 돌아간다. 그 횟수는
 * `auth-round-trips.ts` 가 센다.
 *
 * 토큰이 곧 만료되면 `getClaims` 가 먼저 갱신한다(`getUser` 와 같다).
 */
export async function verifiedLogin(auth: ClaimsAuth): Promise<VerifiedLogin | null> {
  const { data, error } = await auth.getClaims();
  if (error || !data) return null;
  const userId = text(data.claims.sub);
  if (!userId) return null;
  return { userId, email: text(data.claims.email), sessionId: text(data.claims.session_id) };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/verified-login.test.ts`
Expected: PASS — `Tests 10 passed (10)`

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/auth/verified-login.ts apps/web/lib/auth/__tests__/verified-login.test.ts
git commit -m "feat(auth): 토큰 서명으로 로그인을 확인하는 도우미

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: auth 왕복을 세는 fetch, 서버 클라이언트에 달기

**Files:**
- Create: `apps/web/lib/auth/auth-round-trips.ts`
- Modify: `apps/web/lib/supabase/server.ts:1-12`
- Test: `apps/web/lib/auth/__tests__/auth-round-trips.test.ts`, `apps/web/lib/supabase/__tests__/server-counting-fetch.test.ts`

**Interfaces:**
- Produces: `export function classifyAuthRequest(url: string, method: string): "user" | "jwks" | null`, `export function createAuthRoundTripCounter(options?: { now?: () => number; log?: (line: string) => void; baseFetch?: Fetch }): { record(kind: "user" | "jwks"): void; fetch: Fetch }`, `export const authRoundTrips` (프로세스에 하나). `Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>`
- Task 3 이 `authRoundTrips.fetch` 를 미들웨어에 단다

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/auth/__tests__/auth-round-trips.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyAuthRequest, createAuthRoundTripCounter } from "../auth-round-trips";

/**
 * **조용히 돌아간 횟수를 센다**(설계 2026-09-29 §3.2).
 *
 * `getClaims()` 는 토큰이 대칭 키(HS256)로 서명됐거나 키 번호가 공개 키 목록에
 * 없으면 **아무 말 없이** `getUser()` 왕복으로 돌아간다(`GoTrueClient.js`
 * getClaims). 그러면 이번 단계의 효과가 0 인데 겉으로는 아무 차이가 없다.
 * 서버 쪽 Supabase 클라이언트의 fetch 를 감싸 실제로 나간 요청을 센다.
 */
const SB = "https://abc.supabase.co";

describe("classifyAuthRequest", () => {
  it.each([
    [`${SB}/auth/v1/user`, "GET", "user"],
    [`${SB}/auth/v1/.well-known/jwks.json`, "GET", "jwks"],
    [`${SB}/auth/v1/user`, "PUT", null], // 비밀번호 바꾸기 — 왕복이 맞다
    [`${SB}/auth/v1/token?grant_type=refresh_token`, "POST", null], // 갱신 — 전과 같다
    [`${SB}/rest/v1/profiles?select=role`, "GET", null],
    ["이건 주소가 아니다", "GET", null],
  ])("%s %s → %s", (url, method, kind) => {
    expect(classifyAuthRequest(url, method)).toBe(kind);
  });
});

function 시계() {
  let now = 1_000_000;
  return { now: () => now, 지나감: (ms: number) => { now += ms; } };
}

describe("createAuthRoundTripCounter", () => {
  it("1분이 지나 다음 요청이 올 때, 그동안 getUser 로 돌아간 횟수를 한 줄 남긴다", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("user");
    counter.record("user");
    expect(logs, "1분 안에는 쌓기만 한다 — 100명이면 줄이 넘친다").toEqual([]);
    clock.지나감(60_000);
    counter.record("user");

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("getUser 3회");
  });

  it("남긴 뒤에는 0 부터 다시 센다 — 1분을 닫은 요청은 그 1분에 넣는다", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("user");
    clock.지나감(60_000);
    counter.record("user");
    clock.지나감(60_000);
    counter.record("user");

    expect(logs).toHaveLength(2);
    expect(logs[0]).toContain("getUser 2회");
    expect(logs[1]).toContain("getUser 1회");
  });

  it("공개 키 목록을 10분에 한 번 받는 것은 정상이라 남기지 않는다(auth-js 가 10분 보관)", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("jwks");
    clock.지나감(10 * 60_000);
    counter.record("jwks");
    clock.지나감(10 * 60_000);
    counter.record("jwks");
    expect(logs).toEqual([]);
  });

  it("공개 키 목록을 1분에 여러 번 받으면 남긴다 — 키 번호가 목록에 없다는 뜻이다", () => {
    const clock = 시계();
    const logs: string[] = [];
    const counter = createAuthRoundTripCounter({ now: clock.now, log: (line) => logs.push(line) });

    counter.record("jwks");
    counter.record("jwks");
    clock.지나감(60_000);
    counter.record("jwks");

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("공개 키 목록 3회");
  });

  it("fetch 는 그대로 넘기고, auth 왕복만 센다", async () => {
    const clock = 시계();
    const logs: string[] = [];
    const sent: string[] = [];
    const counter = createAuthRoundTripCounter({
      now: clock.now,
      log: (line) => logs.push(line),
      baseFetch: async (input) => { sent.push(String(input instanceof Request ? input.url : input)); return new Response("{}"); },
    });

    await counter.fetch(`${SB}/auth/v1/user`, { method: "GET" });
    await counter.fetch(new Request(`${SB}/auth/v1/user`));
    await counter.fetch(new URL(`${SB}/rest/v1/profiles`));
    clock.지나감(60_000);
    await counter.fetch(`${SB}/rest/v1/profiles`);
    await counter.fetch(`${SB}/auth/v1/user`);

    expect(sent).toHaveLength(5);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("getUser 3회");
  });
});
```

`apps/web/lib/supabase/__tests__/server-counting-fetch.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **서버 쪽 클라이언트는 auth 왕복을 세는 fetch 를 쓴다**(설계 2026-09-29 §3.2).
 *
 * 세는 함수가 있어도 클라이언트에 안 달면 0 만 보인다 — 「돌아감 0회」가
 * 진짜 0 인지 안 단 것인지 가를 수 없다. 배선을 직접 잡는다.
 */
const seen = vi.hoisted(() => ({ options: null as null | { global?: { fetch?: unknown } } }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: { global?: { fetch?: unknown } }) => {
    seen.options = options;
    return {};
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => undefined }) }));

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  seen.options = null;
});

describe("createSupabaseServerClient", () => {
  it("auth 왕복을 세는 fetch 를 단다", async () => {
    const { createSupabaseServerClient } = await import("../server");
    const { authRoundTrips } = await import("../../auth/auth-round-trips");

    await createSupabaseServerClient();

    expect(seen.options?.global?.fetch).toBe(authRoundTrips.fetch);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/auth-round-trips.test.ts lib/supabase/__tests__/server-counting-fetch.test.ts`
Expected: FAIL — 앞 파일은 `../auth-round-trips` 없음, 뒤 파일은 모듈 없음으로 실패

- [ ] **Step 3: 구현한다**

`apps/web/lib/auth/auth-round-trips.ts`:

```ts
/**
 * 서버가 Supabase auth 로 왕복한 횟수를 센다(설계 2026-09-29 §3.2).
 *
 * S2 뒤로 서버의 로그인 확인은 `getClaims()` 다. 정상이면 **auth 서버로 가는
 * 요청이 없다** — 공개 키 목록(`jwks.json`)을 10분에 한 번 받을 뿐이다. 그런데
 * 토큰이 대칭 키(HS256)로 서명됐거나 키 번호가 목록에 없으면 `getClaims` 가
 * 조용히 `GET /auth/v1/user` 로 돌아간다. 그 왕복을 여기서 센다.
 *
 * 서버 쪽 클라이언트(`lib/supabase/server.ts`, `middleware.ts`)에만 단다. 브라우저
 * 클라이언트는 이 서버를 거치지 않는다.
 */
export type AuthRoundTripKind = "user" | "jwks";

type Fetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const WINDOW_MS = 60_000;
/**
 * 공개 키 목록 보관 시간 — auth-js `JWKS_TTL`(10분). 이 셈은 프로세스마다
 * 따로라(웹 서버·미들웨어) 한 곳에서 10분에 한 번이 정상이다.
 */
const JWKS_TTL_MS = 10 * 60_000;

/** 이 요청이 auth 왕복인가. 비밀번호 바꾸기(PUT /user)·토큰 갱신은 원래 왕복이라 세지 않는다. */
export function classifyAuthRequest(url: string, method: string): AuthRoundTripKind | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  if (pathname.endsWith("/auth/v1/.well-known/jwks.json")) return "jwks";
  if (pathname.endsWith("/auth/v1/user") && method.toUpperCase() === "GET") return "user";
  return null;
}

type Tally = { user: number; jwks: number; since: number };

/**
 * 1분 단위로 모아 **이상할 때만** 한 줄 남긴다. 100명이 몰려도 1분에 한 줄이다.
 * 요청이 올 때 1분이 지났는지 본다(타이머를 따로 두지 않는다).
 */
export function createAuthRoundTripCounter(options: {
  now?: () => number;
  log?: (line: string) => void;
  baseFetch?: Fetch;
} = {}) {
  const now = options.now ?? Date.now;
  const log = options.log ?? ((line: string) => console.warn(line));
  const baseFetch: Fetch = options.baseFetch ?? ((input, init) => globalThis.fetch(input, init));
  let tally: Tally = { user: 0, jwks: 0, since: now() };

  function record(kind: AuthRoundTripKind) {
    const counted: Tally = { ...tally, [kind]: tally[kind] + 1 };
    const at = now();
    if (at - counted.since < WINDOW_MS) {
      tally = counted;
      return;
    }
    const normalJwks = Math.floor((at - counted.since) / JWKS_TTL_MS) + 1;
    if (counted.user > 0 || counted.jwks > normalJwks) {
      log(`[auth-claims] 지난 ${Math.round((at - counted.since) / 1000)}초 auth 서버 왕복: getUser ${counted.user}회, 공개 키 목록 ${counted.jwks}회. getClaims 가 서명을 직접 확인하지 못하고 있다(설계 §3.2, JWT 키 확인)`);
    }
    tally = { user: 0, jwks: 0, since: at };
  }

  const fetch: Fetch = (input, init) => {
    const request = input instanceof Request ? input : null;
    const kind = classifyAuthRequest(request ? request.url : String(input), init?.method ?? request?.method ?? "GET");
    if (kind) record(kind);
    return baseFetch(input, init);
  };

  return { record, fetch };
}

/** 프로세스(웹 서버·미들웨어 각각)에 하나. */
export const authRoundTrips = createAuthRoundTripCounter();
```

`apps/web/lib/supabase/server.ts` — import 한 줄과 `global` 한 줄을 더한다(결과 전체):

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "./env";
import { authRoundTrips } from "../auth/auth-round-trips";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicEnv();

  return createServerClient(url, publishableKey, {
    // getClaims 가 조용히 getUser 왕복으로 돌아가면 센다(설계 §3.2).
    global: { fetch: authRoundTrips.fetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot always write cookies. Middleware refreshes them.
        }
      },
    },
  });
}
```

로그 문장에 줄표를 넣지 않는다 — `app/__tests__/ui-text-dash.test.ts` 가 `lib/` 의 한글 문자열을 잰다(계획 검증 때 실제로 걸렸다).

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/auth/__tests__/auth-round-trips.test.ts lib/supabase/__tests__/server-counting-fetch.test.ts app/__tests__/ui-text-dash.test.ts`
Expected: PASS — 세 파일 모두 통과(앞 파일 11개)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/auth/auth-round-trips.ts apps/web/lib/auth/__tests__/auth-round-trips.test.ts apps/web/lib/supabase/server.ts apps/web/lib/supabase/__tests__/server-counting-fetch.test.ts
git commit -m "feat(auth): getClaims 가 getUser 로 돌아간 횟수를 센다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 미들웨어를 getClaims 로

**Files:**
- Modify: `apps/web/middleware.ts:9-16`(import), `:79-90`(클라이언트), `:92`(getUser), `:101-105`(getSession), `:190`, `:212`
- Modify: `apps/web/lib/auth/session-window.ts:45`(주석), `:50-66`(`sessionIdFromAccessToken` 삭제)
- Modify: `apps/web/lib/auth/__tests__/session-window.test.ts:6, 91-104`
- Test: `apps/web/__tests__/middleware-session.test.ts`, `apps/web/__tests__/middleware-nonmember.test.ts`

**Interfaces:**
- Consumes: `verifiedLogin`(Task 1), `authRoundTrips.fetch`(Task 2)
- Produces: 없음(미들웨어 동작만). `sessionIdFromAccessToken` 은 사라진다 — 다른 쓰는 곳 없음(`grep -rn sessionIdFromAccessToken apps/web` 이 이 두 파일뿐)

- [ ] **Step 1: 시험의 Supabase 흉내를 getClaims 로 바꾸고 새 시험을 더한다**

`apps/web/__tests__/middleware-session.test.ts` — `let profile …` 선언부터 `const { middleware } = await import("../middleware");` 직전까지(지금 15-35줄)를 아래로 바꾼다:

```ts
let profile: { role: string; status: string; email_confirmed_at: string | null } | null = {
  role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z",
};

/** 미들웨어가 서버 쪽 로그인을 끊은 기록. */
const 끊은것: Array<{ scope?: string }> = [];
/** 미들웨어가 Supabase 클라이언트를 만들 때 넘긴 설정. */
const 받은설정: Array<{ global?: { fetch?: unknown } }> = [];
/** profiles 를 어느 회원 번호로 읽었나. */
const 읽은번호: unknown[] = [];
/** 이번 요청에서 getClaims 가 토큰을 갱신하나 — 만료가 가까우면 Supabase 가 그렇게 한다. */
let 갱신한다 = false;

/**
 * **로그인 확인은 `getClaims` 다**(설계 2026-09-29 §3.2). `getUser`·`getSession` 을
 * 부르면 시험이 터진다 — 앞의 것은 Supabase 왕복이고, 뒤의 것은 서명을 안 본 값이다.
 */
const 금지 = (name: string) => async () => {
  throw new Error(`${name} 를 불렀다 — 미들웨어의 로그인 확인은 getClaims 여야 한다(설계 §3.2)`);
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    global?: { fetch?: unknown };
    cookies: { setAll: (cookies: Array<{ name: string; value: string; options: object }>) => void };
  }) => {
    받은설정.push(options);
    return {
      auth: {
        getClaims: async () => {
          // 진짜 getClaims 는 만료가 가까우면 getSession 안에서 갱신하고 setAll 로 쿠키를 다시 쓴다.
          if (갱신한다) options.cookies.setAll([{ name: AUTH_COOKIE, value: "새토큰", options: { path: "/" } }]);
          return {
            data: currentUser ? { claims: { sub: currentUser.id, session_id: currentSessionId ?? undefined } } : null,
            error: null,
          };
        },
        getUser: 금지("getUser"),
        getSession: 금지("getSession"),
        signOut: async (options?: { scope?: string }) => { 끊은것.push(options ?? {}); return { error: null }; },
      },
      from: () => ({ select: () => ({ eq: (_column: string, id: unknown) => {
        읽은번호.push(id);
        return { single: async () => ({ data: profile }) };
      } }) }),
    };
  },
}));

```

(지운 것: 「로그인 토큰 모양만 흉내 낸다」 `토큰` 함수 — 이제 토큰을 손으로 쪼개지 않는다.)

같은 파일 `beforeEach` 의 `끊은것.length = 0;` 다음에 세 줄을 더한다:

```ts
  받은설정.length = 0;
  읽은번호.length = 0;
  갱신한다 = false;
```

같은 파일 끝에 붙인다:

```ts

/**
 * **로그인 확인을 바꿔도 문은 그대로다**(설계 2026-09-29 §3.2).
 *
 * 토큰 서명은 「누구인가」만 말한다. 정지·탈퇴·지워진 회원은 토큰이 멀쩡해도
 * 못 들어와야 한다 — 그 판정은 지금처럼 요청마다 `profiles` 에서 읽는다.
 */
describe("getClaims 로 바꾼 뒤", () => {
  it("auth 서버 왕복 없이 들여보낸다 — getUser 를 부르면 이 시험이 터진다", async () => {
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(response.status).toBe(200);
  });

  it("만료가 가까워 getClaims 가 토큰을 갱신하면 새 로그인 쿠키를 응답에 싣는다", async () => {
    갱신한다 = true;
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));

    expect(response.status).toBe(200);
    expect(response.cookies.get(AUTH_COOKIE)?.value, "갱신한 토큰을 브라우저에 안 주면 다음 요청이 또 갱신하다 끊긴다").toBe("새토큰");
  });

  it("Supabase 클라이언트에 auth 왕복을 세는 fetch 를 단다", async () => {
    const { authRoundTrips } = await import("../lib/auth/auth-round-trips");
    await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    expect(받은설정[0]?.global?.fetch).toBe(authRoundTrips.fetch);
  });

  it("profiles 는 서명을 확인한 토큰의 회원 번호(sub)로 읽는다", async () => {
    currentUser = { id: "user-9" };
    await middleware(요청("/create", { [AUTH_COOKIE]: "token" }));
    expect(읽은번호).toEqual(["user-9"]);
  });

  it.each(["suspended", "withdrawn", "pending"])("profiles 가 %s 이면 /access 로 보낸다", async (status) => {
    profile = { role: "member", status, email_confirmed_at: "2026-09-01T00:00:00Z" };
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(response.headers.get("location")).toBe("http://54.180.68.212/access");
  });

  it("profiles 행이 없으면(지운 계정) /access 로 보낸다 — 토큰만 남은 사람", async () => {
    profile = null;
    const response = await middleware(요청("/create", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(response.headers.get("location")).toBe("http://54.180.68.212/access");
  });

  it("관리자 화면은 profiles.role 로 연다 — 토큰의 role 이 아니다", async () => {
    const 회원 = await middleware(요청("/admin", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(회원.status, "일반 회원이 관리자 화면에 들어갔다").toBe(307);

    profile = { role: "admin", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z" };
    const 관리자 = await middleware(요청("/admin", { [AUTH_COOKIE]: "token", [SESSION_START_COOKIE]: 시작(1000) }));
    expect(관리자.status).toBe(200);
  });
});
```

`apps/web/__tests__/middleware-nonmember.test.ts` — 17-30줄(`토큰` 함수와 `vi.mock` 블록)을 아래로 바꾼다:

```ts
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({
        data: currentUser ? { claims: { sub: currentUser.id, session_id: "session-1" } } : null,
        error: null,
      }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  }),
}));
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run __tests__/middleware-session.test.ts __tests__/middleware-nonmember.test.ts`
Expected: FAIL — 거의 전부 실패(계획 검증 때 52개). 까닭은 「getUser 를 불렀다 — 미들웨어의 로그인 확인은 getClaims 여야 한다」·`supabase.auth.getUser is not a function`

- [ ] **Step 3: 미들웨어를 고친다**

`apps/web/middleware.ts` import(9-16줄)를 아래로:

```ts
import {
  SESSION_START_COOKIE,
  SESSION_START_COOKIE_MAX_AGE_S,
  sessionAuthCookieNames,
  sessionStartValue,
  sessionWindow,
} from "./lib/auth/session-window";
import { verifiedLogin } from "./lib/auth/verified-login";
import { authRoundTrips } from "./lib/auth/auth-round-trips";
```

`createServerClient(url, publishableKey, {` 바로 다음 줄(`cookies: {` 앞)에 더한다:

```ts
    // getClaims 가 조용히 getUser 왕복으로 돌아가면 센다(설계 2026-09-29 §3.2).
    global: { fetch: authRoundTrips.fetch },
```

92줄 `const { data: { user } } = await supabase.auth.getUser();` 를 아래로:

```ts
  /*
    **토큰 서명을 이 서버가 확인한다**(설계 2026-09-29 §3.2). 전에는 `getUser()` 로
    요청마다 Supabase 까지 0.2초를 왕복했다. 정지·탈퇴·관리자 판정은 아래에서
    지금처럼 `profiles` 를 읽는다 — 토큰은 「누구인가」만 말한다.

    만료가 가까우면 `getClaims` 가 먼저 갱신하고 `setAll` 로 쿠키를 다시 쓴다.
    그래서 이 줄과 클라이언트 만들기 사이에 다른 일을 끼우지 않는다.
  */
  const user = await verifiedLogin(supabase.auth);
```

102-104줄(주석 한 줄은 남기고 `getSession`·`sessionIdFromAccessToken` 두 줄)을 아래로:

```ts
    // 이번 로그인의 번호. 시작 시각을 이 로그인에 묶어 잰다 — 까닭은 `sessionStartValue`.
    // 서명을 확인한 토큰에서 읽는다.
    const sessionId = user.sessionId;
```

190줄 `.eq("id", user.id)` → `.eq("id", user.userId)`, 212줄 `const viewer = { userId: user.id, role:` → `const viewer = { userId: user.userId, role:`. 나머지(`if (user)`, `if (!user)`)는 그대로 — `user` 가 `VerifiedLogin | null` 이다.

`apps/web/lib/auth/session-window.ts` — 50-66줄(`sessionIdFromAccessToken` 의 주석과 함수 전체)을 지우고, `sessionStartValue` 주석의 마지막 줄 ` * Supabase 는 로그인할 때마다 새 \`session_id\` 를 준다.` 를 아래 두 줄로:

```ts
 * Supabase 는 로그인할 때마다 새 `session_id` 를 준다. 미들웨어는 그 값을
 * **서명을 확인한 토큰**에서 읽는다(`lib/auth/verified-login.ts`, 설계 2026-09-29 §3.2).
```

`apps/web/lib/auth/__tests__/session-window.test.ts` — import 의 `sessionIdFromAccessToken,`(6줄)와 `describe("토큰에서 세션 번호 읽기", …)` 블록(91-104줄)을 지운다. 같은 경우(없음·빈 글자·글자 아님)는 Task 1 시험이 잰다.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run __tests__/middleware-session.test.ts __tests__/middleware-nonmember.test.ts lib/auth`
Expected: PASS — 미들웨어 두 파일(계획 검증 때 middleware-session 25개 포함) + `lib/auth` 전부

Run: `cd apps/web && grep -rn "sessionIdFromAccessToken\|auth\.getSession\|auth\.getUser" middleware.ts lib/auth`
Expected: 출력 없음

- [ ] **Step 5: 커밋**

```bash
git add apps/web/middleware.ts apps/web/lib/auth/session-window.ts apps/web/lib/auth/__tests__/session-window.test.ts apps/web/__tests__/middleware-session.test.ts apps/web/__tests__/middleware-nonmember.test.ts
git commit -m "perf(auth): 미들웨어의 로그인 확인을 getClaims 로 — 요청마다 Supabase 왕복을 없앤다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: API·화면의 문(authenticateApiMember·getMembership·/api/session)

**Files:**
- Modify: `apps/web/lib/membership/api.ts:16-18`(import·`ApiMember` 내보내기), `:27-36`, `:58`
- Modify: `apps/web/lib/membership/server.ts:13`(import), `:17-31`
- Modify: `apps/web/app/api/session/route.ts:2`, `:12-15`, `:24`
- Modify(시험 흉내): `apps/web/lib/membership/__tests__/ai-control-reasons.test.ts:16`, `boot-tag.test.ts:13`, `duplicate-request.test.ts:30`, `reserve-binds-caller.test.ts:15`, `withdrawn-gate.test.ts:61`
- Test(새): `apps/web/lib/membership/__tests__/claims-gate.test.ts`, `apps/web/app/api/session/__tests__/route.test.ts`

**Interfaces:**
- Consumes: `verifiedLogin`(Task 1)
- Produces: `export type ApiMember = { userId: string; profile: MemberProfile }`(`lib/membership/api.ts`) — Task 5 가 쓴다. `authenticateApiMember()`·`getMembership()` 의 반환 모양은 그대로

- [ ] **Step 1: 시험을 쓰고 흉내를 바꾼다**

다섯 파일의 흉내 한 줄을 바꾼다(계획 검증 때 아래 그대로 바꿔 통과했다):

| 파일:줄 | 지금 | 바꾼 뒤 |
|---|---|---|
| `ai-control-reasons.test.ts:16`, `boot-tag.test.ts:13`, `duplicate-request.test.ts:30`, `withdrawn-gate.test.ts:61` | `auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },` | `auth: { getClaims: async () => ({ data: { claims: { sub: "u1" } }, error: null }) },` |
| `reserve-binds-caller.test.ts:15` | `auth: { getUser: async () => ({ data: { user: { id: "0f8fad5b-d9cb-469f-a165-70867728950e" } }, error: null }) },` | `auth: { getClaims: async () => ({ data: { claims: { sub: "0f8fad5b-d9cb-469f-a165-70867728950e" } }, error: null }) },` |

`apps/web/lib/membership/__tests__/claims-gate.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **API·화면의 문을 getClaims 로 바꿔도 막을 사람은 그대로 막는다**(설계 2026-09-29 §3.2).
 *
 * 토큰 서명은 「누구인가」만 말한다. 정지·탈퇴·승인 대기·메일 미인증·지워진
 * 계정은 토큰이 멀쩡해도 막혀야 한다 — 그 판정은 지금처럼 요청마다
 * `profiles` 에서 읽는다. `getUser` 를 부르면 이 시험이 터진다(왕복 금지).
 */
const state = vi.hoisted(() => ({
  claims: { sub: "u1", email: "a@b.c", session_id: "s1" } as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  profileReads: 0,
  readIds: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T,>(fn: T) => fn }));
vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }),
      getUser: async () => { throw new Error("getUser 를 불렀다 — 로그인 확인은 getClaims 여야 한다(설계 §3.2)"); },
    },
    from: () => ({
      select: () => ({ eq: (_column: string, id: unknown) => {
        state.readIds.push(id);
        return { single: async () => { state.profileReads += 1; return { data: state.profile }; } };
      } }),
    }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "dev" }, devUsageSummary: {}, devMembership: null }));

const 활성 = { id: "u1", email: "a@b.c", email_confirmed_at: "2026-09-01", role: "member", status: "active" };

beforeEach(() => {
  state.claims = { sub: "u1", email: "a@b.c", session_id: "s1" };
  state.profile = { ...활성 };
  state.profileReads = 0;
  state.readIds = [];
});

describe("authenticateApiMember", () => {
  it("서명이 맞고 활성 회원이면 들여보낸다 — profiles 는 한 번 읽는다", async () => {
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok && result.member.userId).toBe("u1");
    expect(state.profileReads).toBe(1);
  });

  it("profiles 는 토큰의 회원 번호(sub)로 읽는다", async () => {
    state.claims = { sub: "u9" };
    state.profile = { ...활성, id: "u9" };
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(state.readIds).toEqual(["u9"]);
    expect(result.ok && result.member.userId).toBe("u9");
  });

  it("로그인이 없으면 401", async () => {
    state.claims = null;
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok === false && result.response.status).toBe(401);
  });

  it.each([
    ["suspended", "suspended"],
    ["withdrawn", "withdrawn"],
    ["pending", "pending"],
  ])("profiles.status 가 %s 이면 403 %s", async (status, code) => {
    state.profile = { ...활성, status };
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok).toBe(false);
    const body = result.ok === false ? await result.response.json() : null;
    expect(body).toMatchObject({ code });
  });

  it("메일 미인증이면 403", async () => {
    state.profile = { ...활성, email_confirmed_at: null };
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok === false && result.response.status).toBe(403);
  });

  it("profiles 행이 없으면(지운 계정의 남은 토큰) 403", async () => {
    state.profile = null;
    const { authenticateApiMember } = await import("../api");
    const result = await authenticateApiMember();

    expect(result.ok === false && result.response.status).toBe(403);
  });
});

describe("getMembership", () => {
  it("회원 번호·메일은 토큰에서, 나머지는 profiles 에서", async () => {
    const { getMembership } = await import("../server");
    const membership = await getMembership();

    expect(membership?.user).toEqual({ id: "u1", email: "a@b.c" });
    expect(membership?.profile.status).toBe("active");
  });

  it("로그인이 없으면 null — profiles 를 읽지 않는다", async () => {
    state.claims = null;
    const { getMembership } = await import("../server");

    await expect(getMembership()).resolves.toBeNull();
    expect(state.profileReads).toBe(0);
  });

  it("탈퇴 회원도 membership 은 돌려주고, 문(isUsableAccount)이 막는다 — 지금과 같다", async () => {
    state.profile = { ...활성, status: "withdrawn" };
    const { getMembership } = await import("../server");
    const { isUsableAccount } = await import("../usable");
    const membership = await getMembership();

    expect(membership && isUsableAccount(membership.profile)).toBe(false);
  });
});
```

(`react` 를 흉내 내는 까닭: 시험이 쓰는 react 18.3.1 에는 `cache` 가 없다. Next 는 자기 react 를 쓴다.)

`apps/web/app/api/session/__tests__/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **첫 화면 머리의 로그인 표시도 getClaims 로**(설계 2026-09-29 §3.2).
 *
 * 정적 첫 화면(`public/landing.html`)이 손님마다 부른다. 승인 판정은 지금처럼
 * profiles 로 한다 — 정지된 회원은 「로그인됨·못 씀」이다.
 */
const state = vi.hoisted(() => ({
  claims: { sub: "u1" } as Record<string, unknown> | null,
  profile: { status: "active", email_confirmed_at: "2026-09-01" } as Record<string, unknown> | null,
}));
vi.mock("../../../../lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getClaims: async () => ({ data: state.claims ? { claims: state.claims } : null, error: null }),
      getUser: async () => { throw new Error("getUser 를 불렀다 — getClaims 여야 한다(설계 §3.2)"); },
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: state.profile }) }) }) }),
  }),
}));

const { GET } = await import("../route");

beforeEach(() => {
  state.claims = { sub: "u1" };
  state.profile = { status: "active", email_confirmed_at: "2026-09-01" };
});

describe("GET /api/session", () => {
  it("활성 회원은 로그인됨·쓸 수 있음", async () => {
    await expect((await GET()).json()).resolves.toEqual({ authenticated: true, active: true });
  });

  it("정지 회원은 로그인됨·못 씀 — profiles 판정은 그대로다", async () => {
    state.profile = { status: "suspended", email_confirmed_at: "2026-09-01" };
    await expect((await GET()).json()).resolves.toEqual({ authenticated: true, active: false });
  });

  it("로그인이 없으면 손님", async () => {
    state.claims = null;
    await expect((await GET()).json()).resolves.toEqual({ authenticated: false, active: false });
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/membership app/api/session`
Expected: FAIL — `supabase.auth.getUser is not a function` 등(계획 검증 때 membership 33개, session 3개 실패)

- [ ] **Step 3: 구현한다**

`apps/web/lib/membership/api.ts` — `import { costOperationKey } from "../ai-cost/keys";` 다음 줄에 `import { verifiedLogin } from "../auth/verified-login";` 를 더하고, 18줄 `type ApiMember = …` 를 `export type ApiMember = { userId: string; profile: MemberProfile };` 로. 27-36줄을 아래로:

```ts
  const supabase = await createSupabaseServerClient();
  /*
    **누구인지는 토큰 서명으로, 들여보낼지는 profiles 로**(설계 2026-09-29 §3.2).
    `getUser()` 왕복(0.2초)을 없앴다. 정지·탈퇴·승인 대기·지운 계정은 아래
    profiles 읽기가 지금처럼 막는다 — 이 읽기는 줄이지 않는다.
  */
  const login = await verifiedLogin(supabase.auth);
  if (!login) {
    return { ok: false, response: membershipApiError(401, "unauthenticated", "로그인이 필요합니다.") };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("id,email,email_confirmed_at,role,status,monthly_quota,approved_at,approval_notified_at,created_at")
    .eq("id", login.userId)
    .single();
```

58줄 `return { ok: true, member: { userId: user.id, profile: typed } };` → `return { ok: true, member: { userId: login.userId, profile: typed } };`. 그 사이 상태 검사(37-57줄)는 손대지 않는다.

`apps/web/lib/membership/server.ts` — `import { usageFromRow, ledgerMissing } from "./usage-row";` 다음에 `import { verifiedLogin } from "../auth/verified-login";`. 17-31줄을 아래로:

```ts
  const supabase = await createSupabaseServerClient();
  // 토큰 서명으로 확인한다 — `getUser()` 왕복 없음(설계 2026-09-29 §3.2). 정지·탈퇴는
  // 아래 profiles 를 받아 `requireActiveMember` 가 막는다.
  const login = await verifiedLogin(supabase.auth);
  if (!login) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,email_confirmed_at,role,status,monthly_quota,approved_at,approval_notified_at,created_at")
    .eq("id", login.userId)
    .single();

  if (profileError || !profile) return null;
  return {
    user: { id: login.userId, email: login.email ?? undefined },
    profile: profile as MemberProfile,
  };
```

`apps/web/app/api/session/route.ts` — 2줄 다음에 `import { verifiedLogin } from "../../../lib/auth/verified-login";`. 13-15줄(`const { data: { user } } = await supabase.auth.getUser();` 세 줄)을 아래로:

```ts
    // 토큰 서명으로 확인한다 — `getUser()` 왕복 없음(설계 2026-09-29 §3.2).
    const user = await verifiedLogin(supabase.auth);
```

24줄 `.eq("id", user.id)` → `.eq("id", user.userId)`.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/membership app/api/session`
Expected: PASS — 실패 0(계획 검증 때 `lib/membership` 25개 파일, `app/api/session` 3개 시험)

Run: `cd apps/web && grep -rn "auth\.getUser\|auth\.getSession" --include=*.ts --include=*.tsx app lib middleware.ts | grep -v __tests__`
Expected: `app/login/page.tsx:59` 한 줄만(브라우저 클라이언트 — 안 바꾸는 자리)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/membership/api.ts apps/web/lib/membership/server.ts apps/web/app/api/session apps/web/lib/membership/__tests__
git commit -m "perf(auth): API·화면의 회원 확인을 getClaims 로 — profiles 판정은 그대로

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 한 요청 안에서 두 번 인증하지 않는다(상세페이지·리디자인)

**Files:**
- Modify: `apps/web/lib/membership/api.ts:85-94`(`reserveAiUsage` 다섯째 인자)
- Modify: `apps/web/lib/pdp/request.ts:5`, `:232`, `:248`, `:253`, `:261`
- Modify: `apps/web/app/api/pdp/analyze/route.ts:36`, `pdp/images/batch/route.ts:130`, `pdp/images/route.ts:90`, `pdp/key-visual/route.ts:49`, `pdp/plan-from-text/route.ts:46`, `redesign/edit-section/route.ts:43`, `redesign/generate/route.ts:5, 126, 146-152`
- Test: `apps/web/lib/membership/__tests__/reserve-reuses-member.test.ts`, `apps/web/lib/pdp/__tests__/request-member.test.ts`, `apps/web/app/api/__tests__/auth-once-contract.test.ts`

**Interfaces:**
- Consumes: `ApiMember`(Task 4)
- Produces: `reserveAiUsage(request, operation, units, creditPlan?, authenticated?: ApiMember)`; `readPdpRequest<T>()` → `{ ok: true; body: T; member: ApiMember } | { ok: false; response }`; `readRedesignForm()` → `{ ok: true; form: FormData; member: ApiMember } | { ok: false; response }`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/membership/__tests__/reserve-reuses-member.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **한 요청 안에서 두 번 인증하지 않는다**(설계 2026-09-29 §3.2).
 *
 * 상세페이지·리디자인 라우트는 몸통을 읽으며 한 번(`readPdpRequest`), 크레딧을
 * 잡으며 또 한 번(`reserveAiUsage`) 인증했다. 그때마다 profiles 를 0.2초 왕복으로
 * 다시 읽었다. 이미 인증한 회원을 넘기면 다시 읽지 않는다.
 */
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ claimsCalls: 0, profileReads: 0 }));

vi.mock("../../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getClaims: async () => { state.claimsCalls += 1; return { data: { claims: { sub: "u1" } }, error: null }; } },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => {
        state.profileReads += 1;
        return { data: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } };
      } }) }),
    }),
  }),
}));
vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    rpc: async () => ({ data: { allowed: true, usage: { pricing_policy: "image-v2", balance: 5, available: 5, reserved: 0, used: 0 } }, error: null }),
    from: () => ({ update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }),
  }),
}));
vi.mock("../../dev-auth", () => ({ isLocalAuthBypass: false, devMemberProfile: { id: "dev" }, devUsageSummary: {} }));
vi.mock("../../access/core", () => ({ hasFullScope: () => true, viewerFrom: () => ({}) }));

const { reserveAiUsage } = await import("../api");

const req = () => new Request("http://local/api/pdp/images", { headers: { "x-idempotency-key": "33333333-3333-4333-8333-333333333333" } });
const plan = { outputs: [], resource: "pdp:analyze" };
const member = { userId: "u1", profile: { id: "u1", email_confirmed_at: "2026-01-01", status: "active", role: "member" } } as never;

beforeEach(() => { vi.stubEnv("CREDIT_LEDGER", "1"); state.claimsCalls = 0; state.profileReads = 0; });
afterEach(() => { vi.unstubAllEnvs(); });

describe("reserveAiUsage", () => {
  it("인증한 회원을 받으면 다시 인증하지 않는다 — profiles 를 다시 읽지 않는다", async () => {
    const result = await reserveAiUsage(req(), "pdp_analyze", 0, plan, member);

    expect(result.ok && result.userId).toBe("u1");
    expect(state.claimsCalls).toBe(0);
    expect(state.profileReads).toBe(0);
  });

  it("안 받으면 지금처럼 스스로 인증한다", async () => {
    const result = await reserveAiUsage(req(), "pdp_analyze", 0, plan);

    expect(result.ok).toBe(true);
    expect(state.claimsCalls).toBe(1);
    expect(state.profileReads).toBe(1);
  });
});
```

`apps/web/lib/pdp/__tests__/request-member.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

/**
 * **몸통을 읽은 자리가 인증 결과를 넘긴다**(설계 2026-09-29 §3.2) — 라우트가
 * 그대로 `reserveAiUsage` 에 건네 두 번째 인증을 없앤다.
 */
vi.mock("server-only", () => ({}));
const member = { userId: "u1", profile: { id: "u1", status: "active" } };
vi.mock("../../membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member }),
}));

const { readPdpRequest, readRedesignForm } = await import("../request");

describe("인증 결과를 넘긴다", () => {
  it("readPdpRequest", async () => {
    const result = await readPdpRequest(
      new Request("http://localhost/api/pdp/analyze", { method: "POST", body: JSON.stringify({ imageBase64: "AAAA", mimeType: "image/png" }) }),
      "analyze",
    );

    expect(result.ok && result.member).toBe(member);
  });

  it("readRedesignForm", async () => {
    const form = new FormData();
    form.set("jobIndex", "1");
    form.set("jobTotal", "1");
    form.append("files", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
    const result = await readRedesignForm(new Request("http://localhost/api/redesign/generate", { method: "POST", body: form }));

    expect(result.ok && result.member).toBe(member);
  });
});
```

`apps/web/app/api/__tests__/auth-once-contract.test.ts`:

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **몸통을 읽으며 인증한 길은 그 결과를 크레딧 예약에 넘긴다**(설계 2026-09-29 §3.2).
 *
 * `readPdpRequest`·`readRedesignForm` 이 이미 인증했는데 `reserveAiUsage` 가 또
 * 인증하면 profiles 를 0.2초 왕복으로 한 번 더 읽는다. 목록을 손으로 적지 않는다 —
 * 새로 생긴 길이 조용히 빠진다. 소스에서 센다.
 */
const API = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : routes(full);
    return name === "route.ts" ? [full] : [];
  });
}

/** `reserveAiUsage(` 호출마다 괄호가 닫힐 때까지의 인자 글자. */
function reserveCalls(source: string): string[] {
  const calls: string[] = [];
  let from = 0;
  for (;;) {
    const at = source.indexOf("reserveAiUsage(", from);
    if (at < 0) return calls;
    let depth = 0;
    let index = at + "reserveAiUsage".length;
    for (; index < source.length; index += 1) {
      if (source[index] === "(") depth += 1;
      if (source[index] === ")") depth -= 1;
      if (depth === 0) break;
    }
    calls.push(source.slice(at + "reserveAiUsage(".length, index));
    from = index;
  }
}

/** 맨 바깥 쉼표로 나눈 마지막 인자. */
function lastArgument(args: string): string {
  let depth = 0;
  let start = 0;
  const trimmed = args.trim().replace(/,$/, "");
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i]!;
    if ("([{".includes(char)) depth += 1;
    if (")]}".includes(char)) depth -= 1;
    if (char === "," && depth === 0) start = i + 1;
  }
  return trimmed.slice(start).trim();
}

const 읽고예약하는길 = routes(API)
  .map((file) => ({ file: file.slice(file.indexOf("api")).replace(/\\/g, "/"), source: readFileSync(file, "utf8") }))
  .filter(({ source }) => /\b(readPdpRequest|readRedesignForm)\s*[<(]/.test(source) && source.includes("reserveAiUsage("));

describe("한 요청 안에서 두 번 인증하지 않는다", () => {
  it("**셀 곳이 있다** — 상세페이지 5 + 리디자인 2", () => {
    expect(읽고예약하는길.length).toBeGreaterThanOrEqual(7);
  });

  it("**reserveAiUsage 의 마지막 인자가 parsed.member 다**", () => {
    const 빠진곳 = 읽고예약하는길.flatMap(({ file, source }) =>
      reserveCalls(source).filter((args) => lastArgument(args) !== "parsed.member").map(() => file));
    expect(빠진곳, `인증 결과를 안 넘기는 곳: ${빠진곳.join(", ")}`).toEqual([]);
  });

  it("**authenticateApiMember() 를 따로 부르지 않는다**", () => {
    const 다시인증 = 읽고예약하는길.filter(({ source }) => /authenticateApiMember\s*\(/.test(source)).map(({ file }) => file);
    expect(다시인증).toEqual([]);
  });
});
```

(셸 heredoc 으로 이 파일을 쓰면 `/\\/g` 의 역슬래시가 하나로 줄어 구문 오류가 난다 — 편집 도구로 쓴다. 계획 검증 때 실제로 겪었다.)

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/membership/__tests__/reserve-reuses-member.test.ts lib/pdp/__tests__/request-member.test.ts app/api/__tests__/auth-once-contract.test.ts`
Expected: FAIL — 「인증한 회원을 받으면 다시 인증하지 않는다」(`claimsCalls` 1), `readPdpRequest`·`readRedesignForm`(`member` undefined), 계약 시험 둘(마지막 인자·`redesign/generate` 의 `authenticateApiMember(`)

- [ ] **Step 3: 구현한다**

`apps/web/lib/membership/api.ts` — `reserveAiUsage` 의 인자와 첫 줄(85-94줄)을 아래로:

```ts
export async function reserveAiUsage(
  request: Request,
  operation: GenerationOperation,
  units: number,
  creditPlan?: CreditReservationPlan,
  /**
   * 이 요청에서 **이미 인증한 회원**(설계 2026-09-29 §3.2). 주면 다시 인증하지
   * 않는다 — profiles 0.2초 왕복 한 번이 빠진다. 같은 요청의 `authenticateApiMember`
   * 결과만 넘긴다(다른 요청·다른 사람의 것을 넘기지 않는다).
   */
  authenticated?: ApiMember,
): Promise<
  | { ok: true; userId: string; requestId: string; usage: UsageSummary }
  | { ok: false; response: Response }
> {
  const auth = authenticated ? { ok: true as const, member: authenticated } : await authenticateApiMember();
```

`apps/web/lib/pdp/request.ts`:
- 5줄 → `import { authenticateApiMember, type ApiMember } from "../membership/api";`
- 232줄(`readRedesignForm` 머리)을 아래로:

```ts
/*
  **인증 결과를 함께 돌려준다**(설계 2026-09-29 §3.2). 라우트가 `reserveAiUsage` 에
  그대로 넘겨, 한 요청 안에서 profiles 를 두 번 읽지 않는다.
*/
export async function readRedesignForm(req: Request): Promise<
  { ok: true; form: FormData; member: ApiMember } | { ok: false; response: Response }
> {
```

- 248줄 `return { ok: true, form };` → `return { ok: true, form, member: auth.member };`
- 253줄 `{ ok: true; body: T } | { ok: false; response: Response }` → `{ ok: true; body: T; member: ApiMember } | { ok: false; response: Response }`
- 261줄 `return { ok: true, body: parsed.data as T };` → `return { ok: true, body: parsed.data as T, member: auth.member };`

일곱 라우트 — 각 `reserveAiUsage(…)` 의 닫는 괄호 앞에 `, parsed.member` 를 더한다:

| 파일:줄 | 바꾼 뒤 |
|---|---|
| `app/api/pdp/analyze/route.ts:36` | `reserveAiUsage(req, "pdp_analyze", 0, freeCreditPlan("pdp:analyze"), parsed.member)` |
| `app/api/pdp/images/batch/route.ts:130` | `reserveAiUsage(req, "pdp_image", imageCreditUnits(model, sections.length), creditImagePlan(sections.length, pdpCreditSize(model, body.aspectRatio), "pdp:batch"), parsed.member)` |
| `app/api/pdp/images/route.ts:90` | `reserveAiUsage(req, "pdp_image", imageCreditUnits(model, 1), creditImagePlan(1, pdpCreditSize(model, body.aspectRatio), "pdp:image"), parsed.member)` |
| `app/api/pdp/key-visual/route.ts:49` | `reserveAiUsage(req, "pdp_image", units, creditImagePlan(1, pdpCreditSize(model, body.aspectRatio), "pdp:key-visual"), parsed.member)` |
| `app/api/pdp/plan-from-text/route.ts:46` | `reserveAiUsage(req, "pdp_analyze", 0, freeCreditPlan("pdp:plan"), parsed.member)` |
| `app/api/redesign/edit-section/route.ts:43` | `reserveAiUsage(req, "redesign_edit", units, creditImagePlan(1, { width: 1152, height: 2048 }, "redesign:edit"), parsed.member)` |
| `app/api/redesign/generate/route.ts:126` | `reserveAiUsage(req, "redesign_generate", 청구(requestedCount), creditPlan, parsed.member)` |

`app/api/redesign/generate/route.ts` 의 세 번째 인증도 없앤다. 5줄 → `import { settleAiUsage, reserveAiUsage } from "../../../../lib/membership/api";`(쓰는 곳이 없어지는 `authenticateApiMember` 를 뺀다). 146-148줄을 아래로:

```ts
      // 몸통을 읽을 때 인증한 회원이다 — 다시 인증하지 않는다(설계 2026-09-29 §3.2).
      const userId = parsed.member.userId;
      const teamId = await teamIdOf(userId);
```

152줄 `loadCharacterView(auth.member.userId, characterId, angle, teamId)` → `loadCharacterView(userId, characterId, angle, teamId)`.

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/membership lib/pdp app/api/pdp app/api/redesign app/api/__tests__`
Expected: PASS — 세 새 파일(2·2·3개) 포함 전부. 기존 `credit-plan-contract`(넷째 인자 ≥4) 도 그대로 통과(다섯째가 더해질 뿐)

- [ ] **Step 5: 커밋**

```bash
git add apps/web/lib/membership/api.ts apps/web/lib/pdp/request.ts apps/web/app/api/pdp apps/web/app/api/redesign apps/web/lib/membership/__tests__/reserve-reuses-member.test.ts apps/web/lib/pdp/__tests__/request-member.test.ts apps/web/app/api/__tests__/auth-once-contract.test.ts
git commit -m "perf(credit): 상세페이지·리디자인 요청이 회원 확인을 한 번만 한다

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 전체 검증·독립 리뷰·뮤테이션 확인

**Files:** 없음(고칠 것이 나오면 해당 Task 파일)

- [ ] **Step 1: 설계·계획 재확인** — 설계 §3.2·이 계획의 「어느 자리가 무엇으로 바뀌나」 표를 다시 읽고, `git diff origin/master --stat` 이 File Structure 표와 맞는지 본다(표에 없는 파일이 바뀌었으면 까닭을 적거나 되돌린다)

- [ ] **Step 2: 형 검사·시험·린트**

```bash
cd apps/web && npx tsc --noEmit && echo TSC_OK
cd apps/web && npx vitest run
cd apps/web && npx next lint
```
Expected: `TSC_OK`; vitest 실패 0(계획 검증 때 `475 passed | 3 skipped` 파일, `5692 passed` 시험); `✔ No ESLint warnings or errors`.
`lib/__tests__/install-host-duplicate-site.test.ts` 가 전체 실행 중에만 한 번 실패하면 단독으로 다시 돌린다(`npx vitest run lib/__tests__/install-host-duplicate-site.test.ts`) — 셸을 띄우는 시험이라 전체 부하에서 가끔 늦는다(계획 검증 때 단독 2회 모두 통과). 단독으로도 실패하면 같은 명령을 `origin/master` 의 깨끗한 워크트리에서 돌려 S2 와 무관한지 확인한다

- [ ] **Step 3: 서버 쪽에 getUser 가 남지 않았나**

```bash
cd apps/web && grep -rn "auth\.getUser\|auth\.getSession\|sessionIdFromAccessToken" --include=*.ts --include=*.tsx app lib middleware.ts | grep -v __tests__
```
Expected: `app/login/page.tsx:59` 한 줄(브라우저 클라이언트)

- [ ] **Step 4: 뮤테이션 확인** — 아래를 하나씩 바꿔 해당 시험이 **실패하는지** 보고 되돌린다(계획 검증 때 모두 실패를 확인했다)

| 바꾸기 | 잡아야 할 시험 |
|---|---|
| `middleware.ts` 의 `verifiedLogin(supabase.auth)` 를 옛 `getUser()` 줄로 | `middleware-session`·`middleware-nonmember` 전부 |
| `middleware.ts` 에서 `global: { fetch: authRoundTrips.fetch },` 삭제 | 「auth 왕복을 세는 fetch 를 단다」 |
| `middleware.ts` 의 `verifiedLogin` 다음 줄에 `response = NextResponse.next({ request });` 추가 | 「만료가 가까워 … 새 로그인 쿠키」 |
| `middleware.ts` 의 `const sessionId = user.sessionId;` → `= null;` | 세션 번호 묶기 시험 3개 |
| `middleware.ts` 의 `const active = isUsableAccount(profile);` → `= true;` | 상태별 `/access`·행 없음 4개 |
| `middleware.ts` 의 `.eq("id", user.userId)` → `.eq("id", "someone")` | 「profiles 는 … 회원 번호(sub)로 읽는다」 |
| `api.ts` 의 `.eq("id", login.userId)` → `.eq("id", "someone")` | claims-gate 「토큰의 회원 번호(sub)로」 |
| `api.ts` 의 `if (typed.status === "suspended") {` → `if (false) {` | claims-gate `suspended` |
| `api.ts` 의 `authenticated ? … : await authenticateApiMember()` → `await authenticateApiMember()` | reserve-reuses-member |
| `verified-login.ts` 의 `if (error \|\| !data)` → `if (!data)` | 「서명·만료 오류가 있으면 손님」 |
| `auth-round-trips.ts` 의 `counted.user > 0` → `counted.user > 1` | 「남긴 뒤에는 0 부터 다시 센다」 |
| `app/api/pdp/images/route.ts` 의 `, parsed.member)` → `)` | auth-once-contract 「마지막 인자」 |
| `request.ts` 의 `member: auth.member` → `member: { userId: "x" } as never` | request-member |

- [ ] **Step 5: 독립 리뷰** — `code-reviewer` 에이전트(새 맥락)에 이 계획 경로·설계 §3.2·`git diff origin/master...HEAD` 를 주고 「보안(토큰 신뢰 범위·profiles 판정 누락), 미들웨어 쿠키 갱신 경로, edge 런타임 호환, 세는 fetch 의 오탐·누락」을 보게 한다. CRITICAL·HIGH 는 고치고 Step 2·4 를 다시 돈다. 지적과 반영을 PR 본문에 표로 적는다

---

### Task 7: 시험 서버에서 전후를 잰다(로그인 후 25·50·100, Kong·브라우저 호출 수)

**Files:**
- Modify: `docs/capacity/2026-09-29-baseline.md`(끝에 「S2 뒤」 절)
- Create: `docs/capacity/raw/2026-10-01-s2/*.txt`(원본 로그)

**조건(기준선과 같게):** 시험 서버 A `43.202.63.50`(t3.medium, 사설 172.31.13.128, 힙 1536MB·`MemoryHigh=2800M`·`MemoryMax=3200M`), 도우미 B `43.200.70.164`(사설 172.31.26.41, 시험 Supabase·k6·Playwright), DB 컨테이너 CPU 1·메모리 1GB, A→DB 0.2초(`tc netem`). **「전」은 S0 숫자를 쓰지 않는다** — S0 는 t3.micro 였고 S1 은 로그인 후 화면을 건너뛰었다(기준선 문서 「컨트롤러 재정」). 같은 날 같은 A 에서 「전」(이 가지의 시작점 `origin/master`)과 「후」(이 가지)를 잇달아 잰다.

키: `K="C:/Users/PC/AppData/Local/Temp/claude/C--Users-PC-Desktop-coding-fixup-image-agent/96cc3fe1-376f-4835-8f15-843a84042f56/scratchpad/loadtest/loadtest_lf.pem"`(같은 폴더의 `build-b.sh`·`tools/` 도 쓴다). 아래 명령은 Git Bash 기준.

- [ ] **Step 1: 시험 조건이 살아 있나 확인한다**

```bash
A=43.202.63.50; B=43.200.70.164
ssh -i "$K" ubuntu@$A 'sudo tc qdisc show dev ens5 | grep -c "delay 200ms"; nproc; free -m | awk "/Mem/{print \$2}"; systemctl is-active fixup-image-agent caddy; readlink /opt/fixup-image-agent/current; grep NODE_OPTIONS /etc/fixup-image-agent/app.env'
ssh -i "$K" ubuntu@$B 'docker inspect supabase_db_sb --format "{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}"; curl -s http://127.0.0.1:54321/auth/v1/.well-known/jwks.json | grep -o "\"alg\":\"[A-Z0-9]*\""'
```
Expected: `1`, `2`, 3800 안팎, `active active`, 현재 릴리스 경로, `--max-old-space-size=1536`; B 는 `1000000000 1073741824`, `"alg":"ES256"`.
지연이 0 이면(재부팅) 다시 건다:
```bash
ssh -i "$K" ubuntu@$A 'IF=$(ip route get 172.31.26.41 | grep -oP "dev \K\S+");
sudo tc qdisc replace dev $IF root handle 1: prio;
sudo tc qdisc replace dev $IF parent 1:3 handle 30: netem delay 200ms;
sudo tc filter replace dev $IF protocol ip parent 1:0 prio 3 u32 match ip dst 172.31.26.41/32 match ip dport 54321 0xffff flowid 1:3;
curl -s -o /dev/null -w "%{time_connect}\n" http://172.31.26.41:54321/rest/v1/'
```
Expected: `0.20` 안팎(접속 왕복). DB 제한이 풀렸으면 `ssh … $B 'docker update --cpus 1 --memory 1g --memory-swap 1g supabase_db_sb'`

- [ ] **Step 2: 「전」·「후」 꾸러미를 B 에서 만든다(push 대신 bundle)**

「전」은 이 가지가 갈라져 나온 커밋(`MB`)이다. 「후」 묶음에 그 커밋이 들어 있으므로 묶음에는 「후」 가지만 싣고, B 에서 `MB` 로 「전」 가지를 만든다(범위가 빈 가지를 묶음에 넣으면 git 이 그 가지를 빼 버린다).

```bash
BASE=$(ssh -i "$K" ubuntu@$B 'cd ~/app && git rev-parse HEAD')
MB=$(git merge-base origin/master feat/capacity-s2-claims)
git cat-file -e "$BASE^{commit}" && git merge-base --is-ancestor "$BASE" "$MB" && echo BASE_OK
git bundle create "$(dirname "$K")/s2.bundle" "$BASE..feat/capacity-s2-claims"
scp -i "$K" "$(dirname "$K")/s2.bundle" ubuntu@$B:/tmp/s2.bundle
scp -i "$K" "$(dirname "$K")/build-b.sh" ubuntu@$B:/tmp/build-b.sh
ssh -i "$K" ubuntu@$B "cd ~/app && git status --porcelain | head -3 && git fetch -q /tmp/s2.bundle +feat/capacity-s2-claims:s2-after && git branch -f s2-before $MB && git log --oneline -1 s2-before && git log --oneline -1 s2-after"
ssh -i "$K" ubuntu@$B 'cd ~/app && for tag in before after; do git checkout -q s2-$tag && bash /tmp/build-b.sh > /tmp/build-$tag.log 2>&1; tail -1 /tmp/build-$tag.log; mv ~/app-test.tar.gz ~/app-s2-$tag.tar.gz; done;
scp -i ~/.ssh/loadtest.pem -q ~/app-s2-before.tar.gz ~/app-s2-after.tar.gz ubuntu@172.31.13.128:/tmp/ && scp -i ~/.ssh/loadtest.pem -q -r ~/app/deploy/ec2 ubuntu@172.31.13.128:/tmp/ec2-new && echo COPIED'
```
Expected: `BASE_OK`; 세 번째 명령의 `git status` 가 빈 출력(B 작업 폴더가 깨끗해야 checkout 이 안전하다 — 무언가 나오면 멈추고 사용자에게 묻는다), `s2-before` 가 `MB`, `s2-after` 가 이 가지 HEAD; `BUILD_DONE` 두 번, `COPIED`. `BASE_OK` 가 안 나오면(B 가 다른 역사) `"$BASE..feat/capacity-s2-claims"` 대신 `"$(git rev-list --max-parents=0 HEAD | tail -1)..feat/capacity-s2-claims"`(전체 역사)로 묶는다. 「후」 빌드가 edge 미들웨어까지 컴파일했다는 것이 곧 edge 호환 확인이다(`pnpm build:ec2` 실패면 멈춘다)

- [ ] **Step 3: 「전」을 배포하고 잰다**

```bash
ssh -i "$K" ubuntu@$A 'sed -i "s/\r$//" /tmp/ec2-new/*; sudo bash /tmp/ec2-new/deploy-release.sh /tmp/app-s2-before.tar.gz "$(date -u +%Y%m%dT%H%M%SZ)-s2-before" | tail -2; curl -s -o /dev/null -w "ready=%{http_code}\n" http://127.0.0.1/api/health/ready'
ssh -i "$K" ubuntu@$B 'cd ~/tools/k6 && . ./envk6.sh && USER_PREFIX=s2 USER_COUNT=100 node setup-users.mjs >/dev/null 2>&1 &&
for v in 25 50 100; do
  ( for i in $(seq 40); do docker stats --no-stream --format "{{.CPUPerc}}" supabase_db_sb; done > /tmp/dbcpu-before-$v.txt ) &
  LEVELS=$v HOLD=60s RAMP=10s k6 run --quiet browse.js > /tmp/k6-before-$v.txt 2>&1; wait
  echo "== $v"; grep -E "^(page_library|page_sns|page_guide|api_library|api_poster_projects) " /tmp/k6-before-$v.txt
  tr -d "%" < /tmp/dbcpu-before-$v.txt | sort -n | awk "{a[NR]=\$1; s+=\$1} END {printf \"dbcpu avg=%.0f%% max=%.0f%%\n\", s/NR, a[NR]}"
done'
```
Expected: `Release active`, `ready=200`, 세 수준 표와 DB CPU. (k6 열: 이름·건수·p50·p95·p99·max·실패%, 기준선과 같은 모양)

브라우저 한 번 열기와 Kong 호출 수(S0 방식 + 점이 든 경로까지 잡도록 정규식을 넓혔다):

```bash
ssh -i "$K" ubuntu@$B 'b=$(docker logs supabase_kong_sb 2>&1 | wc -l); USERS_FILE=$HOME/tools/k6/users.json node ~/tools/browser-count.mjs; docker logs supabase_kong_sb 2>&1 | tail -n +$((b+1)) | grep -oE "\"(GET|POST|PATCH|PUT) /[a-z]+/v1/[a-z_/.-]*" | sort | uniq -c | sort -rn | head -15'
```
Expected: 화면별 `{"app":…,"supabase":…}` 다섯 줄, 그리고 상위 호출 — 「전」은 `GET /auth/v1/user` 가 맨 위 근처(S0: 85)

- [ ] **Step 4: 「후」를 배포하고 똑같이 잰다**

Step 3 의 세 명령을 `before` → `after` 로만 바꿔 그대로 돈다(`/tmp/app-s2-after.tar.gz`, 릴리스 이름 `…-s2-after`, `/tmp/k6-after-$v.txt`, `/tmp/dbcpu-after-$v.txt`). 이어서 A 의 세기 로그를 본다:

```bash
ssh -i "$K" ubuntu@$A 'sudo journalctl -u fixup-image-agent --since "30 min ago" --no-pager | grep -c "auth-claims"; sudo journalctl -u fixup-image-agent --since "30 min ago" --no-pager | grep "auth-claims" | tail -3'
```

**S2 합격 기준(이 단계 몫):**

| 항목 | 기준 |
|---|---|
| Kong `GET /auth/v1/user`(브라우저 한 번 열기) | 「전」 수십 → **「후」 0** (토큰 갱신은 `POST /auth/v1/token` 으로 따로 보인다 — 세지 않는다) |
| Kong `jwks.json` | 「후」 **2 이하**(웹 서버·미들웨어가 10분에 한 번씩) |
| A 의 `auth-claims` 로그 | 「후」 0줄 |
| Kong `profiles`·`credit_summary`·`team_members` | 「전」과 비슷(S6 몫 — 바뀌면 까닭을 찾는다) |
| k6 실패율 | 「후」가 「전」보다 높지 않다 |
| 로그인 후 화면 p50·p95 | 25·50·100 모두 「후」 ≤ 「전」. 설계 §3.9(100명 보통 2초·느린 쪽 5초)와의 차이는 숫자로 적는다 — 못 미치면 남은 호출(profiles 2·`credit_summary` 잠금·`team_members`)이 S6 근거다 |

- [ ] **Step 5: (Kong 의 `jwks.json` 이 많을 때만) 미들웨어 공개 키 보관 확인**

Kong 에서 「후」 `jwks.json` 이 브라우저 요청 수만큼 나오면 edge 샌드박스가 요청 사이에 모듈 상태를 못 들고 있는 것이다(Review Focus 5). 이때 미들웨어를 nodejs 런타임으로 돌린다 — `apps/web/middleware.ts` 의 `config` 에 한 줄:

```ts
export const config = {
  // 공개 키 보관(auth-js `GLOBAL_JWKS`)이 요청 사이에 남게 Node 프로세스에서 돈다(설계 §3.2, S2 측정).
  runtime: "nodejs",
  // (아래 matcher 주석·값은 그대로)
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|site.webmanifest|samples/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|woff2?|otf|ttf)$).*)",
  ],
};
```
그리고 `__tests__/middleware-session.test.ts` 에 `it("미들웨어는 nodejs 런타임이다", async () => { const { config } = await import("../middleware"); expect(config.runtime).toBe("nodejs"); });` 를 더해 Task 6 Step 2 를 다시 돌고 Step 2~4 를 「후」만 다시 잰다. 많지 않으면 이 Step 은 건너뛴다(기록만)

- [ ] **Step 6: 기록하고 커밋한다**

원본을 내려받는다:
```bash
mkdir -p docs/capacity/raw/2026-10-01-s2
for tag in before after; do for v in 25 50 100; do
  ssh -i "$K" ubuntu@$B "cat /tmp/k6-$tag-$v.txt" > docs/capacity/raw/2026-10-01-s2/k6-$tag-$v.txt
  ssh -i "$K" ubuntu@$B "cat /tmp/dbcpu-$tag-$v.txt" > docs/capacity/raw/2026-10-01-s2/dbcpu-$tag-$v.txt
done; done
```
Step 3·4 의 브라우저·Kong 출력과 `auth-claims` 출력은 `browser-kong-before.txt`·`browser-kong-after.txt`·`auth-claims-after.txt` 로 붙여 넣는다. 커밋 전에 비밀값이 없는지 본다:
```bash
grep -rnE "sb_secret_|sb_publishable_|eyJ|service_role|apikey|Authorization|Bearer|AKIA|password" docs/capacity/raw/2026-10-01-s2 || echo CLEAN
```
Expected: `CLEAN`.

`docs/capacity/2026-09-29-baseline.md` 끝에 「## S2 뒤 (로그인 확인을 getClaims 로, 2026-10-01)」 절을 더한다 — 조건(위 「조건」 그대로), 「전」·「후」 표(25·50·100 × 라이브러리·카드뉴스·안내·목록 API·포스터 목록 API 의 p50/p95·실패%, DB CPU 평균/최대), 브라우저 한 번 열기 표(화면별 app·supabase), Kong 상위 호출 전후 표, `auth-claims` 줄 수, 합격 기준 표에 「맞음/아님」, 「해석(숫자에 붙은 사실만)」. 「후」 미들웨어를 nodejs 로 바꿨으면 그것도 적는다.

```bash
git add docs/capacity/2026-09-29-baseline.md docs/capacity/raw/2026-10-01-s2
git commit -m "docs(capacity): S2 전후 — 로그인 후 화면 25·50·100, Supabase 호출 수

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: 시험 서버를 원래대로** — A 는 측정 모양 그대로 둔다(다음 단계가 쓴다). B 의 `/tmp/s2.bundle`·`~/app-s2-*.tar.gz` 와 이 컴퓨터의 `$(dirname "$K")/s2.bundle` 은 지운다(시험 서버는 이 작업용 일회성 장비라 사용자 데이터가 아니다). B 의 `~/app` 은 `git checkout -q s2-after` 상태로 남는다 — 다음 측정은 Step 2 처럼 bundle 로 옮긴다

---

### Task 8: 운영 반영 — **사용자가 해야 하는 단계가 있다**

**Files:** 없음

- [ ] **Step 1: (사용자) Supabase 대시보드에서 JWT 키를 확인한다**

사용자에게 쉬운 말로 부탁한다: 「Supabase 에 들어가 운영 프로젝트(주소가 `bbuweuvylystagohqlhf` 로 시작하는 것) → 왼쪽 아래 **Project Settings** → **JWT Keys** 화면을 열어, 세 가지를 캡처해 주세요.」

| 볼 것 | 기대 | 다르면 |
|---|---|---|
| **Current key**(지금 서명하는 키) 종류 | **ECC (P-256)**, 키 번호가 `2ccd50eb` 로 시작 | 「Legacy HS256 (Shared Secret)」이면 **운영 토큰은 아직 옛 방식**이다. 배포해도 고장은 없다 — `getClaims` 가 지금과 똑같이 `getUser` 로 돌아가 효과만 0 이고, 1분마다 `auth-claims` 경고가 남는다. **키를 바꾸는(rotate) 일은 하지 않는다** — 같은 Supabase 를 쓰는 상세페이지 제품이 옛 비밀값으로 토큰을 직접 확인하고 있으면 그쪽 로그인이 깨진다. 그쪽 담당과 확인한 뒤 사용자가 정한다 |
| Previously used / Standby 키 | 참고만 | — |
| **Access token expiry**(로그인 토큰 수명, JWT Keys 또는 Auth 설정) | **3600초** 이하 | 더 길면 「로그아웃한 토큰이 유효한 시간」이 그만큼 길어진다 — 숫자를 사용자에게 보고하고 진행 여부를 묻는다 |

- [ ] **Step 2: 다른 터미널의 작업이 섞였나 본다**(메모리 「배포 전 다른 터미널 확인」)

```bash
ssh -i "C:/Users/PC/Desktop/coding/aws/instargram.pem" ubuntu@54.180.68.212 'readlink /opt/fixup-image-agent/current'
git fetch -q origin && git log --oneline <운영 current 의 sha>..origin/master && git diff --name-only <운영 sha>..origin/master -- supabase/migrations/
```
내 것 말고 남의 머지·마이그레이션이 있으면 **배포하지 말고 사용자에게 누가 배포할지 묻는다.** 이 단계에는 마이그레이션이 없다. `docs/DEPLOY.md` 「배포 전에 최근 생성 요청을 본다」도 따른다(배포=재시작)

- [ ] **Step 3: PR·머지·배포** — PR 본문에 Task 6 리뷰 반영표와 Task 7 전후 표를 싣는다. 사용자가 「배포해 주세요」라고 하면 `CLAUDE.md` 대로 **`docs/DEPLOY.md` 「매 배포」를 열어** 그대로 한다(기억으로 하지 않는다)

- [ ] **Step 4: 배포 뒤 확인(DEPLOY.md 「배포 뒤 확인」 + 이번 변경 문구)**

```bash
ssh -i "C:/Users/PC/Desktop/coding/aws/instargram.pem" ubuntu@54.180.68.212 'systemctl is-active fixup-image-agent; curl -s -o /dev/null -w "local=%{http_code}\n" http://127.0.0.1:3000/; readlink /opt/fixup-image-agent/current; sudo grep -rl "auth-claims" /opt/fixup-image-agent/current/apps/web/.next | head -3'
```
Expected: `active`, `local=200`, 새 릴리스, `auth-claims` 가 든 파일 하나 이상(미들웨어 묶음과 서버 묶음)

- [ ] **Step 5: (사용자 + 확인) 실제로 왕복이 사라졌나**

사용자에게: 「로그인한 채로 라이브러리·카드뉴스·포스터·만들기 화면을 2분 동안 몇 번 오가 주세요.」 그다음:

```bash
ssh -i "C:/Users/PC/Desktop/coding/aws/instargram.pem" ubuntu@54.180.68.212 'sudo journalctl -u fixup-image-agent --since "10 min ago" --no-pager | grep -c "auth-claims"; sudo journalctl -u fixup-image-agent --since "10 min ago" --no-pager | grep "auth-claims" | tail -2'
```
Expected: `0`. 줄이 나오면 문장 속 `getUser N회`·`공개 키 목록 N회` 를 보고 — `getUser` 가 있으면 Step 1 의 「Current key」가 옛 방식이거나 토큰 키 번호가 목록에 없다는 뜻이다. 사용자에게 「바뀐 효과가 아직 안 나고 있습니다(고장은 아님)」로 보고하고 Step 1 표대로 정한다.
(선택) 사용자가 Supabase **Logs → Auth** 에서 `/user` 요청이 배포 시각 뒤로 줄었는지 볼 수 있다 — 같은 프로젝트를 상세페이지 제품도 쓰므로 0 이 되지는 않는다

- [ ] **Step 6: 로그아웃·정지가 그대로인지 사용자와 확인** — 쉬운 말 순서: ① 로그아웃 → 라이브러리 주소를 직접 열면 첫 화면 가입 안내로 간다 ② (관리자) 시험 계정을 정지 → 그 계정 브라우저에서 새로고침하면 「/access」 대기 화면 ③ 정지 풀기. 하나라도 다르면 **되돌린다**: `docs/DEPLOY.md` 「되돌리기」(`sudo bash deploy/ec2/rollback-release.sh <이전 release-id>`)

- [ ] **Step 7: 메모리 갱신** — 결과(전후 숫자·JWT 키 상태·남은 S6 후보)를 사용자에게 표로 보고하고, `.claude/.../memory` 에 남길지 묻는다(쓰기는 묻고 한다)
