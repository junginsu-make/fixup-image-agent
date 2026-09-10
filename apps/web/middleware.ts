import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { localBypassRedirect } from "./lib/dev-auth";
import { HOME_AFTER_LOGIN, publicOrigin } from "./lib/routes";
import { canAccessPage } from "./lib/access/core";
import { PAGE_ACCESS, isDisabledRoute } from "./lib/access/routes";
import type { UserRole } from "./lib/membership/types";

const PUBLIC_PATHS = [
  "/",
  "/demo",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/confirm",
  "/auth/signout",
];

function matches(pathname: string, roots: string[]) {
  return roots.some((root) => pathname === root || pathname.startsWith(`${root}/`));
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

  const supabase = createServerClient(url, publishableKey, {
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

  const { data: { user } } = await supabase.auth.getUser();
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

  const isAuthPage = matches(pathname, ["/login", "/signup", "/forgot-password"]);
  if (!user) {
    if (matches(pathname, PUBLIC_PATHS)) return response;
    const loginUrl = new URL("/login", base);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role,status,email_confirmed_at")
    .eq("id", user.id)
    .single();

  const active = Boolean(profile?.email_confirmed_at && profile?.status === "active");
  if (isAuthPage) {
    return NextResponse.redirect(new URL(active ? HOME_AFTER_LOGIN : "/access", base));
  }
  if (pathname === "/access") return response;
  if (matches(pathname, PUBLIC_PATHS)) return response;
  if (!active) return NextResponse.redirect(new URL("/access", base));
  // 어느 화면을 누가 여는지는 등록부(`lib/access/routes.ts`)가 정한다.
  // 여기서 경로를 직접 적으면 사이드바·페이지 문지기와 어긋난다 — 그러면
  // 메뉴에는 없는데 주소를 치면 열리는 화면이 생긴다.
  const viewer = { userId: user.id, role: (profile?.role ?? "member") as UserRole };
  if (!canAccessPage(pathname, viewer, PAGE_ACCESS)) {
    return NextResponse.redirect(new URL(HOME_AFTER_LOGIN, base));
  }
  return response;
}

export const config = {
  // site.webmanifest 는 로그인 전에도 읽혀야 한다. 로그인으로 돌려보내면
  // 브라우저가 앱 이름·아이콘을 못 읽는다.
  // mp4 도 같은 이유다 — 랜딩의 모션 소재가 로그인으로 돌려보내져 재생되지 않았다.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|site.webmanifest|samples/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4)$).*)",
  ],
};
