import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { localBypassRedirect } from "./lib/dev-auth";
import { HOME_AFTER_LOGIN, publicOrigin } from "./lib/routes";

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
  if (pathname.startsWith("/admin") && profile?.role !== "admin") {
    return NextResponse.redirect(new URL(HOME_AFTER_LOGIN, base));
  }
  return response;
}

export const config = {
  // site.webmanifest 는 로그인 전에도 읽혀야 한다. 로그인으로 돌려보내면
  // 브라우저가 앱 이름·아이콘을 못 읽는다.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|site.webmanifest|samples/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
