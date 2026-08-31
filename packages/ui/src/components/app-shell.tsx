"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, RefreshCw, Library, Settings, ShieldCheck, UserRound } from "lucide-react";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { cn } from "../lib/utils";

/**
 * 앱 셸 — 2026-07-21 개편.
 *
 * 이전에는 상단 가로 내비 하나뿐이라, /create 와 /redesign 이 각자 자기 헤더와
 * 사이드바를 본문 안에 또 만들었다(내비 3개, <main> 중첩). 좌측 고정 사이드바로
 * 바꿔 그 자리를 셸이 제공한다.
 *
 * 설계: docs/superpowers/specs/2026-07-21-ui-overhaul-design.md §2
 */

const navGroups = [
  {
    label: "도구",
    items: [
      { href: "/create", label: "새로 만들기", desc: "사진 또는 텍스트로", icon: Sparkles },
      { href: "/redesign", label: "리디자인", desc: "기존 페이지 개선", icon: RefreshCw },
    ],
  },
  {
    label: "보관",
    items: [{ href: "/library", label: "라이브러리", desc: "저장한 작업", icon: Library }],
  },
  {
    // 상세페이지를 만드는 주 흐름이 아니라, 필요할 때 쓰는 곁가지다.
    // 그래서 도구·보관 아래에 따로 둔다.
    label: "부가 기능",
    items: [
      { href: "/characters", label: "캐릭터 만들기", desc: "인물을 고정해 재사용", icon: UserRound },
    ],
  },
];

// '계정'과 '설정'이 같은 화면(/settings)을 가리켜 메뉴가 둘로 보였다. 하나로 둔다.
const bottomItems = [
  { href: "/settings", label: "계정", desc: "사용량·레퍼런스", icon: Settings },
];

// 관리자는 다른 메뉴와 같은 자리에 둔다. 우측 상단 버튼으로 있을 때는 회원
// 상태 표시에 섞여, 회원 관리·비용을 보러 갈 곳이 있다는 걸 알기 어려웠다.
const adminItem = {
  href: "/admin",
  label: "관리자",
  desc: "회원·비용 관리",
  icon: ShieldCheck,
};

/** 관리자에게만 보이는 항목이 있어, 메뉴 목록은 권한에 따라 달라진다. */
function bottomItemsFor(isAdmin: boolean) {
  return isAdmin ? [...bottomItems, adminItem] : bottomItems;
}

interface AppShellProps {
  children: React.ReactNode;
  /** 상단바 우측에 주입할 앱 전용 액션(예: 이용 안내 버튼). */
  actions?: React.ReactNode;
  /**
   * 관리자 메뉴 노출 여부. 화면을 감추는 것은 안내일 뿐이고, 실제 차단은
   * `/admin` 의 `requireAdmin()` 이 서버에서 한다.
   */
  isAdmin?: boolean;
}

function NavItem({
  href,
  label,
  desc,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  desc?: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors",
        active
          ? "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]"
          : "hover:bg-background"
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-[6px] border",
          active
            ? "border-transparent bg-primary text-primary-foreground"
            : "border-border bg-background text-subtle-foreground"
        )}
      >
        <Icon className="h-3 w-3" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{label}</span>
        {desc ? (
          <span className="block text-meta text-subtle-foreground">{desc}</span>
        ) : null}
      </span>
    </Link>
  );
}

export function AppShell({ children, actions, isAdmin = false }: AppShellProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const visibleBottomItems = bottomItemsFor(isAdmin);
  const allLinks = [...navGroups.flatMap((g) => g.items), ...visibleBottomItems];

  return (
    <div className="min-h-screen bg-background">
      {/* 좁은 화면 전용 상단바. 넓은 화면에서는 사이드바가 그 역할을 한다. */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="PDP STUDIO 홈">
            <BrandMark className="h-6 w-6 flex-none" />
            <span className="text-sm font-bold tracking-[-0.02em]">PDP STUDIO</span>
          </Link>
          <div className="flex items-center gap-2">
            {actions}
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="메뉴 열기">
                  <Menu className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {allLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link
                      href={link.href}
                      className={cn("w-full", isActive(link.href) && "font-bold")}
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[var(--shell-side)_minmax(0,1fr)] [--shell-side:clamp(236px,15vw,300px)]">
        <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r bg-card px-3.5 py-4 lg:flex">
          <Link href="/" className="flex items-center gap-3 px-1.5" aria-label="PDP STUDIO 홈">
            <BrandMark className="h-8 w-8 flex-none" />
            <span className="flex flex-col gap-1 leading-none">
              <strong className="text-[15px] font-bold tracking-[-0.02em]">PDP STUDIO</strong>
              <em className="text-[9px] not-italic tracking-[0.2em] text-subtle-foreground">
                SECTIONS BY AI
              </em>
            </span>
          </Link>

          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="mb-2 px-1.5 text-meta text-subtle-foreground">
                {group.label}
              </p>
              <div className="grid gap-0.5">
                {group.items.map((item) => (
                  <NavItem key={item.href} {...item} active={isActive(item.href)} />
                ))}
              </div>
            </div>
          ))}

          <div className="mt-auto grid gap-0.5">
            {visibleBottomItems.map((item) => (
              <NavItem key={item.href} {...item} active={isActive(item.href)} />
            ))}
          </div>
        </aside>

        <div className="min-w-0">
          {/* 계정 상태와 테마 전환은 화면 오른쪽 위에 둔다. 예전에는 사이드바
              맨 아래에 있어서, 내가 누구로 접속했는지 보려면 눈이 왼쪽 아래로
              내려가야 했다. 좁은 화면은 위 상단바가 같은 것을 이미 보여준다. */}
          <div className="hidden items-center justify-end gap-2 px-[clamp(16px,2.2vw,52px)] pt-4 lg:flex">
            {actions}
            <ThemeToggle />
          </div>

          {/* 페이지가 자기 <main> 을 또 열지 않도록 셸이 하나만 제공한다. */}
          <main className="min-w-0 px-[clamp(16px,2.2vw,52px)] pb-6 pt-4">{children}</main>
        </div>
      </div>
    </div>
  );
}
