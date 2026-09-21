import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_MIN, HANDLE, LIST_DEFAULT, RESULT_DEFAULT, RESULT_MAX } from "../split";

/**
 * Easy 모드는 **다른 도구와 같은 셸 안**에 있다 (2026-09-21 사용자).
 *
 * ── 왜 시험으로 묶나 ─────────────────────────────────────────
 *
 * 이건 **한 번 뒤집힌 판단**이다. 2026-09-17 에는 반대로 정했다 — 「사이드바에
 * 도구가 여섯 개 걸리면 「쉬운 모드」가 아니다」. 그 판단이 코드와 주석에
 * 남아 있어서, 다음 사람이 그 주석을 읽고 되돌릴 수 있다.
 *
 * 되돌아가면 사용자가 겪은 일이 그대로 돌아온다 — 「스튜디오에서 카드뉴스를
 * 만들든 이미지를 만들든 사이드바나 상단바는 고정되는데 **이지모드만 페이지가
 * 완전히 바뀝니다.**」
 *
 * ── 두 벌이 되는 값도 여기서 묶는다 ──────────────────────────
 *
 * 결과 칸의 처음 너비는 `split.ts` 가 값으로 정하는데, 재기 전 한 프레임 동안은
 * **CSS 클래스**가 같은 일을 한다. 둘이 갈리면 화면이 튄다.
 */

const 화면 = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const layout = 화면("../layout.tsx");
const dashboard = 화면("../_components/dashboard.tsx");
const list = 화면("../_components/conversation-list.tsx");
const handle = 화면("../_components/split-handle.tsx");
const panel = 화면("../_components/result-panel.tsx");
const client = 화면("../easy-client.tsx");

describe("셸 안에 산다", () => {
  it("제 레이아웃이 아니라 StudioLayout 을 쓴다", () => {
    expect(layout).toContain("StudioLayout");
    expect(layout).toContain("<StudioLayout fill>");
  });

  /**
   * **제 사이드바를 다시 세우지 않는다.** 셸의 사이드바를 밀어낸 것이 그것이었다.
   * 대화 목록은 이제 대시보드 안의 칸이다.
   */
  it("제 상단바·제 사이드바를 만들지 않는다", () => {
    expect(layout).not.toContain("StudioActions");
    expect(layout).not.toContain("ThemeToggle");
    expect(layout).not.toContain("<nav");
    expect(layout).not.toContain("h-dvh");
  });

  it("대화 목록을 대시보드 안에 둔다", () => {
    expect(layout).toContain("EasyDashboard");
    expect(dashboard).toContain("EasyConversationList");
  });

  /**
   * **출구를 두 번 그리지 않는다.** 셸 사이드바의 「이미지 만들기」가 그것이다 —
   * 사용자가 라이브러리 단추를 뺄 때 쓴 것과 같은 판단이다(중복).
   */
  it("「자세한 모드로」를 따로 그리지 않는다", () => {
    expect(layout).not.toContain("자세한 모드로");
    expect(client).not.toContain("자세한 모드로");
  });
});

describe("구분선 둘", () => {
  /**
   * 칸이 셋이면 선이 둘이다. 목록 쪽 선이 빠지면 **넓힌 목록을 되돌릴 길이
   * 없다** — 2026-09-21 에 사용자가 「여기도 선 이동 될 수 있게」라고 한 자리다.
   */
  it("목록 쪽과 결과 쪽 양쪽에 있다", () => {
    expect(dashboard).toContain("side=" + JSON.stringify("left"));
    expect(client).toContain("side=" + JSON.stringify("right"));
  });

  /**
   * **끌 수 있다는 것이 눈에 보여야 한다**(2026-09-21 사용자 — 「양쪽 다 이동할
   * 수 있다는 아이콘을 표시해주세요」). 1px 선뿐이면 커서를 정확히 그 위에
   * 올려 보기 전에는 알 수 없고, 모르면 없는 기능이다.
   */
  it("양쪽으로 간다는 아이콘을 단다", () => {
    // **그려야 잡힌다.** 이름만 보면 안 쓰이는 import 하나로도 통과한다.
    expect(handle).toContain("<MoveHorizontal");
  });
});

describe("대화 목록의 처음 너비", () => {
  /** 「채팅목록 사이즈 더 넓혀주세요」(2026-09-21). 전에는 224 였다. */
  it("전보다 넓다", () => {
    expect(LIST_DEFAULT).toBeGreaterThan(224);
  });

  it("CSS 가 적어 둔 값이 split.ts 와 같다", () => {
    const rem = Number(/w-\[(\d+(?:\.\d+)?)rem\]/.exec(list)?.[1]);
    expect(rem * 16).toBe(LIST_DEFAULT);
  });
});

describe("결과 칸의 처음 너비", () => {
  /**
   * 「처음부터 사용자가 늘릴 수 있는 만큼 최대한으로 늘려서 그걸 기본값으로
   * 하세요」(2026-09-21 사용자). **상한이 곧 기본값**이라야 그 말이 지켜진다.
   */
  it("끌 수 있는 최대와 같다", () => {
    expect(RESULT_DEFAULT).toBe(RESULT_MAX);
  });

  /**
   * 재기 전 한 프레임을 CSS 가 맡는다. `w-[45rem]` 은 720px, 뺄 값은 대화
   * 바닥에 구분선 하나를 더한 것이다. 16 은 Tailwind 의 rem 기본값이다.
   */
  it("CSS 가 적어 둔 값이 split.ts 와 같다", () => {
    const rem = Number(/w-\[(\d+(?:\.\d+)?)rem\]/.exec(panel)?.[1]);
    expect(rem * 16).toBe(RESULT_MAX);

    const 남길것 = Number(/max-w-\[calc\(100%-(\d+)px\)\]/.exec(panel)?.[1]);
    expect(남길것).toBe(CHAT_MIN + HANDLE);
  });
});
