"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 관리자 화면의 세 탭(2026-09-22 사용자 요청).
 *
 * 전에는 `/admin` 한 장에 회원 목록과 시스템 설정이 섞여 있었고, 크레딧 관리
 * (`/admin/members`)와 비용 전략은 상단 버튼으로 따로 들어가는 화면이었다.
 * 한 회원을 보려면 두 화면을 오가야 했다.
 *
 * **주소로 가르는 탭이다.** 각 탭이 서버에서 제 것만 읽는다 — 회원 탭을 열 때
 * 비용 집계를, 비용 전략을 열 때 회원 목록을 읽지 않는다. 생김새는 `/team` 의
 * 탭과 같게 맞춘다(`TabsList`·`TabsTrigger` 모양).
 */
export const ADMIN_TABS = [
  { href: "/admin", label: "회원 관리" },
  { href: "/admin/system", label: "시스템 관리" },
  { href: "/admin/cost-lab", label: "비용 전략" },
] as const;

/** 지금 주소가 어느 탭인가. 긴 주소가 이긴다 — `/admin` 은 모든 관리자 주소의 앞부분이다. */
export function activeAdminTab(pathname: string): string {
  const hit = ADMIN_TABS.filter((tab) => tab.href !== "/admin" && (pathname === tab.href || pathname.startsWith(`${tab.href}/`)));
  return hit[0]?.href ?? "/admin";
}

export function AdminTabs() {
  const active = activeAdminTab(usePathname() ?? "/admin");
  return (
    <nav className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground" aria-label="관리자 화면 탭">
      {ADMIN_TABS.map((tab) => {
        const on = tab.href === active;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${
              on ? "bg-background text-foreground shadow" : "hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
