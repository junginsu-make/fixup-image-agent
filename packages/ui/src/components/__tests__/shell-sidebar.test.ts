import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIDEBAR_DEFAULT_COLLAPSED,
  SIDEBAR_RAIL_PX,
  SIDEBAR_STORE_KEY,
  collapsedFromStore,
  shellSideWidth,
  sidebarToggleLabel,
  storeFromCollapsed,
} from "../shell-sidebar";

/**
 * 사이드바 접기.
 *
 * jsdom 이 없어서 눌러 볼 수는 없다. 대신 **판단이 들어가는 부분**을 직접
 * 시험하고, 그것이 화면에 실제로 걸렸는지는 파일을 글자로 읽어 확인한다 —
 * 이 저장소가 `app-shell-nav.test.ts` 에서 이미 쓰는 방식이다.
 */

const shell = readFileSync(
  path.join(__dirname, "..", "app-shell.tsx"),
  "utf8",
);

describe("기본값", () => {
  /** 처음 온 사람에게 메뉴가 안 보이면 무엇을 할 수 있는 도구인지 모른다. */
  it("펴진 상태로 시작한다", () => {
    expect(SIDEBAR_DEFAULT_COLLAPSED).toBe(false);
  });

  it("적어 둔 것이 없으면 기본값으로 돌아간다", () => {
    expect(collapsedFromStore(null)).toBe(SIDEBAR_DEFAULT_COLLAPSED);
    expect(collapsedFromStore(undefined)).toBe(SIDEBAR_DEFAULT_COLLAPSED);
  });

  /**
   * 저장소에는 사용자가 지운 값도, 예전 판이 남긴 값도 들어 있을 수 있다.
   * 모르는 글자를 만나면 메뉴가 보이는 쪽으로 간다.
   */
  it("알 수 없는 글자도 기본값으로 돌아간다", () => {
    for (const raw of ["", "true", "1", "yes", "COLLAPSED", "{}"]) {
      expect(collapsedFromStore(raw)).toBe(SIDEBAR_DEFAULT_COLLAPSED);
    }
  });
});

describe("적고 읽기", () => {
  it("적은 것을 그대로 다시 읽는다", () => {
    for (const collapsed of [true, false]) {
      expect(collapsedFromStore(storeFromCollapsed(collapsed))).toBe(collapsed);
    }
  });

  it("두 상태가 서로 다른 글자다", () => {
    expect(storeFromCollapsed(true)).not.toBe(storeFromCollapsed(false));
  });
});

describe("단추 이름", () => {
  /**
   * **지금 상태가 아니라 누르면 벌어질 일을 말한다.** 접힌 채로 「접기」라고
   * 읽어 주면 화면 낭독기를 쓰는 사람은 누를 이유를 못 찾는다.
   */
  it("접혀 있으면 펴기라고 한다", () => {
    expect(sidebarToggleLabel(true)).toBe("사이드바 펴기");
  });

  it("펴져 있으면 접기라고 한다", () => {
    expect(sidebarToggleLabel(false)).toBe("사이드바 접기");
  });
});

describe("너비", () => {
  /**
   * **다 닫지 않는다.** 0 까지 닫으면 다시 펼 손잡이가 허공에 뜬 단추 하나만
   * 남아 어디를 눌러야 할지 알기 어렵다. 얇은 띠를 남겨 손잡이가 물릴 자리를
   * 만든다.
   */
  it("접혀도 얇은 띠가 남는다", () => {
    expect(shellSideWidth(true)).toContain(`--shell-side:${SIDEBAR_RAIL_PX}px`);
    expect(SIDEBAR_RAIL_PX).toBeGreaterThan(0);
  });

  /** 띠는 자리만 지킨다. 넓으면 접은 뜻이 없다. */
  it("띠가 메뉴 너비보다 훨씬 좁다", () => {
    expect(SIDEBAR_RAIL_PX).toBeLessThan(40);
  });

  /**
   * **Tailwind 는 소스를 글자로 훑어 클래스를 만든다.** 너비를 변수로 조립하면
   * 그 클래스가 아예 안 생겨서 화면에서만 드러난다. 숫자를 그대로 적되, 위의
   * 상수와 어긋나지 않는지 여기서 본다.
   */
  it("적어 둔 숫자와 상수가 같다", () => {
    const found = shellSideWidth(true).match(/--shell-side:(\d+)px/);
    expect(found).not.toBeNull();
    expect(Number(found![1])).toBe(SIDEBAR_RAIL_PX);
  });

  it("펴지면 원래 너비다", () => {
    expect(shellSideWidth(false)).toContain("clamp(236px,15vw,300px)");
  });

  /**
   * 본문 칸은 남는 자리를 다 쓰는 `minmax(0,1fr)` 이어야 한다. 여기가 고정
   * 너비로 바뀌면 사이드바를 접어도 본문이 안 넓어진다.
   */
  it("본문 칸이 남는 자리를 모두 쓴다", () => {
    expect(shell).toContain("lg:grid-cols-[var(--shell-side)_minmax(0,1fr)]");
  });
});

describe("화면에 실제로 걸려 있다", () => {
  it("너비가 상태를 따라간다", () => {
    expect(shell).toContain("shellSideWidth(collapsed)");
  });

  /**
   * **단추는 사이드바 밖에 있어야 한다.** 안에 두면 접힌 순간 단추까지 같이
   * 사라져 다시 펼 길이 없어진다. 사이드바를 감추는 `lg:hidden` 보다 단추가
   * 뒤에 나오는지로 본다.
   */
  it("접기 단추가 사이드바 바깥에 있다", () => {
    const asideEnds = shell.indexOf("</aside>");
    const button = shell.indexOf("onClick={toggleSidebar}");
    expect(asideEnds).toBeGreaterThan(0);
    expect(button).toBeGreaterThan(asideEnds);
  });

  /**
   * **접혀도 손잡이는 남는다.**
   *
   * 손잡이 자신은 `collapsed` 로 감추지 않는다. 감추면 접은 순간 다시 펼 길이
   * 없어진다. 접힘 여부는 **어디에 놓일지**만 정한다.
   */
  it("접힌 상태에서도 손잡이가 남는다", () => {
    const at = shell.indexOf("onClick={toggleSidebar}");
    const open = shell.lastIndexOf("<button", at);
    const close = shell.indexOf("</button>", at);
    const markup = shell.slice(open, close);

    expect(markup).toContain("lg:grid");
    expect(markup).not.toContain("lg:hidden");
  });

  /**
   * 손잡이는 **사이드바 테두리를 따라다닌다.** 펴져 있으면 오른쪽 테두리에
   * 물리고, 접히면 `--shell-side` 가 0 이 되며 화면 왼쪽 끝으로 내려온다.
   */
  it("손잡이가 사이드바 테두리에 붙어 있다", () => {
    const at = shell.indexOf("onClick={toggleSidebar}");
    const markup = shell.slice(shell.lastIndexOf("<button", at), shell.indexOf("</button>", at));

    expect(markup).toContain("left-[var(--shell-side)]");
  });

  /**
   * 접었을 때 남는 띠는 **사이드바를 좁힌 것이 아니라 따로 그린 것**이다.
   * 좁혀서 감추면 그 안의 메뉴가 보이지 않은 채로 탭 순서에 남아, 키보드로
   * 넘기다 안 보이는 링크에 걸린다.
   */
  it("접혔을 때 띠를 따로 그린다", () => {
    expect(shell).toContain("h-screen border-r bg-card lg:block");
    const rail = shell.indexOf("h-screen border-r bg-card lg:block");
    const open = shell.lastIndexOf("<div", rail);
    expect(shell.slice(open, rail)).toContain("aria-hidden");
  });

  /**
   * 본문 윗줄(계정·테마)에는 손잡이를 두지 않는다. 거기 두면 사이드바에서
   * 멀어져 본문 내용과 부딪힌다 — 2026-09-14 에 그래서 옮겼다.
   */
  it("본문 윗줄에 단추를 두지 않는다", () => {
    const row = shell.indexOf('<div className="hidden items-center justify-end');
    expect(row).toBeGreaterThan(0);
    const rowEnd = shell.indexOf("</div>", row);
    expect(shell.slice(row, rowEnd)).not.toContain("toggleSidebar");
  });

  it("접히면 사이드바가 자리를 안 차지한다", () => {
    expect(shell).toContain('collapsed ? "lg:hidden" : "lg:flex"');
  });

  /**
   * **한 번 당한 자리다.**
   *
   * 접으면 사이드바가 `display: none` 이라 그리드에서 통째로 빠진다. 그러면
   * 본문이 자동으로 첫 칸에 들어가는데 그 칸은 0px 이라, 넓어지기는커녕
   * 63px 로 짜부라졌다. 자리를 지정해 두는 이 한 줄이 그것을 막는다.
   */
  it("본문이 둘째 칸에 못 박혀 있다", () => {
    expect(shell).toContain("lg:col-start-2");
  });

  /** 화면 낭독기가 단추와 사이드바를 이어 읽게 한다. */
  it("단추가 사이드바를 가리킨다", () => {
    expect(shell).toContain('aria-controls="shell-sidebar"');
    expect(shell).toContain('id="shell-sidebar"');
    expect(shell).toContain("aria-expanded={!collapsed}");
  });

  /**
   * 저장소는 사생활 보호 모드에서 읽기만 해도 예외를 던지는 브라우저가 있다.
   * 그것 때문에 화면이 안 뜨면 안 된다.
   */
  it("저장소 접근을 감싸 둔다", () => {
    const uses = shell.split("window.localStorage").length - 1;
    expect(uses).toBe(2);
    expect(shell.split("try {").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("저장소 열쇠가 한 곳에서 나온다", () => {
    expect(shell).toContain("SIDEBAR_STORE_KEY");
    expect(SIDEBAR_STORE_KEY.length).toBeGreaterThan(0);
  });
});
