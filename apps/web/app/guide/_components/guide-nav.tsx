"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@fixup/ui";
import { GUIDE_TOPICS } from "./topics";

/**
 * 설명서 안 목차.
 *
 * 넓은 화면에서는 왼쪽에 붙어 따라오고, 좁으면 본문 위로 접혀 가로로 미는
 * 칩 줄이 된다. 사이드바에 여덟 항목을 늘어놓으면 도구 목록보다 안내가
 * 길어지므로 여기서 나눈다.
 */
export function GuideNav() {
  const pathname = usePathname();
  // `/guide` 는 다른 항목의 접두사라 startsWith 로 보면 늘 켜진다. 정확히 비교한다.
  const isActive = (href: string) => pathname === href;

  return (
    // min-w-0 이 없으면 좁은 화면에서 목록이 부모를 밀어 페이지에 가로 스크롤이 생긴다.
    // overflow-x-auto 는 부모가 폭을 제한해 줘야 동작한다.
    <nav aria-label="설명서 목차" className="min-w-0 lg:sticky lg:top-6">
      <p className="hidden px-3 pb-2 text-meta text-subtle-foreground lg:block">설명서</p>

      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
        {GUIDE_TOPICS.map((topic) => (
          <li key={topic.href} className="shrink-0 lg:shrink">
            <Link
              href={topic.href}
              aria-current={isActive(topic.href) ? "page" : undefined}
              className={cn(
                "block whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:whitespace-normal",
                isActive(topic.href)
                  ? "bg-primary-soft font-bold text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {topic.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
