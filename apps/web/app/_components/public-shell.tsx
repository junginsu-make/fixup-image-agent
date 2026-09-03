import type { ReactNode } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { BrandMark, Button } from "@fixup/ui";

// 이메일 인증을 마치면 바로 쓸 수 있다(202607290001 마이그레이션).
// 관리자 승인 단계를 남겨 두면 다 끝난 사람이 더 기다려야 하는 줄 안다.
const onboardingSteps = ["가입 신청", "이메일 인증", "스튜디오 이용"] as const;

export function PublicLogo() {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3" aria-label="MCS 홈">
      <BrandMark className="h-9 w-9 shrink-0" />
      <span className="flex min-w-0 flex-col gap-1 leading-none">
        <strong className="truncate text-base font-bold tracking-[-0.02em]">MCS</strong>
        <em className="hidden text-[9px] not-italic tracking-[0.2em] text-muted-foreground sm:block">
          MARKETING CONTENT STUDIO
        </em>
      </span>
    </Link>
  );
}

export function PublicHeader({
  showGuestActions = true,
  localMode = false,
}: {
  showGuestActions?: boolean;
  /**
   * 로컬 확인 모드(LOCAL_AUTH_BYPASS=1)에서는 Supabase 공개 환경변수를 비워 두므로
   * 로그인 자체가 불가능하다. 그런데 들어갈 문은 있어야 한다 — 미들웨어는 이미
   * 다 통과시키고 있으니 바로 스튜디오로 보낸다.
   */
  localMode?: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <PublicLogo />
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="주요 메뉴">
          <Link href="/#features" className="transition-colors hover:text-foreground">기능</Link>
          <Link href="/#how-it-works" className="transition-colors hover:text-foreground">이용 방법</Link>
          <Link href="/demo" className="transition-colors hover:text-foreground">결과물 데모</Link>
        </nav>
        {localMode ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden text-meta text-subtle-foreground sm:block">로컬 확인 모드</span>
            <Button size="sm" asChild>
              <Link href="/create">스튜디오 열기</Link>
            </Button>
          </div>
        ) : showGuestActions ? (
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">로그인</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/signup">가입 신청</Link>
            </Button>
          </div>
        ) : (
          <Button variant="outline" size="sm" asChild>
            <Link href="/demo">데모 보기</Link>
          </Button>
        )}
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t bg-card">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <PublicLogo />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link href="/demo" className="hover:text-foreground">결과물 데모</Link>
          <Link href="/login" className="hover:text-foreground">로그인</Link>
          <Link href="/signup" className="hover:text-foreground">가입 신청</Link>
        </div>
      </div>
    </footer>
  );
}

export function OnboardingSteps({
  current,
  className = "",
}: {
  current: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <ol className={`grid grid-cols-3 gap-1 ${className}`} aria-label="회원 이용 절차">
      {onboardingSteps.map((label, index) => {
        const step = index + 1;
        const complete = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            className="relative flex min-w-0 flex-col items-center gap-2 text-center"
            aria-current={active ? "step" : undefined}
          >
            {index > 0 ? (
              <span
                className={`absolute right-1/2 top-4 -z-0 h-px w-full ${step <= current ? "bg-primary" : "bg-border"}`}
                aria-hidden="true"
              />
            ) : null}
            <span
              className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border text-xs font-extrabold ${
                complete || active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground"
              }`}
            >
              {complete ? <Check className="h-4 w-4" aria-hidden="true" /> : step}
            </span>
            <span className={`text-[11px] leading-tight sm:text-xs ${active ? "font-bold text-foreground" : "text-muted-foreground"}`}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function PublicPage({ children, localMode = false }: { children: ReactNode; localMode?: boolean }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader localMode={localMode} />
      {children}
      <PublicFooter />
    </div>
  );
}
