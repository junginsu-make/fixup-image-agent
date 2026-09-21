"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Sparkles, RefreshCw, Library, Settings, ShieldCheck, UserRound, Users, PanelsTopLeft, Frame, BookOpen, Megaphone, ChevronsLeft, ChevronsRight, Zap } from "lucide-react";
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
import {
  SIDEBAR_DEFAULT_COLLAPSED,
  SIDEBAR_STORE_KEY,
  collapsedFromStore,
  shellSideWidth,
  sidebarToggleLabel,
  storeFromCollapsed,
} from "./shell-sidebar";

/**
 * 앱 셸 — 2026-07-21 개편.
 *
 * 이전에는 상단 가로 내비 하나뿐이라, /create 와 /redesign 이 각자 자기 헤더와
 * 사이드바를 본문 안에 또 만들었다(내비 3개, <main> 중첩). 좌측 고정 사이드바로
 * 바꿔 그 자리를 셸이 제공한다.
 *
 * 설계: docs/superpowers/specs/2026-07-21-ui-overhaul-design.md §2
 */

interface NavLink {
  href: string;
  label: string;
  desc?: string;
  icon: React.ComponentType<{ className?: string }>;
  /**
   * 갈래 머리말 (2026-09-21 사용자).
   *
   * **목록을 평평하게 둔다.** 갈래를 중첩된 자료로 만들면 `navGroupsFor` 도
   * 모바일 메뉴도 시험도 전부 두 겹을 알아야 한다. 앞 항목과 이름이 다를 때
   * 머리말을 내면 화면만 두 겹으로 보인다.
   */
  section?: string;
}

interface NavGroup {
  label: string;
  /** 다른 메뉴와 다르게 보여야 하는 그룹. 지금은 설명서 하나뿐이다. */
  highlight?: boolean;
  items: NavLink[];
}

/**
 * 갈래 이름. **한 곳에서 정한다** — 항목마다 손으로 적으면 한 글자 달라진
 * 순간 머리말이 둘로 쪼개진다.
 */
const IMAGE = "이미지";
const PAGE = "상세페이지";

const navGroups: NavGroup[] = [
  {
    // 맨 위에 둔다. 처음 온 사람이 도구부터 열면 무엇을 하는 도구인지 모르는
    // 채로 시작한다. 도구 목록보다 먼저 눈에 걸려야 한다.
    label: "설명서",
    highlight: true,
    items: [{ href: "/guide", label: "사용 설명서", desc: "도구마다 무엇을 하는지", icon: BookOpen }],
  },
  {
    /*
      **도구를 만드는 것으로 묶는다** (2026-09-21 사용자).

      전에는 여섯이 한 줄로 늘어서 있었고, 이름이 전부 「○○ 만들기」로 끝나
      **무엇이 무엇과 같은 일인지** 알 수 없었다. 「이미지 만들기」와 「Easy
      모드」가 같은 것을 만든다는 사실이 이름에 없었다.

      갈래로 묶으면 이름이 짧아진다 — 「상세페이지 > 만들기」는 「상세페이지
      만들기」와 같은 말이고, 머리말이 그 절반을 대신 말한다.
    */
    label: "도구",
    items: [
      /*
        **맨 위에 둔다.** 처음 온 사람을 위한 것이라(설계 §2) 도구 목록 아래에
        묻히면 뜻이 없다. 나머지 도구는 다섯 단계에 칸이 열한 개인데, 무엇을
        적어야 할지 모르는 사람에게는 그것이 벽이다.

        **이 셸 안에 산다.** 한때는 아니었다 — 「사이드바에 도구가 여섯 개
        걸려 있으면 「쉬운 모드」가 아니다」라고 보고 `app/easy` 가 제 레이아웃을
        썼다(2026-09-17). 써 보고 사용자가 뒤집었다: 다른 도구는 사이드바·상단바가
        고정인데 **Easy 만 화면이 통째로 바뀌어** 어디 와 있는지 알 수 없었다
        (2026-09-21). 지금은 `fill` 만 켜고 나머지는 다른 도구와 똑같다.
      */
      { href: "/easy", label: "쉽게", desc: "말로 만들기", icon: Zap, section: IMAGE },
      { href: "/poster", label: "다양하게", desc: "광고 소재·포스터·일반 이미지", icon: Frame, section: IMAGE },
      /*
        **카드뉴스가 여기 있는 것은 우리 판단이다.** 2026-09-21 에 받은 차례에는
        네 개(쉽게·다양하게·캐릭터·광고소재)뿐이고 카드뉴스가 없었다. 빼면
        **메뉴에서 갈 길이 사라지므로** 같은 갈래에 둔다 — 여러 장이어도 나오는
        것은 이미지다. 자리를 옮기라고 하면 한 줄이다.

        「카드 뼈대」는 여기 없다. 카드뉴스를 만드는 두 가지 길 중 하나라 도구
        목록에 나란히 두면 별개의 도구로 보인다. 카드뉴스 첫 화면 오른쪽 위에
        「내 카드뉴스 만들기」로 둔다.
      */
      { href: "/sns", label: "카드뉴스", desc: "여러 장으로 이야기하기", icon: PanelsTopLeft, section: IMAGE },
      { href: "/characters", label: "캐릭터", desc: "인물을 고정해 재사용", icon: UserRound, section: IMAGE },
      { href: "/create", label: "만들기", desc: "사진 또는 텍스트로", icon: Sparkles, section: PAGE },
      { href: "/redesign", label: "리디자인", desc: "기존 페이지 개선", icon: RefreshCw, section: PAGE },
    ],
  },
  // 「수집」 묶음(수집함 · 수집 리스트)은 2026-09-10 에 뺐다. 운영자 판단으로
  // 자동 수집을 당분간 안 쓴다. 화면과 표는 그대로 두고 **입구만 닫았다** —
  // 켜는 곳은 `apps/web/lib/access/routes.ts` 의 `disabled` 두 줄이고,
  // 여기 묶음도 그때 같이 되살린다.
  {
    label: "보관",
    items: [{ href: "/library", label: "라이브러리", desc: "작업물 · 캐릭터 · 참고 이미지", icon: Library }],
  },
];

// '계정'과 '설정'이 같은 화면(/settings)을 가리켜 메뉴가 둘로 보였다. 하나로 둔다.
//
// **`NavLink` 로 못 박는다.** 안 박으면 갈래 없는 모양으로 좁게 잡히고,
// 위아래를 합친 `allLinks` 가 `section` 을 모르는 갈래를 품는다 — CI 의
// 타입 검사가 그것을 잡았다(2026-09-21).
const bottomItems: NavLink[] = [
  { href: "/settings", label: "계정", desc: "사용량·레퍼런스", icon: Settings },
];

// 팀은 소속이 있는 사람에게만 낸다. 팀이 하나도 없는 회사에서 모두에게
// 「팀」이 보이면, 눌러 봐야 빈 화면이라 메뉴만 늘어난다.
const teamItem: NavLink = {
  href: "/team",
  label: "팀",
  desc: "팀원·소속 관리",
  icon: Users,
};

// 관리자는 다른 메뉴와 같은 자리에 둔다. 우측 상단 버튼으로 있을 때는 회원
// 상태 표시에 섞여, 회원 관리·비용을 보러 갈 곳이 있다는 걸 알기 어려웠다.
const adminItem: NavLink = {
  href: "/admin",
  label: "관리자",
  desc: "회원·비용 관리",
  icon: ShieldCheck,
};

/**
 * 광고 규격 내보내기. **스위치가 켜졌을 때만 낸다.**
 *
 * **이미지 갈래의 맨 끝에 둔다**(2026-09-21 사용자가 정한 차례 — 쉽게 ·
 * 다양하게 · 캐릭터 · 광고소재). 전에는 「만들고 → 뽑는」 차례가 보이게
 * `/poster` 바로 뒤였는데, 갈래가 생기면서 **갈래 안의 자리**가 그 뜻을 대신
 * 한다 — 같은 묶음에 있는 것이 곧 이어지는 일이라는 말이다.
 *
 * **새로 만드는 곳이 아니다.** 이미 있는 그림에서 규격을 뽑으므로 비용이 0 이고,
 * 그래서 「도구」에 있어도 여기를 먼저 눌러 돈이 나가는 일이 없다.
 */
const adItem: NavLink = {
  href: "/ad",
  label: "광고소재",
  desc: "만든 이미지에서 포털 규격 뽑기",
  icon: Megaphone,
  section: IMAGE,
};

/**
 * 스위치에 따라 달라지는 도구 목록.
 *
 * 감추는 것은 안내일 뿐이고 실제 차단은 `/ad` 의 `notFound()` 가 서버에서
 * 한다 — 관리자·팀 메뉴와 같은 규칙이다. 다만 **눌러서 404 를 만나는 메뉴**는
 * 그 둘도 안 만든다.
 */
export function navGroupsFor(hasAd: boolean): NavGroup[] {
  if (!hasAd) return navGroups;
  return navGroups.map((group) => {
    /*
      **이미지 갈래의 맨 끝에 끼운다.** 갈래 한가운데에 넣으면 머리말이
      쪼개진다 — 화면은 「앞 항목과 갈래가 다르면 머리말」로 그리므로,
      갈래가 섞이는 순간 같은 이름의 머리말이 두 번 뜬다.
    */
    const last = group.items.map((item) => item.section).lastIndexOf(IMAGE);
    if (last < 0) return group;
    const items = [...group.items];
    items.splice(last + 1, 0, adItem);
    return { ...group, items };
  });
}

/** 권한과 소속에 따라 달라지는 메뉴. 보이는 것과 열리는 것은 별개다 — 실제
 *  차단은 각 화면이 서버에서 한다. */
function bottomItemsFor(isAdmin: boolean, hasTeam: boolean) {
  return [
    ...bottomItems,
    ...(hasTeam || isAdmin ? [teamItem] : []),
    ...(isAdmin ? [adminItem] : []),
  ];
}

interface AppShellProps {
  children: React.ReactNode;
  /** 상단바 우측에 주입할 앱 전용 액션(예: 이용 안내 버튼). */
  actions?: React.ReactNode;
  /**
   * 사이드바 맨 아래, 계정 메뉴 위에 놓을 것(예: 만드는 중 목록).
   *
   * 셸에 두는 이유는 자리 때문만이 아니다. 셸은 화면을 옮겨도 다시 만들어지지
   * 않으므로, 화면이 바뀌어도 계속 돌아야 하는 것이 여기서 살 수 있다.
   */
  sidebarFooter?: React.ReactNode;
  /**
   * 관리자 메뉴 노출 여부. 화면을 감추는 것은 안내일 뿐이고, 실제 차단은
   * `/admin` 의 `requireAdmin()` 이 서버에서 한다.
   */
  isAdmin?: boolean;
  /**
   * 팀에 속해 있는지. 팀 메뉴를 낼지만 정한다.
   *
   * 감추는 것은 안내일 뿐이라, 소속 없는 사람이 주소를 쳐서 들어와도
   * `/team` 은 열린다 — 거기서 「아직 팀에 속해 있지 않습니다」를 본다.
   */
  hasTeam?: boolean;
  /**
   * 광고 규격 내보내기가 켜져 있는지. 메뉴를 낼지만 정한다.
   *
   * **앱이 내려 준다.** 스위치는 서버 환경변수라 셸이 직접 못 읽는다
   * (`NEXT_PUBLIC_` 을 새로 만들면 스위치가 둘이 된다).
   */
  hasAd?: boolean;
  /**
   * **한 화면에 꽉 채운다.** 본문이 제 안에서 스크롤하고 **페이지는 안 늘어난다.**
   *
   * 기본은 꺼짐이다. 대부분의 화면은 내용만큼 길어지고 페이지가 스크롤된다 —
   * 그게 맞다. 켜야 하는 것은 **입력창이 아래에 붙어 있어야 하는 화면**뿐이다
   * (2026-09-21 사용자 — Easy 모드도 다른 도구처럼 셸 안에 넣어 달라).
   *
   * 그런 화면을 셸 밖에 따로 만들면 사이드바와 상단바가 갈린다. 셸이 한 칸을
   * 더 받는 편이 **두 벌로 사는 것보다 낫다.**
   */
  fill?: boolean;
  /**
   * 사이드바에 걸 프로젝트 목록.
   *
   * 상세 화면이 없다. 프로젝트는 **고르는 것**이지 들어가는 곳이 아니다 —
   * 골라 두면 라이브러리·카드뉴스·이미지가 그 갈래만 보여 준다.
   */
  projects?: ProjectLink[];
  /** 지금 고른 것. 없으면 「전체」다. */
  currentProjectId?: string | null;
  /** 고르기를 처리하는 서버 액션. 셸은 폼만 그린다. */
  onSelectProject?: (formData: FormData) => void | Promise<void>;
}

export interface ProjectLink {
  id: string;
  name: string;
  workCount: number;
}

function NavItem({
  href,
  label,
  desc,
  icon: Icon,
  active,
  highlight = false,
}: {
  href: string;
  label: string;
  desc?: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  /**
   * 다른 메뉴보다 눈에 띄어야 하는 항목.
   *
   * **「지금 이 화면」과는 다르게 보여야 한다.** 처음에는 강조도 선택도 같은
   * `bg-primary-soft` 에 채운 아이콘을 써서, 다른 화면에 있는데도 설명서가
   * 늘 눌린 것처럼 보였다. 두 개가 동시에 켜져 있으니 어디 있는지 알 수 없다.
   *
   * 그래서 갈랐다 — 선택은 **채운 배경**, 강조는 **테두리만**.
   */
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-start gap-2.5 rounded-md px-2.5 py-2 transition-colors",
        active
          ? "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]"
          : highlight
            ? "border border-dashed border-primary/40 hover:bg-primary-soft/60"
            : "hover:bg-background"
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-5 w-5 flex-none place-items-center rounded-[6px] border",
          active
            ? "border-transparent bg-primary text-primary-foreground"
            : highlight
              ? "border-primary/40 bg-background text-primary"
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

/**
 * 프로젝트 목록.
 *
 * 「전체」를 맨 위에 늘 둔다. 고른 것을 푸는 길이 없으면, 한 번 고르고 나서
 * 나머지를 못 보게 된다 — 그때 사용자는 작업물이 사라졌다고 여긴다.
 *
 * 지금 있는 화면으로 되돌아온다. 고른 뒤 다른 화면으로 튀면 하던 일을 잃는다.
 */
function ProjectList({
  projects,
  currentProjectId,
  pathname,
  onSelect,
}: {
  projects: ProjectLink[];
  currentProjectId: string | null;
  pathname: string;
  onSelect: (formData: FormData) => void | Promise<void>;
}) {
  const row = (id: string, label: string, count: number | null, on: boolean) => (
    <form key={id || "all"} action={onSelect}>
      <input type="hidden" name="projectId" value={id} />
      <input type="hidden" name="back" value={pathname} />
      <button
        type="submit"
        aria-current={on ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors",
          on ? "bg-primary-soft shadow-[0_0_0_1px_var(--primary-ring)]" : "hover:bg-background"
        )}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
        {count === null ? null : (
          <span className="flex-none text-meta tabular-nums text-subtle-foreground">{count}</span>
        )}
      </button>
    </form>
  );

  return (
    <div>
      <p className="mb-2 px-1.5 text-meta text-subtle-foreground">프로젝트</p>
      <div className="grid gap-0.5">
        {row("", "전체", null, !currentProjectId)}
        {projects.map((project) =>
          row(project.id, project.name, project.workCount, project.id === currentProjectId),
        )}
      </div>
    </div>
  );
}

export function AppShell({
  children,
  actions,
  sidebarFooter,
  isAdmin = false,
  hasTeam = false,
  hasAd = false,
  fill = false,
  projects = [],
  currentProjectId = null,
  onSelectProject,
}: AppShellProps) {
  const pathname = usePathname();
  /*
    접힘 여부는 **그린 뒤에 읽는다.** 처음 그릴 때 브라우저 저장소를 보면
    서버가 그린 것과 달라져 React 가 화면을 통째로 다시 만든다. 첫 그림은 늘
    기본값(펴짐)이고, 붙자마자 지난번 고른 상태로 맞춘다.
  */
  const [collapsed, setCollapsed] = React.useState(SIDEBAR_DEFAULT_COLLAPSED);

  React.useEffect(() => {
    try {
      setCollapsed(collapsedFromStore(window.localStorage.getItem(SIDEBAR_STORE_KEY)));
    } catch {
      // 사생활 보호 모드처럼 저장소를 막아 둔 브라우저가 있다. 못 읽으면
      // 기본값으로 둔다 — 이것 때문에 화면이 안 뜨면 안 된다.
    }
  }, []);

  const toggleSidebar = React.useCallback(() => {
    setCollapsed((was) => {
      const next = !was;
      try {
        window.localStorage.setItem(SIDEBAR_STORE_KEY, storeFromCollapsed(next));
      } catch {
        // 못 적어도 이번 방문 동안은 접힌 채로 쓸 수 있다.
      }
      return next;
    });
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const visibleGroups = navGroupsFor(hasAd);
  const visibleBottomItems = bottomItemsFor(isAdmin, hasTeam);
  const current = projects.find((project) => project.id === currentProjectId) ?? null;
  const allLinks = [...visibleGroups.flatMap((g) => g.items), ...visibleBottomItems];

  return (
    /*
      `fill` 일 때만 화면 높이에 못 박는다. **넓은 화면에서만이다** — 좁은
      화면은 위에 상단바가 있고, 거기서까지 높이를 못 박으면 상단바 높이만큼
      본문이 넘쳐 페이지에 스크롤이 생긴다.
    */
    <div className={cn("min-h-screen bg-background", fill && "lg:h-dvh lg:overflow-hidden")}>
      {/* 좁은 화면 전용 상단바. 넓은 화면에서는 사이드바가 그 역할을 한다. */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2" aria-label="MCS 홈">
            <BrandMark className="h-6 w-6 flex-none" />
            <span className="text-sm font-bold tracking-[-0.02em]">MCS</span>
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
                {/*
                  **여기서는 갈래를 이름 앞에 붙인다.** 한 줄로 늘어놓는 목록이라
                  「만들기」·「리디자인」만으로는 무엇의 만들기인지 알 수 없다.
                */}
                {allLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link
                      href={link.href}
                      className={cn("w-full", isActive(link.href) && "font-bold")}
                    >
                      {link.section ? `${link.section} · ${link.label}` : link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/*
        접히면 왼쪽 칸이 0 이 된다. 본문 칸은 `minmax(0,1fr)` 이라 남는 자리를
        스스로 다 차지하므로, 넓히는 코드를 따로 둘 필요가 없다.
      */}
      <div
        className={cn(
          "lg:grid lg:grid-cols-[var(--shell-side)_minmax(0,1fr)]",
          "lg:transition-[grid-template-columns] lg:duration-200 motion-reduce:lg:transition-none",
          shellSideWidth(collapsed),
        )}
      >
        {/*
          **사이드바는 자기 안에서만 스크롤한다.** 높이는 화면 높이에 못 박혀 있는데
          메뉴가 그보다 길면(노트북·윈도우 배율 125% 이상) 아래 메뉴가 화면 밖으로
          넘쳐 **페이지 전체**에 스크롤을 만들었다. 한 화면에 맞춘 작업 화면까지
          그 때문에 스크롤이 생겼다(2026-09-17 사용자 요청).
        */}
        <aside
          id="shell-sidebar"
          className={cn(
            "sticky top-0 hidden h-screen flex-col gap-6 overflow-y-auto border-r bg-card px-3.5 py-4",
            collapsed ? "lg:hidden" : "lg:flex",
          )}
        >
          <Link href="/" className="flex items-center gap-3 px-1.5" aria-label="MCS 홈">
            <BrandMark className="h-8 w-8 flex-none" />
            <span className="flex flex-col gap-1 leading-none">
              <strong className="text-[15px] font-bold tracking-[-0.02em]">MCS</strong>
              <em className="text-[9px] not-italic tracking-[0.2em] text-subtle-foreground">
                MARKETING CONTENT STUDIO
              </em>
            </span>
          </Link>

          {visibleGroups.map((group) => (
            <div key={group.label} className={cn(group.highlight && "border-b pb-5")}>
              <p
                className={cn(
                  "mb-2 px-1.5 text-meta",
                  group.highlight ? "text-primary" : "text-subtle-foreground",
                )}
              >
                {group.label}
              </p>
              {/*
                **갈래가 바뀌면 머리말을 낸다.** 목록은 평평하고 화면만 두 겹으로
                보인다 — 자료를 중첩시키면 메뉴를 읽는 곳 셋이 전부 두 겹을
                알아야 한다(2026-09-21).
              */}
              <div className="grid gap-0.5">
                {group.items.map((item, at) => (
                  <React.Fragment key={item.href}>
                    {item.section && item.section !== group.items[at - 1]?.section ? (
                      <p className="mb-1 mt-3 px-1.5 text-meta font-bold text-foreground first:mt-0">
                        {item.section}
                      </p>
                    ) : null}
                    <div className={cn(item.section && "pl-2")}>
                      <NavItem
                        {...item}
                        active={isActive(item.href)}
                        highlight={group.highlight}
                      />
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          ))}

          {projects.length && onSelectProject ? (
            <ProjectList
              projects={projects}
              currentProjectId={currentProjectId}
              pathname={pathname}
              onSelect={onSelectProject}
            />
          ) : null}

          <div className="mt-auto grid gap-3">
            {sidebarFooter}
            <div className="grid gap-0.5">
              {visibleBottomItems.map((item) => (
                <NavItem key={item.href} {...item} active={isActive(item.href)} />
              ))}
            </div>
          </div>
        </aside>

        {/*
          접었을 때 왼쪽에 남는 얇은 띠.

          **다 닫지 않는 이유가 여기 있다.** 0 까지 닫으면 다시 펼 것이 허공에
          뜬 단추 하나뿐이라 어디를 눌러야 할지 알기 어렵다. 띠가 남아 있으면
          손잡이가 그 띠에 물려 보여서 「잡아당기면 열린다」가 눈에 들어온다.

          사이드바를 좁히는 대신 **따로 그린다.** 좁혀서 감추면 그 안의 메뉴가
          보이지 않은 채로 탭 순서에 남아, 키보드로 넘기다 안 보이는 링크에
          걸린다.
        */}
        {collapsed ? (
          <div
            aria-hidden
            className="sticky top-0 hidden h-screen border-r bg-card lg:block"
          />
        ) : null}

        {/*
          접기 손잡이. **사이드바 테두리 위에 얹되 사이드바 안에 넣지는 않는다.**

          안에 넣으면 접히는 순간 손잡이까지 같이 사라져 다시 펼 길이 없어진다.
          그래서 바깥에 두고 자리만 사이드바에 맞춘다 — 펴져 있으면 오른쪽
          테두리에 물리고, 접히면 `--shell-side` 가 0 이 되면서 화면 왼쪽 끝으로
          따라 내려온다. 눈으로는 사이드바에 달린 손잡이를 잡아당기는 것처럼
          보인다.

          높이는 로고 줄에 맞춘다(위 여백 16px + 로고 32px 의 한가운데).
        */}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={sidebarToggleLabel(collapsed)}
          title={sidebarToggleLabel(collapsed)}
          aria-expanded={!collapsed}
          aria-controls="shell-sidebar"
          className={cn(
            "fixed top-8 z-50 hidden h-7 w-7 -translate-y-1/2 place-items-center",
            "rounded-full border bg-card text-subtle-foreground shadow-sm",
            "transition-colors hover:bg-background hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            // 두 상태가 같은 규칙을 쓴다. 접히면 `--shell-side` 가 띠 너비로
            // 줄어들 뿐이라, 손잡이는 늘 그 테두리 한가운데에 얹힌다.
            "lg:grid left-[var(--shell-side)] -ml-3.5",
          )}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>

        {/*
          **둘째 칸에 못 박는다.** 접히면 사이드바가 `display: none` 이라 그리드에서
          통째로 빠지는데, 그러면 본문이 자동으로 첫 칸(0px)에 들어가 짜부라진다.
          자리를 지정해 두면 사이드바가 있든 없든 본문은 늘 남는 칸을 쓴다.
        */}
        <div
          className={cn(
            "min-w-0 lg:col-start-2",
            /*
              **본문이 높이를 나눠 갖는다.** 상단바 줄은 제 키만 쓰고(`shrink-0`),
              남는 자리를 `main` 이 다 가진다. 좁은 화면에서는 위 상단바를 뺀
              만큼이다 — **`h-14`(3.5rem)에 아래 테두리 1px 을 더한 값이다.**
              테두리를 빼먹어 900px 폭에서 1px 씩 페이지가 스크롤됐다(2026-09-21 실측).
            */
            fill && "flex h-[calc(100dvh-3.5rem-1px)] flex-col lg:h-dvh",
          )}
        >
          {/* 계정 상태와 테마 전환은 화면 오른쪽 위에 둔다. 예전에는 사이드바
              맨 아래에 있어서, 내가 누구로 접속했는지 보려면 눈이 왼쪽 아래로
              내려가야 했다. 좁은 화면은 위 상단바가 같은 것을 이미 보여준다. */}
          <div className="hidden shrink-0 items-center justify-end gap-2 px-[clamp(16px,2.2vw,52px)] pt-4 lg:flex">
            {actions}
            <ThemeToggle />
          </div>

          {/*
            무엇으로 걸러 보는 중인지 본문 바로 위에 말한다.

            **이게 없으면 「작업물이 사라졌다」가 된다.** 갈래를 고른 뒤
            비어 있는 화면을 열면, 원래 없는 것인지 걸러진 것인지 알 길이
            없다. 푸는 단추도 같은 자리에 둔다 — 사이드바까지 눈을 옮겨
            찾게 하지 않는다.
          */}
          {current ? (
            <div className="mx-[clamp(16px,2.2vw,52px)] mt-4 flex shrink-0 flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary-soft px-3 py-2 text-sm">
              <span className="font-bold text-primary">{current.name}</span>
              <span className="text-subtle-foreground">만 보고 있습니다</span>
              {onSelectProject ? (
                <form action={onSelectProject} className="ml-auto">
                  <input type="hidden" name="projectId" value="" />
                  <input type="hidden" name="back" value={pathname} />
                  <button type="submit" className="text-meta underline underline-offset-4">
                    전체 보기
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}

          {/*
            페이지가 자기 <main> 을 또 열지 않도록 셸이 하나만 제공한다.

            **`fill` 이면 여백을 안 준다.** 꽉 채우는 화면은 제 안에서 칸을
            나누므로(대화 · 구분선 · 결과) 바깥 여백이 그 계산을 어긋나게 한다.
          */}
          <main
            className={cn(
              "min-w-0",
              fill
                ? "flex min-h-0 flex-1 flex-col"
                : "px-[clamp(16px,2.2vw,52px)] pb-6 pt-4",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
