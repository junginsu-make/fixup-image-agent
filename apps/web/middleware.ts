import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { localBypassRedirect } from "./lib/dev-auth";
import { HOME_AFTER_LOGIN, publicOrigin, signupRequiredPath } from "./lib/routes";
import { canAccessPage } from "./lib/access/core";
import { canEnterOnboarding, isUsableAccount } from "./lib/membership/usable";
import { PAGE_ACCESS, isDisabledRoute } from "./lib/access/routes";
import type { UserRole } from "./lib/membership/types";
import {
  SESSION_START_COOKIE,
  SESSION_START_COOKIE_MAX_AGE_S,
  sessionAuthCookieNames,
  sessionStartValue,
  sessionWindow,
} from "./lib/auth/session-window";
import { verifiedLogin } from "./lib/auth/verified-login";
import { authRoundTrips } from "./lib/auth/auth-round-trips";
import { ONBOARDING_COLUMNS, ONBOARDING_PATH } from "./lib/membership/onboarding";

const PUBLIC_PATHS = [
  "/",
  // 브랜드 소개. **첫 화면 메뉴에서 바로 가는 자리**라 로그인 앞에 둔다 —
  // 안 넣으면 「MCS란」을 누른 사람이 로그인 화면을 만난다.
  "/about",
  /*
    사용 설명서 (2026-09-21 사용자).

    이 문서의 일은 **이 시스템이 무엇을 하는지 말해 주는 것**이다. 그것을 보려고
    로그인부터 하라는 것은 순서가 거꾸로다 — 무엇인지 모르는 채로 가입하라는
    말이 된다.

    아래 항목들과 달리 **딸린 화면이 여럿이다.** `matches` 가 `/guide/…` 까지
    함께 열어 준다.

    화면은 손님에게 셸 대신 공개 머리·꼬리를 두른다(`app/guide/layout.tsx`) —
    사이드바를 보여 주면 눌러 봐야 전부 첫 화면 회원가입 안내로 간다.
  */
  "/guide",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/confirm",
  "/auth/signout",
  "/auth/callback",
];

function matches(pathname: string, roots: string[]) {
  return roots.some((root) => pathname === root || (root !== "/auth/callback" && pathname.startsWith(`${root}/`)));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  // standalone 으로 띄우면 request.url 의 출처가 내부 주소(localhost:3000)다.
  // 그걸 기준으로 돌려보내면 사용자를 자기 컴퓨터로 보낸다. 앞단이 알려 주는
  // 공개 주소를 기준으로 삼는다.
  const base = publicOrigin(request.headers, request.nextUrl.origin);
  // 로컬 확인용 우회. NODE_ENV!=production 이고 LOCAL_AUTH_BYPASS=1 일 때만 열린다.
  if (process.env.NODE_ENV !== "production" && process.env.LOCAL_AUTH_BYPASS === "1") {
    const entry = localBypassRedirect(request.nextUrl.pathname);
    return entry ? NextResponse.redirect(new URL(entry, base)) : response;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const pathname = request.nextUrl.pathname;

  // EC2/Caddy와 배포 스크립트가 인증 설정과 무관하게 프로세스 상태를 확인한다.
  // readiness 상세 판단은 각 health route가 직접 수행한다.
  if (pathname === "/api/health" || pathname === "/api/health/ready") return response;

  if (!url || !publishableKey) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { ok: false, code: "service_not_configured", message: "회원 시스템 환경변수가 아직 설정되지 않았습니다." },
        { status: 503 },
      );
    }
    if (matches(pathname, PUBLIC_PATHS)) return response;
    return NextResponse.redirect(new URL("/login?error=service_not_configured", base));
  }

  // The callback exchanges a fresh login. Expiring an old session here would
  // delete its PKCE verifier before the exchange; the handler validates the new session.
  if (pathname === "/auth/callback") return response;

  const supabase = createServerClient(url, publishableKey, {
    // getClaims 가 조용히 getUser 왕복으로 돌아가면 센다(설계 2026-09-29 §3.2).
    global: { fetch: authRoundTrips.fetch },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  /*
    **토큰 서명을 이 서버가 확인한다**(설계 2026-09-29 §3.2). 전에는 `getUser()` 로
    요청마다 Supabase 까지 0.2초를 왕복했다. 정지·탈퇴·관리자 판정은 아래에서
    지금처럼 `profiles` 를 읽는다 — 토큰은 「누구인가」만 말한다.

    만료가 가까우면 `getClaims` 가 먼저 갱신하고 `setAll` 로 쿠키를 다시 쓴다.
    그래서 이 줄과 클라이언트 만들기 사이에 다른 일을 끼우지 않는다.
  */
  const user = await verifiedLogin(supabase.auth);

  /*
    로그인 유지는 **하루**다 (2026-09-23 사용자). 로그인한 시각을 쿠키에 적어
    두고, 24시간이 지나면 로그인 쿠키를 지워 내보낸다. 시작 시각은 쓰는 동안에도
    늘리지 않는다 — 늘리면 제한이 사실상 없어진다.

    API 로 먼저 빠지기 전에 본다. 화면만 막고 API 를 열어 두면 반쪽이다.
  */
  if (user) {
    // 이번 로그인의 번호. 시작 시각을 이 로그인에 묶어 잰다 — 까닭은 `sessionStartValue`.
    // 서명을 확인한 토큰에서 읽는다.
    const sessionId = user.sessionId;
    const window = sessionWindow(request.cookies.get(SESSION_START_COOKIE)?.value, new Date(), sessionId);
    if (window.state === "expired") {
      /*
        **서버 쪽 로그인도 끊는다**(2026-09-29 독립 리뷰, 2026-10-01 주석 정정).
        `signOut({ scope: "local" })` 은 이 기기의 **갱신**만 막는다. 만료 전에
        이미 복사해 둔 access token 은 그 자체 만료 시각(exp, 최대 1시간)까지는
        여전히 통과한다 — getClaims 가 서버 왕복 없이 서명만 보기 때문이다
        (설계 §3.2 의 맞바꿈). 이 기기의 로그인만 끊는다. 다른 기기는 제
        24시간을 따로 잰다. 끊기에 실패해도 아래에서 쿠키는 지운다.
      */
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // 쿠키를 지우는 것으로 이 브라우저는 내보낸다.
      }

      const secure = request.nextUrl.protocol === "https:";
      /*
        **공개 화면은 같은 주소로 다시 연다**(2026-09-29 독립 리뷰). 로그인 쿠키를
        지운 채 보내면 다음 요청은 손님이라 그 화면이 그대로 열린다. 메일 인증
        링크(`/auth/confirm?token_hash=…`)도 값을 잃지 않는다. 로그인 화면만은
        「시간이 지났다」는 안내를 달아 연다.

        되돌아와도 다시 만료되지 않는다 — 시작 시각 쿠키를 함께 지우므로 다음
        요청은 「새로 시작」이다.
      */
      const stayHere = matches(pathname, PUBLIC_PATHS) && pathname !== "/login";
      const expired = pathname.startsWith("/api/")
        ? NextResponse.json(
            { ok: false, code: "session_expired", message: "로그인 유지 시간(24시간)이 지났습니다. 다시 로그인해 주세요." },
            { status: 401 },
          )
        : NextResponse.redirect(new URL(stayHere ? `${pathname}${request.nextUrl.search}` : "/login?expired=1", base));
      for (const name of sessionAuthCookieNames(request.cookies.getAll().map((cookie) => cookie.name))) {
        expired.cookies.set(name, "", { path: "/", maxAge: 0, secure, sameSite: "lax" });
      }
      return expired;
    }
    if (window.state === "start") {
      // 평문 HTTP 로도 여는 서버라 `secure` 를 항상 붙이면 쿠키가 통째로 버려진다.
      response.cookies.set(SESSION_START_COOKIE, sessionStartValue(window.startedAt, sessionId), {
        path: "/", httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
        // 24시간이 아니라 로그인 쿠키만큼 산다 — 까닭은 `SESSION_START_COOKIE_MAX_AGE_S`.
        maxAge: SESSION_START_COOKIE_MAX_AGE_S,
      });
    }
  }

  if (pathname.startsWith("/api/")) return response;

  /**
   * 꺼 둔 화면은 **로그인 여부를 따지기 전에** 돌려보낸다.
   *
   * 아래 `if (!user)` 뒤에 두면 로그인 안 한 사람에게 `?next=/inbox` 가
   * 붙는다. 로그인하면 거기로 갔다가 페이지가 다시 돌려보내서 주소창이 한 번
   * 번쩍인다 — 열리지는 않지만 갈 데가 없는 곳으로 한 번 갔다 오는 셈이다.
   *
   * API 조기 반환(바로 위)보다는 뒤에 둔다. API 는 화면이 아니라 각 라우트가
   * 스스로 막는다(`api/sources/route.ts`).
   *
   * 페이지 쪽 문지기(`app/inbox/page.tsx`)도 그대로 둔다. 아래 `config.matcher`
   * 가 나중에 바뀌어도 살아남는 두 번째 문이다.
   */
  if (isDisabledRoute(pathname)) return NextResponse.redirect(new URL(HOME_AFTER_LOGIN, base));

  /*
    **`/login` 은 여기 없다** (2026-09-23 사용자). 이미 로그인한 사람을 홈으로
    돌려보내면, 다른 계정으로 들어가려는 사람이 입력 창을 아예 못 본다. 화면이
    「지금 ○○로 로그인되어 있습니다」를 보여 주고 고르게 한다.
  */
  const isAuthPage = matches(pathname, ["/signup", "/forgot-password"]);
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

  const { data: profile } = await supabase
    .from("profiles")
    .select(`role,status,email_confirmed_at,${ONBOARDING_COLUMNS}`)
    .eq("id", user.userId)
    .single();

  const active = isUsableAccount(profile);
  const onboarding = canEnterOnboarding(profile);
  const onboardingRedirect = (path: string) => {
    const target = NextResponse.redirect(new URL(path, base));
    // getClaims may have refreshed the session before deciding this destination.
    for (const cookie of response.cookies.getAll()) target.cookies.set(cookie);
    return target;
  };
  if (pathname === ONBOARDING_PATH) {
    if (!profile) return onboardingRedirect("/login?error=profile_unavailable");
    return onboarding ? response : onboardingRedirect(active ? HOME_AFTER_LOGIN : "/access");
  }
  if (onboarding && (isAuthPage || pathname === "/access" || !matches(pathname, PUBLIC_PATHS))) {
    return onboardingRedirect(ONBOARDING_PATH);
  }
  if (isAuthPage) {
    return NextResponse.redirect(new URL(active ? HOME_AFTER_LOGIN : "/access", base));
  }
  /*
    **여기가 막다른 길이었다.** `/access` 만 조건 없이 통과시켜서, 이메일 인증을
    막 마쳐 이미 쓸 수 있게 된 사람도 「잠시만 기다려 주세요」 앞에 그대로 섰다.
    다음 걸음이 저절로 오지 않으니 하염없이 기다리거나 스스로 새로고침해야 했다.

    쓸 수 있는 사람은 들여보낸다. 기다릴 일이 남은 사람에게만 그 화면을 보인다.
  */
  if (pathname === "/access") {
    return active ? NextResponse.redirect(new URL(HOME_AFTER_LOGIN, base)) : response;
  }
  if (matches(pathname, PUBLIC_PATHS)) return response;
  if (!active) return NextResponse.redirect(new URL("/access", base));
  // 어느 화면을 누가 여는지는 등록부(`lib/access/routes.ts`)가 정한다.
  // 여기서 경로를 직접 적으면 사이드바·페이지 문지기와 어긋난다 — 그러면
  // 메뉴에는 없는데 주소를 치면 열리는 화면이 생긴다.
  const viewer = { userId: user.userId, role: (profile?.role ?? "member") as UserRole };
  if (!canAccessPage(pathname, viewer, PAGE_ACCESS)) {
    return NextResponse.redirect(new URL(HOME_AFTER_LOGIN, base));
  }
  return response;
}

export const config = {
  // site.webmanifest 는 로그인 전에도 읽혀야 한다. 로그인으로 돌려보내면
  // 브라우저가 앱 이름·아이콘을 못 읽는다.
  // mp4 도 같은 이유다 — 랜딩의 모션 소재가 로그인으로 돌려보내져 재생되지 않았다.
  //
  // **글꼴도 같다.** woff2 를 안 빼 뒀더니 `/fonts/pretendard/*.woff2` 가
  // 로그인으로 307 돼서, 로그인 안 한 사람에게는 글꼴이 한 조각도 안 갔다.
  // 첫 화면은 로그인 앞에 있는 화면이라 그 사람이 곧 손님이다. 로컬에서는
  // `LOCAL_AUTH_BYPASS` 가 미들웨어를 건너뛰어 200 으로 보였고, 운영에 올린
  // 뒤에야 드러났다(2026-09-10).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|site.webmanifest|samples/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|woff2?|otf|ttf)$).*)",
  ],
};
