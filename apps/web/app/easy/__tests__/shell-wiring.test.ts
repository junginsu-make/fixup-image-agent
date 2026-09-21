import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_MIN, RESULT_DEFAULT, RESULT_MAX } from "../split";

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
    expect(layout).toContain("EasyConversationList");
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

describe("결과 칸의 처음 너비", () => {
  /**
   * 「처음부터 사용자가 늘릴 수 있는 만큼 최대한으로 늘려서 그걸 기본값으로
   * 하세요」(2026-09-21 사용자). **상한이 곧 기본값**이라야 그 말이 지켜진다.
   */
  it("끌 수 있는 최대와 같다", () => {
    expect(RESULT_DEFAULT).toBe(RESULT_MAX);
  });

  /**
   * 재기 전 한 프레임을 CSS 가 맡는다. `w-[45rem]` 은 720px, 뺄 값은 `CHAT_MIN`.
   * 16 은 Tailwind 의 rem 기본값이다.
   */
  it("CSS 가 적어 둔 값이 split.ts 와 같다", () => {
    const rem = Number(/w-\[(\d+(?:\.\d+)?)rem\]/.exec(panel)?.[1]);
    expect(rem * 16).toBe(RESULT_MAX);

    const 남길것 = Number(/max-w-\[calc\(100%-(\d+)px\)\]/.exec(panel)?.[1]);
    expect(남길것).toBe(CHAT_MIN);
  });
});
