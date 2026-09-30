# AI 사용 통제 C5 구현 계획 — 비회원 회원가입 안내 모달과 `/demo` 삭제

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 비회원이 공개 목록 밖 화면을 열면 로그인 화면 대신 첫 화면으로 보내 「회원가입이 필요합니다」 모달을 띄우고(D3), 쓰지 않는 데모 페이지 `/demo` 를 지운다(D8).

**Architecture:** 미들웨어의 비회원 분기 한 곳만 바꿔 `/login?next=…` 대신 `/?signup=required&next=<경로>` 로 보낸다(주소 만드는 함수는 `lib/routes.ts`). 첫 화면(`app/page.tsx`)이 주소의 `signup`·`next` 를 순수 함수로 읽어, 로그인하지 않은 사람에게만 `@fixup/ui` Dialog 로 만든 모달을 그린다. [로그인] 은 `next` 를 로그인 화면에 넘기고, 로그인 화면은 **지금 코드 그대로** `safeNext` 로 걸러 돌려보낸다. `/demo` 는 페이지·공개 목록·링크·시험 목록에서 빼고, 그림 파일은 남긴다.

**Tech Stack:** Next.js 15 App Router(미들웨어·서버 컴포넌트·클라이언트 컴포넌트) · `@fixup/ui`(shadcn 계열 Radix Dialog·Button) · lucide-react · vitest · react-test-renderer

**Spec:** `docs/superpowers/specs/2026-09-30-ai-usage-control-design.md` (승인됨, 개정 1). 이 계획은 §1 의 D3·D8, §3.5, §5 의 「비회원」 줄, §6 의 C5 줄, §8 의 Minor(「`/demo` 비회원 기대값, 만료 경로 유지, `/`·`/about` 사용자 확인 표시」)와 C-2(그림 삭제 금지)를 구현한다. C1~C4 는 이 계획 밖이다.

**작업 시작 전(매 Task):** 설계 문서 §3.5 와 고칠 파일의 **현재 내용**을 다시 연다(사용자 규칙 `design-recheck`). 앞 Task 가 같은 파일(`middleware.ts`, 새 시험 파일)을 바꿨을 수 있다.

## Global Constraints

- 비회원에게 열린 화면은 **이 아홉 뿌리뿐이다**(2026-09-30 사용자 확인): `/`, `/about`, `/guide`(와 `/guide/**`), `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm`, `/auth/signout`. 판정은 지금의 `matches()` 그대로(같거나 `뿌리/` 로 시작).
- 그 밖의 화면을 비회원이 열면 **307 → `/?signup=required&next=<경로>`**. `next` 는 지금 로그인 분기처럼 **경로만** 싣는다(`?` 뒤는 싣지 않는다). `URLSearchParams` 로 적으므로 `/` 는 `%2F` 로 나간다.
- 모달: 제목 「회원가입이 필요합니다」, 단추 [회원가입](`/signup`) · [로그인](`/login?next=<next>`, `next` 가 없으면 `/login`) · [닫기]. 모달은 `@fixup/ui` 의 `Dialog` 계열을 쓴다(`packages/ui/src/components/ui/dialog.tsx`). 아이콘은 lucide-react. 새 의존성을 더하지 않는다.
- 로그인한 사람에게는 모달을 띄우지 않는다(`/?signup=required…` 를 뒤로 가기·즐겨찾기로 다시 열 수 있다).
- 로그인 뒤 돌아가기는 **기존 `safeNext` 처리 그대로**(`app/login/page.tsx:97, :113`). 로그인 화면은 고치지 않는다. `safeNext` 도 고치지 않는다(`/\evil.com` 은 설계 §3.5 에서 범위 밖).
- 로그인 유지 시간이 지난 경우는 **지금 그대로** `/login?expired=1`(`middleware.ts:107-140`). API 는 지금처럼 미들웨어가 화면으로 보내지 않고 각 라우트가 401 을 낸다.
- `/demo` 삭제 범위: `app/demo/page.tsx`, 공개 목록의 `"/demo"`, `app/_components/public-shell.tsx` 의 링크 둘, `lib/__tests__/dev-auth.test.ts` 의 `/demo`, `docs/MEMBERSHIP_DEPLOYMENT.md` 점검표의 `/demo`. **`public/demo-sections/**`·`public/samples/**` 는 지우지 않는다**(첫 화면 슬라이드 `app/_landing/hero/slides.ts:23-33`, `app/api/sns/local-fake-flow.ts:124` 가 쓴다).
- `/demo` 를 지운 뒤: 비회원 → 첫 화면 + 모달, 회원 → Next 의 404.
- `middleware.ts` 의 `if (!user) {` 글자와 `if (isDisabledRoute(pathname))` 가 그보다 앞에 있는 순서를 지킨다(`lib/access/__tests__/routes.test.ts:151-161` 이 글자로 잰다).
- 운영 반영은 **앱만**(마이그레이션 없음). 머지·배포는 **사용자 승인 뒤에만** 한다. 사용자 계정에 속한 것(릴리스·아티팩트·서버 파일)을 묻지 않고 지우지 않는다(`CLAUDE.md`).
- 바꾼 줄은 모두 이 요청으로 거슬러 올라가야 한다. 옆 주석·서식을 손보지 않는다(Golden Principle 12).

## Review Focus

1. **로그인한 사람이 `/?signup=required&next=/create` 를 다시 연다**(뒤로 가기·즐겨찾기·다른 탭에서 로그인) — 모달이 뜨면 안 된다. → Task 2 의 `로그인한 사람에게는 띄우지 않는다`(첫 화면 배선 시험).
2. **모달을 닫고 새로고침** — 다시 뜨면 안 된다. 닫을 때 주소에서 `signup`·`next` 를 지워야 한다. → Task 2 의 `[닫기] 는 모달을 닫고 주소에서 안내를 지운다`, `X·Esc·바깥 누르기도 같다`.
3. **밖으로 나가는 `next`**(`//evil.example.com`, `https://evil.example.com`) — [로그인] 링크에 실리면 안 된다. 로그인 화면이 다시 거르지만, 우리 화면이 그런 주소를 만들어 내보내지 않는다. → Task 2 의 `밖으로 나가는 next 는 버린다`.
4. **공개 뿌리와 이름만 비슷한 주소**(`/aboutus`, `/guides`, `/login-help`) — 공개로 새지 않고 모달로 가야 한다. → Task 1 의 `공개 화면과 이름만 비슷한 %s 는 공개가 아니다`.
5. **로그인 유지 24시간이 지난 회원이 회원 화면을 연다** — 새 모달이 아니라 지금처럼 `/login?expired=1` 이어야 한다. → Task 1 의 `로그인 유지 시간이 지난 회원은 지금처럼 /login?expired=1`.

## 파일 지도

| 파일 | 할 일 | Task |
|---|---|---|
| `apps/web/lib/routes.ts` | `SIGNUP_REQUIRED`·`signupRequiredPath()` 더하기 | 1 |
| `apps/web/lib/__tests__/routes.test.ts` | `signupRequiredPath` 시험 더하기 | 1 |
| `apps/web/middleware.ts` | 비회원 분기를 첫 화면 + 안내로(1), 공개 목록에서 `"/demo"` 빼기(3) | 1·3 |
| `apps/web/__tests__/middleware-nonmember.test.ts` | 새로 — 미들웨어를 진짜로 불러 잰다(1), `/demo` 줄 더하기(3) | 1·3 |
| `apps/web/app/_landing/signup-gate.ts` | 새로 — 주소 읽기·로그인 링크 만들기(순수 함수) | 2 |
| `apps/web/app/_landing/signup-required-modal.tsx` | 새로 — 모달(클라이언트 컴포넌트) | 2 |
| `apps/web/app/page.tsx` | `signup`·`next` 를 읽어 모달 그리기 | 2 |
| `apps/web/app/_landing/__tests__/signup-gate.test.ts` | 새로 — 순수 함수 + 첫 화면 배선 | 2 |
| `apps/web/app/_landing/__tests__/signup-required-modal.test.tsx` | 새로 — 그려서 잰다 | 2 |
| `apps/web/app/demo/page.tsx` | 지운다 | 3 |
| `apps/web/app/_components/public-shell.tsx` | `/demo` 링크 둘 빼기 | 3 |
| `apps/web/lib/__tests__/dev-auth.test.ts` | 목록에서 `/demo` 빼기 | 3 |
| `apps/web/app/__tests__/demo-removed.test.ts` | 새로 — 삭제 범위·그림 보존 | 3 |
| `docs/MEMBERSHIP_DEPLOYMENT.md` | 출시 전 점검표 1번 줄 | 3 |

## 검증 명령(모든 Task 공통)

```bash
# 처음 한 번 — 워크트리의 node_modules 가 오래됐을 수 있다. 저장소 뿌리에서:
pnpm install --frozen-lockfile

# 저장소 뿌리에서
cd apps/web && npx tsc --noEmit && cd ../..                      # 타입: 오류 0
cd apps/web && npx vitest run <그 Task 의 시험 파일들> && cd ../..  # 집중 시험
cd apps/web && npx vitest run && cd ../..                        # 전체 시험(Task 4)
pnpm lint                                                        # = pnpm --filter @fixup/web lint
```

**로컬 화면으로는 모달을 볼 수 없다.** 로컬은 `LOCAL_AUTH_BYPASS=1` 이라 미들웨어가 통째로 건너뛰고(`middleware.ts:57-60`), 첫 화면의 `getMembership()` 이 가짜 회원을 돌려줘(`lib/membership/server.ts:16`) `signedIn` 이 참이다. 그래서 모달이 일부러 안 뜬다. 눈으로 보는 확인은 배포 서버에서 한다(Task 5, `CLAUDE.md` 「로컬 확인」).

---

### Task 1: 비회원을 첫 화면 + 회원가입 안내로 보낸다 (미들웨어)

**Files:**
- Modify: `apps/web/lib/routes.ts:25-28`(바로 아래에 더한다)
- Modify: `apps/web/middleware.ts:4`, `apps/web/middleware.ts:174-179`
- Modify: `apps/web/lib/__tests__/routes.test.ts:2`, 파일 끝
- Create: `apps/web/__tests__/middleware-nonmember.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `export const SIGNUP_REQUIRED = "required";` (`lib/routes.ts`) — Task 2 의 `readSignupGate` 가 같은 값을 본다
  - `export function signupRequiredPath(next: string): string` (`lib/routes.ts`) — `signupRequiredPath("/create") === "/?signup=required&next=%2Fcreate"`
  - `apps/web/__tests__/middleware-nonmember.test.ts` 의 도우미 `요청(path, cookies?)`, `안내로(next)`, 상태 `currentUser` — Task 3 이 같은 파일에 `describe` 를 더한다

- [ ] **Step 1: 실패하는 시험을 쓴다 — 주소 만드는 함수**

`apps/web/lib/__tests__/routes.test.ts` 2번째 줄을 바꾼다:

```ts
import { HOME_AFTER_LOGIN, publicOrigin, safeNext, signupRequiredPath } from "../routes";
```

파일 끝에 더한다:

```ts
describe("비회원 안내 주소 (설계 §3.5)", () => {
  it("첫 화면에 안내 표시와 가려던 곳을 싣는다", () => {
    expect(signupRequiredPath("/create")).toBe("/?signup=required&next=%2Fcreate");
  });

  it("하위 경로도 그대로 싣는다", () => {
    expect(signupRequiredPath("/sns/abc123")).toBe("/?signup=required&next=%2Fsns%2Fabc123");
  });
});
```

- [ ] **Step 2: 실패하는 시험을 쓴다 — 미들웨어를 진짜로 부른다**

`apps/web/__tests__/middleware-nonmember.test.ts` 를 새로 만든다:

```ts
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SESSION_START_COOKIE, sessionStartValue } from "../lib/auth/session-window";

/**
 * 비회원이 회원 화면을 열면 **첫 화면 + 회원가입 안내**로 간다
 * (2026-09-30 사용자, 설계 §3.5 · D3).
 *
 * 미들웨어를 **진짜로 호출한다** — `middleware-session.test.ts` 와 같은 까닭이다.
 * 주소 만드는 함수만 따로 재면, 미들웨어가 그 함수를 안 불러도 통과한다.
 */
let currentUser: { id: string } | null = null;
let profile: { role: string; status: string; email_confirmed_at: string | null } = {
  role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z",
};

/** 로그인 토큰 모양만 흉내 낸다 — 가운데 조각에 session_id 가 든다. */
const 토큰 = () =>
  ["h", Buffer.from(JSON.stringify({ sub: "user-1", session_id: "session-1" })).toString("base64url"), "s"].join(".");

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
      getSession: async () => ({ data: { session: currentUser ? { access_token: 토큰() } : null } }),
      signOut: async () => ({ error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  }),
}));

const { middleware } = await import("../middleware");

const 주소 = "http://54.180.68.212";
const AUTH_COOKIE = "sb-bbuweuvylystagohqlhf-auth-token";
const 하루 = 24 * 60 * 60 * 1000;

function 요청(path: string, cookies: Record<string, string> = {}) {
  const request = new NextRequest(new URL(`${주소}${path}`));
  for (const [name, value] of Object.entries(cookies)) request.cookies.set(name, value);
  return request;
}

/** 비회원이 가야 할 곳. */
const 안내로 = (next: string) => `${주소}/?signup=required&next=${encodeURIComponent(next)}`;

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("LOCAL_AUTH_BYPASS", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-key");
  currentUser = null;
  profile = { role: "member", status: "active", email_confirmed_at: "2026-09-01T00:00:00Z" };
});

describe("비회원이 회원 화면을 열면", () => {
  it.each(["/create", "/sns", "/sns/abc123", "/poster/new", "/library", "/settings", "/easy", "/access"])(
    "%s 는 첫 화면 + 회원가입 안내로 간다",
    async (path) => {
      const response = await middleware(요청(path));

      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(안내로(path));
    },
  );

  it("로그인 화면으로 보내지 않는다 — 아직 가입하지 않은 사람에게 로그인 칸은 막다른 길이다", async () => {
    const response = await middleware(요청("/create"));

    expect(response.headers.get("location")).not.toContain("/login");
  });

  /** 지금까지 로그인 분기도 경로만 실었다. 이번에 바꾸지 않는다. */
  it("주소의 물음표 뒤는 next 에 싣지 않는다 — 지금까지와 같다", async () => {
    const response = await middleware(요청("/create?tab=2"));

    expect(response.headers.get("location")).toBe(안내로("/create"));
  });

  it.each(["/aboutus", "/guides", "/login-help", "/signup2"])(
    "공개 화면과 이름만 비슷한 %s 는 공개가 아니다",
    async (path) => {
      const response = await middleware(요청(path));

      expect(response.headers.get("location")).toBe(안내로(path));
    },
  );

  /** 꺼 둔 화면은 로그인 여부보다 먼저 홈으로 간다(`lib/access/__tests__/routes.test.ts`). 순서를 지킨다. */
  it("꺼 둔 화면은 지금처럼 홈으로 — 안내로 보내지 않는다", async () => {
    const response = await middleware(요청("/inbox"));

    expect(response.headers.get("location")).toBe(`${주소}/guide`);
  });
});

describe("비회원에게 열린 화면은 그대로", () => {
  it.each([
    "/", "/about", "/guide", "/guide/account", "/login", "/signup",
    "/forgot-password", "/reset-password", "/auth/confirm", "/auth/signout",
  ])("%s 는 그대로 연다", async (path) => {
    const response = await middleware(요청(path));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});

describe("API 와 만료는 그대로", () => {
  it("API 는 화면으로 보내지 않는다 — 401 은 각 라우트가 낸다", async () => {
    const response = await middleware(요청("/api/library"));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("로그인 유지 시간이 지난 회원은 지금처럼 /login?expired=1", async () => {
    currentUser = { id: "user-1" };
    const response = await middleware(요청("/create", {
      [AUTH_COOKIE]: "token",
      [SESSION_START_COOKIE]: sessionStartValue(Date.now() - 하루 - 1000, "session-1"),
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login?expired=1");
    expect(response.headers.get("location")).not.toContain("signup=required");
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `cd apps/web && npx vitest run lib/__tests__/routes.test.ts __tests__/middleware-nonmember.test.ts`
Expected: FAIL — `routes.test.ts` 는 `signupRequiredPath is not a function`(또는 타입 오류로 import 실패), `middleware-nonmember.test.ts` 의 「첫 화면 + 회원가입 안내로 간다」·「이름만 비슷한」·「로그인 화면으로 보내지 않는다」·「물음표 뒤」가 `location` 이 `…/login?next=%2Fcreate` 라서 실패. 「그대로 연다」·「꺼 둔 화면」·「API」·「만료」는 이미 통과(지금 동작을 못 박는 줄이다).

- [ ] **Step 4: 주소 만드는 함수를 쓴다**

`apps/web/lib/routes.ts` 의 `safeNext` 함수(25-28줄) 바로 아래에 더한다:

```ts

/**
 * 비회원이 회원 화면을 열었을 때 보내는 곳 (2026-09-30 사용자, 설계 §3.5).
 *
 * 첫 화면이 `signup=required` 를 보고 「회원가입이 필요합니다」 모달을 연다
 * (`app/_landing/signup-required-modal.tsx`). `next` 는 모달의 [로그인] 이
 * 로그인 화면에 넘긴다 — 밖으로 나가는 주소를 걸러 내는 것은 로그인 화면의
 * `safeNext` 다.
 */
export const SIGNUP_REQUIRED = "required";

export function signupRequiredPath(next: string): string {
  return `/?${new URLSearchParams({ signup: SIGNUP_REQUIRED, next }).toString()}`;
}
```

- [ ] **Step 5: 미들웨어의 비회원 분기를 바꾼다**

`apps/web/middleware.ts` 4번째 줄:

```ts
import { HOME_AFTER_LOGIN, publicOrigin, signupRequiredPath } from "./lib/routes";
```

174-179줄의 지금 코드:

```ts
  if (!user) {
    if (matches(pathname, PUBLIC_PATHS)) return response;
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
```

를 이렇게 바꾼다(`if (!user) {` 글자는 그대로 — `lib/access/__tests__/routes.test.ts` 가 찾는다):

```ts
  if (!user) {
    if (matches(pathname, PUBLIC_PATHS)) return response;
    /*
      **비회원은 로그인 화면이 아니라 첫 화면으로 보낸다**(2026-09-30 사용자, 설계 §3.5).
      첫 화면이 「회원가입이 필요합니다」 모달을 연다. 로그인 칸부터 내밀면 아직
      가입하지 않은 사람은 갈 곳을 모른다.

      가려던 곳은 지금까지처럼 `next` 에 **경로만** 싣는다. 모달의 [로그인] 이
      그대로 넘기고, 로그인 화면이 `safeNext` 로 걸러 돌려보낸다. 로그인 유지
      시간이 지난 경우는 위에서 이미 `/login?expired=1` 로 갔다.
    */
    return NextResponse.redirect(new URL(signupRequiredPath(pathname), base));
  }
```

- [ ] **Step 6: 시험이 통과하는지 본다**

Run: `cd apps/web && npx vitest run lib/__tests__/routes.test.ts __tests__/middleware-nonmember.test.ts __tests__/middleware-session.test.ts lib/access/__tests__/routes.test.ts app/guide/__tests__/guide-content.test.ts app/access/__tests__/access-exit.test.ts`
Expected: PASS(전부). `middleware-session.test.ts` 는 만료·로그인 화면 동작이 그대로인지, 나머지 셋은 미들웨어 글자를 읽는 기존 시험이 깨지지 않았는지 본다.

Run: `cd apps/web && npx tsc --noEmit`
Expected: 오류 0.

- [ ] **Step 7: 커밋**

```bash
git add apps/web/lib/routes.ts apps/web/lib/__tests__/routes.test.ts apps/web/middleware.ts apps/web/__tests__/middleware-nonmember.test.ts
git commit -F - <<'EOF'
feat(auth): 비회원을 로그인 대신 첫 화면 회원가입 안내로 보낸다

공개 목록 밖 화면을 연 비회원을 /?signup=required&next=<경로> 로 보낸다(설계 §3.5, D3).
만료(/login?expired=1)·API(각 라우트 401)·꺼 둔 화면 순서는 그대로다.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: 첫 화면이 「회원가입이 필요합니다」 모달을 연다

**Files:**
- Create: `apps/web/app/_landing/signup-gate.ts`
- Create: `apps/web/app/_landing/signup-required-modal.tsx`
- Modify: `apps/web/app/page.tsx:1-15`(import), `:29-36`(주소 읽기), `:63-65`(모달 그리기)
- Test: `apps/web/app/_landing/__tests__/signup-gate.test.ts`, `apps/web/app/_landing/__tests__/signup-required-modal.test.tsx`

**Interfaces:**
- Consumes: `SIGNUP_REQUIRED`, `safeNext` (`apps/web/lib/routes.ts`, Task 1)
- Produces:
  - `type QueryValue = string | string[] | undefined`
  - `interface SignupGate { open: boolean; next: string | null }`
  - `readSignupGate(query: { signup?: QueryValue; next?: QueryValue }): SignupGate`
  - `loginHrefFor(next: string | null): string` — `"/login?next=%2Fcreate"` 또는 `"/login"`
  - `SignupRequiredModal({ next, closeHref }: { next: string | null; closeHref: string }): JSX.Element` (`"use client"`)

- [ ] **Step 1: 실패하는 시험을 쓴다 — 순수 함수와 첫 화면 배선**

`apps/web/app/_landing/__tests__/signup-gate.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loginHrefFor, readSignupGate } from "../signup-gate";

/**
 * 첫 화면의 회원가입 안내 (2026-09-30 사용자, 설계 §3.5 · D3).
 *
 * 미들웨어가 비회원을 `/?signup=required&next=/create` 로 보낸다. 첫 화면은 이
 * 주소만 보고 모달을 연다 — 무엇을 읽는지가 이 파일의 시험이다.
 */
describe("readSignupGate", () => {
  it("signup=required 면 열고 가려던 곳을 싣는다", () => {
    expect(readSignupGate({ signup: "required", next: "/create" })).toEqual({ open: true, next: "/create" });
  });

  it.each([undefined, "", "yes", "REQUIRED"])("signup 이 %s 면 열지 않는다", (signup) => {
    expect(readSignupGate({ signup, next: "/create" })).toEqual({ open: false, next: null });
  });

  it("같은 이름이 두 번 오면 첫 값을 쓴다", () => {
    expect(readSignupGate({ signup: ["required", "x"], next: ["/sns", "/poster"] })).toEqual({ open: true, next: "/sns" });
  });

  it("가려던 곳이 없어도 연다 — [로그인] 은 그냥 로그인 화면으로 간다", () => {
    expect(readSignupGate({ signup: "required" })).toEqual({ open: true, next: null });
  });

  /** 로그인 화면이 다시 거르지만, 우리 화면이 그런 주소를 만들어 내보내지 않는다. */
  it.each(["//evil.example.com", "https://evil.example.com", "evil.example.com"])(
    "밖으로 나가는 next(%s) 는 버린다",
    (next) => {
      expect(readSignupGate({ signup: "required", next })).toEqual({ open: true, next: null });
    },
  );
});

describe("loginHrefFor", () => {
  it("가려던 곳을 로그인 화면에 넘긴다", () => {
    expect(loginHrefFor("/create")).toBe("/login?next=%2Fcreate");
    expect(loginHrefFor("/sns/abc123")).toBe("/login?next=%2Fsns%2Fabc123");
  });

  it("없으면 그냥 로그인 화면", () => {
    expect(loginHrefFor(null)).toBe("/login");
  });
});

/**
 * 첫 화면은 서버 컴포넌트라 여기서 그려 볼 수 없다(DB·쇼케이스를 부른다).
 * 파일을 글자로 읽어 배선을 맞댄다 — 이 저장소의 `header-and-about.test.ts` 방식.
 */
describe("첫 화면 배선", () => {
  const page = readFileSync(path.join(process.cwd(), "app/page.tsx"), "utf8");

  it("주소의 signup·next 를 읽는다", () => {
    expect(page).toContain("readSignupGate({ signup, next })");
  });

  it("로그인한 사람에게는 띄우지 않는다 — 뒤로 가기·즐겨찾기로 이 주소를 다시 열 수 있다", () => {
    expect(page).toContain("gate.open && !signedIn");
  });

  it("모달을 그린다", () => {
    expect(page).toContain("<SignupRequiredModal");
  });
});

describe("모달은 공용 Dialog 를 쓴다", () => {
  const modal = readFileSync(path.join(process.cwd(), "app/_landing/signup-required-modal.tsx"), "utf8");

  it("@fixup/ui 의 Dialog 계열이다 — Radix 를 직접 부르지 않는다", () => {
    expect(modal).toContain('from "@fixup/ui"');
    expect(modal).toContain("DialogContent");
    expect(modal).not.toContain("@radix-ui");
  });
});
```

- [ ] **Step 2: 실패하는 시험을 쓴다 — 모달을 그려서 잰다**

`apps/web/app/_landing/__tests__/signup-required-modal.test.tsx`:

```tsx
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 「회원가입이 필요합니다」 모달을 **그려서** 잰다.
 *
 * 소스에 `href="/signup"` 이 있는지만 보면 단추 밖 주석에 있어도 통과한다.
 * 그려진 링크·단추를 본다. Radix 의 Portal 은 이 시험 환경에서 그려지지 않으므로
 * Dialog 계열만 단순한 껍데기로 바꾼다(`app/poster/__tests__/saved-plan-navigation.test.tsx` 방식).
 * Button 은 진짜를 쓴다 — `asChild` 로 링크를 감싸는지까지 본다.
 */
const f = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: f.replace, push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/link", async () => {
  const { forwardRef } = await import("react");
  return {
    default: forwardRef<HTMLAnchorElement, React.PropsWithChildren<{ href: string }>>(
      ({ children, ...props }, ref) => <a ref={ref} {...props}>{children}</a>,
    ),
  };
});
vi.mock("@fixup/ui", async (original) => {
  const actual = await original<Record<string, unknown>>();
  const Part = ({ children }: React.PropsWithChildren) => <div>{children}</div>;
  return {
    ...actual,
    Dialog: ({ open, onOpenChange, children }: React.PropsWithChildren<{ open: boolean; onOpenChange: (open: boolean) => void }>) => (
      <section data-dialog-open={open}>
        {open ? (
          <>
            {/* X 단추·Esc·바깥 누르기는 모두 onOpenChange(false) 로 온다. */}
            <button onClick={() => onOpenChange(false)}>X로 닫기</button>
            {children}
          </>
        ) : null}
      </section>
    ),
    DialogContent: Part,
    DialogHeader: Part,
    DialogFooter: Part,
    DialogTitle: Part,
    DialogDescription: Part,
  };
});

const { SignupRequiredModal } = await import("../signup-required-modal");

let view: ReactTestRenderer;

const label = (node: unknown): string =>
  typeof node === "string"
    ? node
    : node && typeof node === "object" && "children" in node
      ? ((node as { children: unknown[] }).children ?? []).map(label).join("")
      : "";
const links = () =>
  view.root.findAllByType("a").map((node) => ({ href: node.props.href as string, text: label(node).trim() }));
const button = (text: string) =>
  view.root.findAllByType("button").find((node) => label(node).trim() === text)!;

beforeEach(() => {
  f.replace.mockReset();
});
afterEach(() => {
  act(() => view?.unmount());
});

describe("회원가입 안내 모달", () => {
  it("제목과 [회원가입] [로그인] [닫기] 를 보인다", () => {
    act(() => { view = create(<SignupRequiredModal next="/create" closeHref="/" />); });

    expect(label(view.root)).toContain("회원가입이 필요합니다");
    expect(links()).toEqual(expect.arrayContaining([
      { href: "/signup", text: "회원가입" },
      { href: "/login?next=%2Fcreate", text: "로그인" },
    ]));
    expect(button("닫기")).toBeTruthy();
  });

  it("가려던 곳이 없으면 [로그인] 은 그냥 /login", () => {
    act(() => { view = create(<SignupRequiredModal next={null} closeHref="/" />); });

    expect(links()).toEqual(expect.arrayContaining([{ href: "/login", text: "로그인" }]));
  });

  it("[닫기] 는 모달을 닫고 주소에서 안내를 지운다 — 새로고침해도 다시 안 뜬다", () => {
    act(() => { view = create(<SignupRequiredModal next="/create" closeHref="/" />); });

    act(() => button("닫기").props.onClick());

    expect(view.root.findByProps({ "data-dialog-open": false })).toBeTruthy();
    expect(f.replace).toHaveBeenCalledWith("/", { scroll: false });
  });

  it("X·Esc·바깥 누르기도 같다 — 보던 언어는 남긴다", () => {
    act(() => { view = create(<SignupRequiredModal next="/create" closeHref="/?lang=en" />); });

    act(() => button("X로 닫기").props.onClick());

    expect(view.root.findByProps({ "data-dialog-open": false })).toBeTruthy();
    expect(f.replace).toHaveBeenCalledWith("/?lang=en", { scroll: false });
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `cd apps/web && npx vitest run app/_landing/__tests__/signup-gate.test.ts app/_landing/__tests__/signup-required-modal.test.tsx`
Expected: FAIL — `Failed to resolve import "../signup-gate"` / `"../signup-required-modal"`.

- [ ] **Step 4: 주소 읽기(순수 함수)를 쓴다**

`apps/web/app/_landing/signup-gate.ts`:

```ts
import { SIGNUP_REQUIRED, safeNext } from "../../lib/routes";

/**
 * 첫 화면 주소에서 「회원가입 안내」를 읽는다 (2026-09-30 사용자, 설계 §3.5).
 *
 * 미들웨어가 비회원을 `/?signup=required&next=/create` 로 보낸다
 * (`lib/routes.ts` 의 `signupRequiredPath`). 서버의 첫 화면과 클라이언트의
 * 모달이 함께 쓰므로 DB·세션을 만지지 않는 순수 함수로 둔다.
 */

/** Next 의 searchParams 값. 같은 이름이 두 번 오면 배열이다. */
export type QueryValue = string | string[] | undefined;

export interface SignupGate {
  /** 모달을 열까. */
  open: boolean;
  /** 로그인 뒤 돌아갈 곳. 우리 안의 경로가 아니면 `null`. */
  next: string | null;
}

const first = (value: QueryValue) => (Array.isArray(value) ? value[0] : value);

export function readSignupGate(query: { signup?: QueryValue; next?: QueryValue }): SignupGate {
  if (first(query.signup) !== SIGNUP_REQUIRED) return { open: false, next: null };
  const next = first(query.next);
  // 로그인 화면의 `safeNext` 가 그대로 돌려주는 값만 싣는다 — 밖으로 나가는 주소는 여기서부터 버린다.
  return { open: true, next: next && safeNext(next) === next ? next : null };
}

/** 모달의 [로그인] 이 갈 곳. 로그인 화면이 `next` 를 읽어 돌려보낸다(`app/login/page.tsx`). */
export function loginHrefFor(next: string | null): string {
  return next ? `/login?${new URLSearchParams({ next }).toString()}` : "/login";
}
```

- [ ] **Step 5: 모달을 쓴다**

`apps/web/app/_landing/signup-required-modal.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@fixup/ui";
import { loginHrefFor } from "./signup-gate";

/**
 * 「회원가입이 필요합니다」 (2026-09-30 사용자, 설계 §3.5 · D3).
 *
 * 비회원이 회원 화면을 열면 미들웨어가 첫 화면으로 보내고
 * (`/?signup=required&next=…`), 첫 화면이 이것을 연다. 로그인 화면부터
 * 내밀지 않는 까닭 — 아직 가입하지 않은 사람에게 로그인 칸은 막다른 길이다.
 *
 * 닫으면 **주소에서 안내를 지운다.** 남겨 두면 새로고침할 때마다 다시 뜬다.
 */
export function SignupRequiredModal({ next, closeHref }: { next: string | null; closeHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    router.replace(closeHref, { scroll: false });
  };

  return (
    <Dialog open={open} onOpenChange={(value) => { if (!value) close(); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-lg">
        <DialogHeader>
          <DialogTitle>회원가입이 필요합니다</DialogTitle>
          <DialogDescription>
            이 화면은 회원만 쓸 수 있습니다. 가입하시거나, 이미 회원이면 로그인해 주세요.
          </DialogDescription>
        </DialogHeader>
        {/*
          좁은 화면에서는 `DialogFooter` 가 아래에서 위로 쌓는다(`flex-col-reverse`) —
          위에서부터 회원가입·로그인·닫기. 넓은 화면에서는 오른쪽 끝이 회원가입이다.
        */}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={close}>닫기</Button>
          <Button variant="outline" asChild>
            <Link href={loginHrefFor(next)}>
              <LogIn className="mr-1.5 h-4 w-4" aria-hidden="true" />
              로그인
            </Link>
          </Button>
          <Button asChild>
            <Link href="/signup">
              <UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              회원가입
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: 첫 화면에 배선한다**

`apps/web/app/page.tsx` import 줄(13번째 `TrySection` 아래)에 더한다:

```tsx
import { readSignupGate } from "./_landing/signup-gate";
import { SignupRequiredModal } from "./_landing/signup-required-modal";
```

29-36줄의 지금 코드:

```tsx
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang } = await searchParams;
  const locale: Locale = lang === "en" ? "en" : "ko";
  const t = CONTENT[locale];
```

를 이렇게 바꾼다:

```tsx
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; signup?: string | string[]; next?: string | string[] }>;
}) {
  const { lang, signup, next } = await searchParams;
  const locale: Locale = lang === "en" ? "en" : "ko";
  const t = CONTENT[locale];
  /*
    **비회원이 회원 화면을 열면 여기로 온다**(`middleware.ts`, 설계 §3.5) —
    `/?signup=required&next=/create`. 로그인한 사람에게는 띄우지 않는다(아래
    `!signedIn`): 뒤로 가기·즐겨찾기로 이 주소를 다시 열 수 있다.
  */
  const gate = readSignupGate({ signup, next });
```

63-65줄의 지금 코드:

```tsx
      {/* 바닥에 닿았을 때만 나온다. 첫 화면까지 올라갈 길을 남긴다. */}
      <BackToTop />
    </div>
```

를 이렇게 바꾼다:

```tsx
      {/* 바닥에 닿았을 때만 나온다. 첫 화면까지 올라갈 길을 남긴다. */}
      <BackToTop />

      {gate.open && !signedIn ? (
        <SignupRequiredModal next={gate.next} closeHref={locale === "en" ? "/?lang=en" : "/"} />
      ) : null}
    </div>
```

- [ ] **Step 7: 시험이 통과하는지 본다**

Run: `cd apps/web && npx vitest run app/_landing/__tests__/signup-gate.test.ts app/_landing/__tests__/signup-required-modal.test.tsx app/_landing/__tests__/header-and-about.test.ts`
Expected: PASS(전부).

Run: `cd apps/web && npx tsc --noEmit`
Expected: 오류 0.

- [ ] **Step 8: 뮤테이션으로 시험이 진짜 잡는지 본다**(메모리 「단계별 진행 + 독립 리뷰」)

아래 셋을 **하나씩** 되돌려 해당 시험이 빨개지는지 보고, 곧바로 원래대로 돌린다(`git diff` 가 Step 6 끝과 같아야 한다):

1. `page.tsx` 의 `gate.open && !signedIn` → `gate.open` : `signup-gate.test.ts` 「로그인한 사람에게는 띄우지 않는다」 FAIL
2. 모달의 `router.replace(closeHref, { scroll: false });` 줄 삭제 : 「[닫기] 는 … 주소에서 안내를 지운다」 FAIL
3. `signup-gate.ts` 의 `next && safeNext(next) === next ? next : null` → `next ?? null` : 「밖으로 나가는 next」 FAIL

- [ ] **Step 9: 커밋**

```bash
git add apps/web/app/_landing/signup-gate.ts apps/web/app/_landing/signup-required-modal.tsx apps/web/app/page.tsx apps/web/app/_landing/__tests__/signup-gate.test.ts apps/web/app/_landing/__tests__/signup-required-modal.test.tsx
git commit -F - <<'EOF'
feat(landing): 비회원에게 「회원가입이 필요합니다」 모달을 연다

첫 화면이 ?signup=required&next= 를 읽어 로그인하지 않은 사람에게만 @fixup/ui Dialog 로
[회원가입] [로그인] [닫기] 를 보인다. [로그인] 은 next 를 넘기고, 닫으면 주소에서 안내를 지운다(설계 §3.5).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: `/demo` 를 지운다 (D8)

**Files:**
- Delete: `apps/web/app/demo/page.tsx`(폴더 `apps/web/app/demo/` 째로)
- Modify: `apps/web/middleware.ts:37`(`"/demo",` 한 줄 삭제)
- Modify: `apps/web/app/_components/public-shell.tsx:70-74`, `:86`
- Modify: `apps/web/lib/__tests__/dev-auth.test.ts:14`
- Modify: `docs/MEMBERSHIP_DEPLOYMENT.md:147`
- Modify: `apps/web/__tests__/middleware-nonmember.test.ts`(파일 끝에 `describe` 더하기)
- Create: `apps/web/app/__tests__/demo-removed.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `middleware-nonmember.test.ts` 도우미 `요청`, `안내로`, `AUTH_COOKIE`, 상태 `currentUser`
- Produces: 없음

- [ ] **Step 1: 실패하는 시험을 쓴다 — 미들웨어**

`apps/web/__tests__/middleware-nonmember.test.ts` 끝에 더한다:

```ts
describe("/demo 를 지운 뒤 (D8)", () => {
  it("비회원은 첫 화면 + 회원가입 안내 — 404 가 아니다", async () => {
    const response = await middleware(요청("/demo"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(안내로("/demo"));
  });

  /** 미들웨어는 지나가고, 페이지가 없으니 Next 가 404 를 낸다(배포 뒤 브라우저로 확인 — Task 5). */
  it("회원은 미들웨어를 그대로 지난다", async () => {
    currentUser = { id: "user-1" };
    const response = await middleware(요청("/demo", { [AUTH_COOKIE]: "token" }));

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
```

- [ ] **Step 2: 실패하는 시험을 쓴다 — 삭제 범위와 그림 보존**

`apps/web/app/__tests__/demo-removed.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `/demo` 삭제 (2026-09-30 사용자 D8, 설계 §3.5 · §8 C-2).
 *
 * 페이지·공개 목록·링크만 지운다. **그림은 지우지 않는다** — 첫 화면 슬라이드와
 * 카드뉴스 가짜 흐름이 `public/demo-sections/**`·`public/samples/**` 를 쓴다.
 */
const WEB = process.cwd();
const read = (relative: string) => readFileSync(path.join(WEB, relative), "utf8");

/** `app/` 아래 화면 소스. 시험 폴더는 뺀다 — 「없어야 한다」는 글자를 담고 있다. */
function 화면소스(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "__tests__" ? [] : 화면소스(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("/demo 삭제 (D8)", () => {
  it("페이지가 없다", () => {
    expect(existsSync(path.join(WEB, "app/demo"))).toBe(false);
  });

  it("공개 목록에 없다", () => {
    const list = read("middleware.ts").match(/const PUBLIC_PATHS = \[([\s\S]*?)\];/)?.[1];

    expect(list, "PUBLIC_PATHS 를 못 찾았다").toBeTruthy();
    expect(list).not.toContain('"/demo"');
  });

  it("어느 화면도 /demo 로 보내지 않는다", () => {
    const files = 화면소스(path.join(WEB, "app"));
    expect(files.length, "화면 소스를 하나도 못 읽었다").toBeGreaterThan(0);

    for (const file of files) {
      // `/demo-sections/…` 는 그림 경로라 걸리지 않는다 — `/demo` 바로 뒤가 따옴표·`/`·`?`·`#` 일 때만 잡는다.
      expect(readFileSync(file, "utf8"), path.relative(WEB, file)).not.toMatch(/["'`]\/demo(?=["'`/?#])/);
    }
  });

  it("첫 화면·가짜 흐름이 쓰는 그림은 남아 있다", () => {
    for (const image of [
      "public/demo-sections/01-hero.jpg",
      "public/demo-sections/08-faq.jpg",
      "public/demo-sections/mood-a.jpg",
      "public/samples/1.jpg",
      "public/samples/4.jpg",
    ]) {
      expect(existsSync(path.join(WEB, image)), image).toBe(true);
    }
    expect(read("app/_landing/hero/slides.ts")).toContain("/demo-sections/");
    expect(read("app/api/sns/local-fake-flow.ts")).toContain("/demo-sections/");
  });
});
```

- [ ] **Step 3: 시험이 실패하는지 본다**

Run: `cd apps/web && npx vitest run __tests__/middleware-nonmember.test.ts app/__tests__/demo-removed.test.ts`
Expected: FAIL — 「비회원은 첫 화면 + 회원가입 안내 — 404 가 아니다」(지금은 `/demo` 가 공개라 200), 「페이지가 없다」, 「공개 목록에 없다」, 「어느 화면도 /demo 로 보내지 않는다」(`app/_components/public-shell.tsx`). 「회원은 미들웨어를 그대로 지난다」·「그림은 남아 있다」는 이미 통과(지금 동작을 못 박는 줄이다).

- [ ] **Step 4: 페이지를 지운다**

```bash
git rm -r apps/web/app/demo
```

이 워크트리의 Next 타입 캐시에 옛 페이지 항목이 남아 있으면 `tsc` 가 없는 파일을 찾다 실패한다(`tsconfig.json` 이 `.next/types/**/*.ts` 를 읽는다). **이 워크트리에서 dev 서버가 떠 있지 않은지 먼저 확인하고**(떠 있으면 멈추고 사용자에게 묻는다 — `.next` 를 공유한다) 그 한 폴더만 지운다. 커밋되지 않는 생성물이다:

```bash
rm -rf apps/web/.next/types/app/demo
```

- [ ] **Step 5: 공개 목록에서 뺀다**

`apps/web/middleware.ts` 36-38줄의 지금 코드:

```ts
  "/guide",
  "/demo",
  "/login",
```

를 이렇게 바꾼다:

```ts
  "/guide",
  "/login",
```

- [ ] **Step 6: 링크 둘을 뺀다**

`apps/web/app/_components/public-shell.tsx` 70-74줄의 지금 코드(대기 화면 `/access` 가 `showGuestActions={false}` 로 쓰는 자리):

```tsx
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href="/demo">데모 보기</Link>
          </Button>
        )}
```

를 이렇게 바꾼다:

```tsx
        ) : null}
```

86번째 줄을 지운다:

```tsx
          <Link href="/demo" className="hover:text-foreground">결과물 데모</Link>
```

(`Button`·`Link` 는 다른 자리에서 계속 쓰므로 import 는 그대로다.)

- [ ] **Step 7: 기존 시험·문서에서 `/demo` 를 뺀다**

`apps/web/lib/__tests__/dev-auth.test.ts` 14번째 줄:

```ts
    for (const path of ["/", "/create", "/sns", "/poster", "/library"]) {
```

`docs/MEMBERSHIP_DEPLOYMENT.md` 147번째 줄:

```markdown
1. 비회원 `/`, `/about`, `/guide`, `/login`, `/signup` 접근 · 그 밖 화면(`/create`, 지운 `/demo` 포함)은 첫 화면 + 「회원가입이 필요합니다」
```

(`app/_landing/__tests__/header-and-about.test.ts:214` 의 `expect(cta).not.toContain('href="/demo"')` 는 **남긴다** — 지운 뒤에도 참이고, 되살아나는 것을 막는 줄이다.)

- [ ] **Step 8: 시험이 통과하는지 본다**

Run: `cd apps/web && npx vitest run __tests__/middleware-nonmember.test.ts app/__tests__/demo-removed.test.ts lib/__tests__/dev-auth.test.ts app/_components/__tests__/public-shell-logo.test.ts app/_landing/__tests__/header-and-about.test.ts app/guide/__tests__/guide-content.test.ts app/access/__tests__/access-exit.test.ts`
Expected: PASS(전부).

Run: `cd apps/web && npx tsc --noEmit`
Expected: 오류 0.

Run(남은 참조가 없는지 — 그림 경로·빌드 캐시는 뺀다):

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=.next --exclude=*.tsbuildinfo -e '"/demo"' -e "href=\"/demo" apps/web | grep -v __tests__
```
Expected: 출력 없음.

- [ ] **Step 9: 커밋**

`apps/web/app/demo` 삭제는 Step 4 의 `git rm` 이 이미 올려 두었다(여기 경로로 다시 적으면 「pathspec did not match」로 멈춘다).

```bash
git add apps/web/middleware.ts apps/web/app/_components/public-shell.tsx apps/web/lib/__tests__/dev-auth.test.ts apps/web/__tests__/middleware-nonmember.test.ts apps/web/app/__tests__/demo-removed.test.ts docs/MEMBERSHIP_DEPLOYMENT.md
git commit -F - <<'EOF'
feat(landing): 데모 페이지 /demo 를 지운다

페이지·공개 목록·머리·꼬리 링크·시험 목록에서 뺀다(D8). 첫 화면 슬라이드와 카드뉴스 가짜 흐름이 쓰는
public/demo-sections·public/samples 그림은 남긴다(설계 §8 C-2). 비회원은 첫 화면 + 회원가입 안내, 회원은 404.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: 전체 검증과 독립 리뷰

**Files:** 없음(코드 변경 없음. 리뷰가 고칠 것을 찾으면 그 Task 로 돌아가 시험부터 고친다).

- [ ] **Step 1: 설계 §3.5·§5 를 다시 연다**(사용자 규칙 `design-recheck`) — 아래 「자체 점검」 표의 각 줄을 실제 diff 와 맞댄다.

```bash
git diff master...HEAD --stat
```
Expected: 「파일 지도」의 파일만 나온다. 그 밖의 파일이 있으면 까닭을 찾는다.

- [ ] **Step 2: 타입·전체 시험·린트**

```bash
cd apps/web && npx tsc --noEmit && cd ../..
cd apps/web && npx vitest run && cd ../..
pnpm lint
```
Expected: 타입 오류 0 · 전체 시험 실패 0(통과 수를 적어 둔다) · 린트 오류 0.

- [ ] **Step 3: 독립 리뷰**

새 맥락의 리뷰어(`code-reviewer` 또는 `superpowers:requesting-code-review`)에게 설계 §3.5 와 이 계획, `git diff master...HEAD` 를 준다. 특히 볼 것: 「Review Focus」 다섯 줄, `if (!user)` 앞뒤 순서, 모달이 로그인한 사람에게 뜨지 않는지, 그림 파일이 diff 에 없는지. CRITICAL·HIGH 는 고친 뒤 이 Task 를 다시 돈다.

---

### Task 5: 운영 반영 — 앱만 (**사용자 승인 필요**)

이 Task 는 master 머지와 운영 서버를 만진다. **실행자(에이전트)는 명령을 준비해 사용자에게 보이고, 사용자가 머지·배포를 승인한 뒤에만 한다.** 하나라도 어긋나면 멈추고 사용자에게 묻는다. 마이그레이션은 없다.

**Files:** 없음.

- [ ] **Step 1: 무엇이 함께 나가는지 본다**(메모리 「배포 전 다른 터미널 확인」)

```bash
git fetch -q origin
git log --oneline 42cc5854..origin/master                      # 이 가지가 갈라진 뒤 master 에 들어온 것
git diff --name-only 42cc5854..origin/master -- supabase/migrations/
ssh -i <키> ubuntu@<호스트> "sudo readlink -f /opt/fixup-image-agent/current"   # 지금 돌고 있는 릴리스 <시각>-<sha8>
git log --oneline <돌고있는sha8>..origin/master                 # 배포하면 함께 나가는 것 전부
```
Expected: 이 가지 밖의 머지·마이그레이션이 없다. **있으면 멈추고 사용자에게 목록을 보인다** — 배포는 master 전체를 싣는다. 특히 C1·C2 앱 변경이 아직 운영에 없다면 이번에 함께 나간다(설계 §6 상 앱 먼저 나가도 안전하지만, 사용자가 알고 정한다).

- [ ] **Step 2: PR 을 만들고 사용자 승인을 받아 머지한다**

```bash
git push -u origin feat/nonmember-modal
gh pr create --base master --title "feat: 비회원 회원가입 안내 모달과 /demo 삭제 (AI 사용 통제 C5)" --body-file <본문 파일>
```
본문에는 요약·시험 결과(Task 4 의 통과 수)·아래 확인 목록을 적고, 끝에 `🤖 Generated with [Claude Code](https://claude.com/claude-code)` 를 붙인다. **머지는 사용자가 승인한 뒤에만 한다.**

- [ ] **Step 3: 배포한다 — `docs/DEPLOY.md` 「매 배포」 그대로**

문서를 **열어서** 따른다(기억으로 하지 않는다 — `CLAUDE.md`). 이번 배포에 딸린 마이그레이션은 없다. 요약:

```bash
gh run list --workflow "Build EC2 release" --limit 1
gh release view release-<sha12> --json assets
gh release download release-<sha12> -D <작업폴더> -p '*.tar.gz'
scp -i <키> <작업폴더>/fixup-image-agent-*.tar.gz ubuntu@<호스트>:/tmp/
ssh -i <키> ubuntu@<호스트>
mkdir -p /tmp/ops-<sha8> && tar -xzf /tmp/fixup-image-agent-ops-<sha12>.tar.gz -C /tmp/ops-<sha8>
sudo bash /tmp/ops-<sha8>/deploy/ec2/deploy-release.sh /tmp/fixup-image-agent-<sha12>.tar.gz "$(date -u +%Y%m%dT%H%M%SZ)-<sha8>"
```
Windows·EC2 에서 빌드하지 않는다. 아티팩트 업로드 실패는 배포 실패가 아니다.

- [ ] **Step 4: 배포 뒤 확인(서버 안에서) — 여기까지 해야 배포가 끝난 것이다**

```bash
systemctl is-active fixup-image-agent                                   # active (워커는 운영에서 masked — 설계 §2)
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/         # 200
sudo readlink -f /opt/fixup-image-agent/current                         # 새 릴리스 id
sudo grep -rq "회원가입이 필요합니다" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨

# 비회원이 회원 화면을 연다 → 첫 화면 + 안내 (쿠키 없이 부르므로 비회원이다)
curl -sI http://127.0.0.1:3000/create | grep -iE '^(HTTP|location)'
#   HTTP/1.1 307 …
#   location: http://127.0.0.1:3000/?signup=required&next=%2Fcreate

# 지운 /demo → 비회원은 404 가 아니라 첫 화면 + 안내
curl -sI http://127.0.0.1:3000/demo | grep -iE '^(HTTP|location)'
#   HTTP/1.1 307 …
#   location: http://127.0.0.1:3000/?signup=required&next=%2Fdemo

# 공개 화면은 그대로 200
for p in / /about /guide /guide/account /login /signup /forgot-password /reset-password; do
  curl -s -o /dev/null -w "$p %{http_code}\n" "http://127.0.0.1:3000$p"
done

# 안내가 붙은 첫 화면도 200
curl -s -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:3000/?signup=required&next=%2Fcreate"   # 200

# API 는 지금처럼 401
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/library                        # 401
```

밖에서도 한 번(앞단이 공개 주소를 알려 주는지 — `publicOrigin`):

```bash
curl -sI <공개주소>/create | grep -iE '^(HTTP|location)'
#   location: <공개주소>/?signup=required&next=%2Fcreate   ← 127.0.0.1·localhost 가 나오면 멈춘다
```

- [ ] **Step 5: 브라우저로 확인(사람 눈 또는 Playwright 를 한 번에 한 도구씩)**

1. 시크릿 창에서 `<공개주소>/create` → 첫 화면 위에 「회원가입이 필요합니다」, 단추 [회원가입] [로그인] [닫기]. 390px 폭과 넓은 화면 둘 다.
2. [닫기] → 주소가 `/` 로 바뀐다. 새로고침해도 다시 안 뜬다.
3. 다시 `<공개주소>/create` → [로그인] → 주소가 `/login?next=%2Fcreate` → 로그인 → `/create` 가 열린다.
4. 로그인한 채로 `<공개주소>/?signup=required&next=%2Fcreate` → 모달이 **안 뜬다**.
5. 로그인한 채로 `<공개주소>/demo` → 404 화면.
6. 시크릿 창에서 첫 화면 슬라이드 그림(`/demo-sections/…`)이 모두 뜬다.

하나라도 어긋나면 사용자에게 보이고, 되돌릴지 묻는다.

- [ ] **Step 6: 되돌리기(문제가 생겼을 때만, 사용자 승인 뒤)**

```bash
ls /opt/fixup-image-agent/releases
sudo bash /tmp/ops-<sha8>/deploy/ec2/rollback-release.sh <이전 release-id>
```
DB 를 바꾸지 않았으므로 앱만 되돌리면 끝이다.

---

## 자체 점검(설계 대조)

| 설계 요구 | Task |
|---|---|
| §3.5 공개 화면 아홉(`/`·`/about` 사용자 확인 포함) | 1(열린 화면 시험), 3(`/demo` 빼기) |
| §3.5 공개 목록 밖 → `/?signup=required&next=…` | 1 |
| §3.5 모달 「회원가입이 필요합니다」 + [회원가입] [로그인] [닫기], `@fixup/ui` Dialog | 2 |
| §3.5 로그인 뒤 `next` 로(`safeNext`) | 2(`loginHrefFor`), 로그인 화면은 그대로 |
| §3.5 만료는 그대로 `/login?expired=1` | 1(시험으로 못 박음) |
| §3.5 `/demo` 삭제 — 페이지·공개 목록·링크·시험, 그림은 남김 | 3 |
| §3.5 `/demo` 뒤: 비회원 모달, 회원 404 | 3(미들웨어 시험), 5(브라우저 404) |
| §3.5 API 는 401 그대로 | 1(미들웨어가 화면으로 안 보냄), 5(`curl` 401) |
| §3.5 `safeNext` 의 `/\` 는 범위 밖 | 고치지 않음(Global Constraints) |
| §5 「비회원」 줄 넷 | 1·3 |
| §6 C5 = 앱만 | 5 |
| §8 C-2 그림 삭제 금지, Minor(`/demo` 기대값·만료 유지·`/`·`/about`) | 3·1 |
