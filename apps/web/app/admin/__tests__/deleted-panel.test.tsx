import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **삭제 보관 탭 — 회원이 지운 재료**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 관리자는 회원이 지운 캐릭터·참고 이미지·쉽게 대화를 보고(누가·언제 지웠나), 대화는 내용을 열고, 셋 다 완전히
 * 지운다. 완전 삭제는 각 자료의 원래 지우기 주소로 간다 — 관리자면 서버가 파일까지 지운다.
 */
const { DeletedPanel } = await import("../deleted/deleted-panel");
type Props = Parameters<typeof DeletedPanel>[0];

const GONE = "2026-10-08T03:00:00.000Z";
const CHAR = "11111111-1111-4111-8111-111111111111";
const REF = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";

const props: Props = {
  characters: [{ id: CHAR, name: "호랑이", ownerEmail: "m@example.com", deletedAt: GONE, imageUrl: "https://img/char.png" }],
  references: [{ id: REF, title: "봄 배경", ownerEmail: "r@example.com", deletedAt: GONE, imageUrl: "https://img/ref.png" }],
  conversations: [{ id: CONV, title: "가을 행사", ownerEmail: "c@example.com", deletedAt: GONE }],
};

let view: ReactTestRenderer;
let calls: Array<{ url: string; method: string; body?: string }> = [];

const text = () => {
  const flat = (node: unknown): string => {
    if (node === null || node === undefined) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(flat).join("");
    return flat((node as { children?: unknown }).children);
  };
  return flat(view.toJSON());
};
const button = (label: string) => view.root.find((node) => node.type === "button" && node.props["aria-label"] === label);
const flush = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

beforeEach(() => {
  calls = [];
  vi.stubGlobal("window", { confirm: () => true });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    if (method === "GET") return Response.json({ ok: true, messages: [{ id: "m1", role: "user", body: "할인 행사 카드뉴스" }] });
    return Response.json({ ok: true });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("삭제 보관 탭", () => {
  it("셋을 누가·언제 지웠는지와 함께 보여 준다", async () => {
    await act(async () => { view = create(<DeletedPanel {...props} />); });
    for (const word of ["호랑이", "m@example.com", "봄 배경", "r@example.com", "가을 행사", "c@example.com", "10월 8일"]) {
      expect(text()).toContain(word);
    }
  });

  it("비었으면 비었다고 말한다", async () => {
    await act(async () => { view = create(<DeletedPanel characters={[]} references={[]} conversations={[]} />); });
    expect(text()).toContain("회원이 지운 자료가 없습니다");
  });

  it("캐릭터는 캐릭터 지우기 주소로 완전히 지우고 목록에서 뺀다", async () => {
    await act(async () => { view = create(<DeletedPanel {...props} />); });
    await act(async () => { button("호랑이 완전 삭제").props.onClick(); });
    await flush();
    expect(calls).toEqual([{ url: "/api/characters", method: "DELETE", body: JSON.stringify({ id: CHAR }) }]);
    expect(text()).not.toContain("호랑이");
  });

  it("참고 이미지는 참고 이미지 지우기 주소로", async () => {
    await act(async () => { view = create(<DeletedPanel {...props} />); });
    await act(async () => { button("봄 배경 완전 삭제").props.onClick(); });
    await flush();
    expect(calls.map((call) => [call.url, call.method])).toEqual([[`/api/reference-images/${REF}`, "DELETE"]]);
  });

  it("쉽게 대화는 내용을 열어 보고, 관리자 주소로 완전히 지운다", async () => {
    await act(async () => { view = create(<DeletedPanel {...props} />); });
    await act(async () => { button("가을 행사 내용 보기").props.onClick(); });
    await flush();
    expect(text()).toContain("할인 행사 카드뉴스");
    await act(async () => { button("가을 행사 완전 삭제").props.onClick(); });
    await flush();
    expect(calls.map((call) => [call.url, call.method])).toEqual([
      [`/api/admin/deleted-conversations/${CONV}`, "GET"],
      [`/api/admin/deleted-conversations/${CONV}`, "DELETE"],
    ]);
  });

  it("확인을 취소하면 아무것도 지우지 않는다", async () => {
    vi.stubGlobal("window", { confirm: () => false });
    await act(async () => { view = create(<DeletedPanel {...props} />); });
    await act(async () => { button("호랑이 완전 삭제").props.onClick(); });
    await flush();
    expect(calls).toEqual([]);
    expect(text()).toContain("호랑이");
  });

  it("못 지우면 목록에 남기고 알린다", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: false, message: "삭제하지 못했습니다." }, { status: 500 })));
    await act(async () => { view = create(<DeletedPanel {...props} />); });
    await act(async () => { button("호랑이 완전 삭제").props.onClick(); });
    await flush();
    expect(text()).toContain("호랑이");
    expect(text()).toContain("삭제하지 못했습니다.");
  });
});
