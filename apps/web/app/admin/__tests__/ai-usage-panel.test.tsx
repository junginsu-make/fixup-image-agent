import React from "react";
import { readFileSync } from "node:fs";
import { create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

/**
 * **관리자 AI 사용 비용 + 전체 멈춤 스위치**(설계 2026-09-30 §3.3·§3.4 · C4).
 *
 * 보고 바로 결정하도록 숫자와 스위치가 한 카드에 있다. 여기서는 화면이 **무엇을 말하는지**를 본다 —
 * 멈춤 상태, 누르면 보낼 값, 한계 문구(청구서와 1원 단위로 같지 않다), 이름표, 「옛 기준」.
 */
vi.mock("server-only", () => ({}));
vi.mock("../system/ai-control-actions", () => ({ setAiPausedAction: vi.fn() }));
// `useFormStatus` 는 시험 렌더러에 없다. 단추 모양만 남긴다 — 확인 창은 그 컴포넌트의 몫이다.
vi.mock("../confirm-submit-button", () => ({
  ConfirmSubmitButton: ({ children }: { children: React.ReactNode }) => React.createElement("button", { type: "submit" }, children),
}));

const { AiUsagePanel } = await import("../system/ai-usage-panel");
type Props = Parameters<typeof AiUsagePanel>[0];
type Report = NonNullable<Props["report"]>;

const 보고: Report = {
  days: 30,
  todayUsd: 1,
  monthUsd: 7,
  windowUsd: 7,
  daily: [{ day: "2026-09-29", usd: 2, calls: 1 }, { day: "2026-09-30", usd: 1, calls: 1 }],
  byProvider: [{ key: "fal", usd: 4, calls: 1, images: 2 }, { key: "anthropic", usd: 1, calls: 1, images: 0 }],
  byOperation: [{ key: "sns:plan", usd: 2, calls: 1, images: 0 }, { key: "새-기능", usd: 1, calls: 1, images: 0 }],
};

const 나무 = (props: Props) => create(React.createElement(AiUsagePanel, props)).toJSON();

function 글(props: Props): string {
  const 편다 = (node: unknown): string => {
    if (node === null || node === undefined) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(편다).join(" ");
    return 편다((node as { children?: unknown }).children);
  };
  return 편다(나무(props));
}

/** 숨은 칸 `paused` 가 보낼 값. 스위치를 누르면 이 값으로 바뀐다. */
function 보낼값(props: Props): string | undefined {
  let found: string | undefined;
  const 훑는다 = (node: unknown): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(훑는다); return; }
    const el = node as { type?: string; props?: { name?: string; value?: string }; children?: unknown };
    if (el.type === "input" && el.props?.name === "paused") found = el.props.value;
    훑는다(el.children);
  };
  훑는다(나무(props));
  return found;
}

describe("스위치", () => {
  it("켜져 있으면 「AI 전체 멈춤」을 내고, 누르면 '1' 을 보낸다", () => {
    expect(글({ report: 보고, paused: false, usdKrw: 1000 })).toContain("AI 전체 멈춤");
    expect(보낼값({ report: 보고, paused: false, usdKrw: 1000 })).toBe("1");
  });

  it("멈춰 있으면 그렇다고 보이고, 누르면 '0' 을 보낸다", () => {
    const 보인것 = 글({ report: 보고, paused: true, usdKrw: 1000 });
    expect(보인것).toContain("AI 멈춤");
    expect(보인것).toContain("AI 다시 켜기");
    expect(보낼값({ report: 보고, paused: true, usdKrw: 1000 })).toBe("0");
  });

  it("이미 도는 그림은 끝까지 돌 수 있다고 적는다(설계 §3.3)", () => {
    expect(글({ report: 보고, paused: false, usdKrw: 1000 })).toContain("이미 제출돼 도는 그림은 끝까지 돌 수 있습니다");
  });

  /**
   * `readAiPausedForAdmin` 이 던지면(설계 2026-09-30 §3.3) 페이지가 `null` 로 받는다.
   * **틀린 「켜짐/멈춤」을 절대 보이지 않는다** — 모른다고 말하고 단추를 숨긴다.
   */
  it("상태를 못 읽으면(paused=null) 모른다고 말하고 단추를 숨긴다", () => {
    const 보인것 = 글({ report: 보고, paused: null, usdKrw: 1000 });
    expect(보인것).toContain("상태를 읽지 못했습니다");
    expect(보인것).not.toContain("AI 전체 멈춤");
    expect(보인것).not.toContain("AI 다시 켜기");
    expect(보낼값({ report: 보고, paused: null, usdKrw: 1000 })).toBeUndefined();
  });
});

describe("숫자", () => {
  it("오늘·이번 달·최근 30일을 원화로 보인다", () => {
    const 보인것 = 글({ report: 보고, paused: false, usdKrw: 1000 });
    expect(보인것).toContain("1,000원");
    expect(보인것).toContain("7,000원");
  });

  it("공급자·작업에 이름표를 달고, 모르는 작업은 키 그대로 보인다", () => {
    const 보인것 = 글({ report: 보고, paused: false, usdKrw: 1000 });
    expect(보인것).toContain("fal (그림)");
    expect(보인것).toContain("카드뉴스 · 기획·원고");
    expect(보인것).toContain("새-기능");
  });

  it("청구서와 1원 단위로 같지 않다고 밝힌다(설계 §3.4)", () => {
    expect(글({ report: 보고, paused: false, usdKrw: 1000 })).toContain("1원 단위로 같지는 않습니다");
  });

  it("보고를 못 읽으면 화면은 열리고 준비 전이라고 말한다", () => {
    expect(글({ report: null, paused: false, usdKrw: 1000 })).toContain("아직 집계할 수 없습니다");
  });
});

describe("옛 장부는 「옛 기준」으로 보인다(설계 §3.4)", () => {
  const 읽는다 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  it("시스템 화면에서 새 패널이 옛 비용 패널보다 위에 있다", () => {
    const page = 읽는다("system/page.tsx");
    expect(page.indexOf("<AiUsagePanel")).toBeGreaterThan(-1);
    expect(page.indexOf("<AiUsagePanel")).toBeLessThan(page.indexOf("<CostPanel"));
  });

  it("옛 비용 패널과 회원 목록의 비용 칸에 「옛 기준」을 적는다", () => {
    expect(읽는다("CostPanel.tsx")).toContain("옛 기준");
    expect(읽는다("member-list/member-table.tsx")).toContain("비용(옛 기준)");
  });
});

/**
 * **스위치 상태를 못 읽어도 시스템 탭 전체가 죽지 않는다**(설계 §3.3).
 *
 * `readAiPausedForAdmin` 은 여전히 던진다(§3.3 — 모르는 채 「켜짐」으로 보이면 안 된다는 계약은
 * 그대로다). 그 대신 **이 파일에서 잡아** `null` 로 넘긴다 — 문의함·플랜까지 함께 죽이지 않는다.
 */
describe("페이지가 스위치 읽기 실패를 가둔다", () => {
  const 읽는다 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  it("readAiPausedForAdmin() 을 .catch( 로 감싼다", () => {
    const page = 읽는다("system/page.tsx");
    expect(page).toMatch(/readAiPausedForAdmin\(\)\s*\.catch\(/);
  });
});
