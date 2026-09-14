import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SIDEBAR_DEFAULT_COLLAPSED,
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
  /** 접히면 왼쪽 칸이 0 이 되고, 본문이 그만큼 넓어진다. */
  it("접히면 0 이다", () => {
    expect(shellSideWidth(true)).toContain("--shell-side:0px");
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

  it("접힌 상태에서도 단추가 붙어 있다", () => {
    // 단추가 걸린 줄은 `lg:flex` 라 넓은 화면에서 늘 보인다. 사이드바처럼
    // `collapsed` 에 따라 사라지면 안 된다.
    const at = shell.indexOf("onClick={toggleSidebar}");
    const row = shell.lastIndexOf("<div className=\"hidden items-center justify-end", at);
    expect(row).toBeGreaterThan(0);
    expect(shell.slice(row, at)).toContain("lg:flex");
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
