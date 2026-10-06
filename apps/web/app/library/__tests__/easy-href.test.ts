import { describe, expect, it } from "vitest";
import { readEasyWorks, stepsHref } from "../easy-href";

/**
 * **「과정 보기」가 쉽게 대화로 간다**(2026-10-06 설계 C). 카드 주소가 늘 `/poster/{id}` ·
 * `/sns/{id}` 라 쉽게로 만든 것도 다양하게 · 카드뉴스 화면으로 갔다.
 */
const C = "11111111-1111-4111-8111-111111111111";
const 작업 = (over: Record<string, unknown> = {}) =>
  ({ id: "p1", tool: "poster", href: "/poster/p1", mine: true, ...over }) as { id: string; tool: string; href: string; mine: boolean };

describe("쉽게 작업 목록 읽기", () => {
  it("작업 id 와 작업 → 대화를 읽는다", () => {
    const easy = readEasyWorks({ ok: true, workIds: ["p1"], conversations: { p1: C } });
    expect([...easy!.ids]).toEqual(["p1"]);
    expect(easy!.conversations.get("p1")).toBe(C);
  });

  it("대화가 없는 옛 응답도 읽는다 — 거르기는 그대로 된다", () => {
    const easy = readEasyWorks({ ok: true, workIds: ["p1"] });
    expect([...easy!.ids]).toEqual(["p1"]);
    expect(easy!.conversations.size).toBe(0);
  });

  it("못 읽으면 null — 빈 목록으로 대신하지 않는다", () => {
    expect(readEasyWorks({ ok: false })).toBeNull();
    expect(readEasyWorks(null)).toBeNull();
  });

  it("대화 id 모양이 아니면 버린다", () => {
    expect(readEasyWorks({ ok: true, workIds: ["p1"], conversations: { p1: "../admin" } })!.conversations.size).toBe(0);
  });
});

describe("과정 보기 주소", () => {
  const 대화 = new Map([["p1", C], ["s1", C]]);

  it("내 쉽게 이미지는 그 대화로 간다", () => {
    expect(stepsHref(작업(), 대화)).toBe(`/easy/${C}`);
  });

  it("내 쉽게 카드뉴스도 그 대화로 간다", () => {
    expect(stepsHref(작업({ id: "s1", tool: "sns", href: "/sns/s1" }), 대화)).toBe(`/easy/${C}`);
  });

  /** Review Focus 4 */
  it("대화를 지웠으면(목록에 없음) 도구 화면 그대로", () => {
    expect(stepsHref(작업({ id: "p9", href: "/poster/p9" }), 대화)).toBe("/poster/p9");
  });

  it("남의 작업이면 도구 화면 그대로 — 남의 대화는 열 수 없다", () => {
    expect(stepsHref(작업({ mine: false }), 대화)).toBe("/poster/p1");
  });

  it("목록을 못 읽었거나 관리자 전체 보기면(null) 도구 화면 그대로", () => {
    expect(stepsHref(작업(), null)).toBe("/poster/p1");
  });

  it("상세페이지 · 리디자인은 건드리지 않는다", () => {
    expect(stepsHref(작업({ tool: "create", href: "/create?draft=p1" }), 대화)).toBe("/create?draft=p1");
  });
});
