import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
const gallery = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("../../_components/image-viewer", () => ({ openImageGallery: gallery.open }));
vi.mock("../../_components/thumb-image", () => ({ ThumbImage: () => null }));
// 지우기 확인 창은 Radix 포털이라 이 렌더러가 못 그린다 — `works-tab-document-delete.test.tsx` 와 같은 모의.
vi.mock("@fixup/ui", async (load) => {
  const actual = await load<Record<string, unknown>>();
  const Box = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children?: React.ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: Box, DialogHeader: Box, DialogTitle: Box, DialogDescription: Box, DialogFooter: Box,
  };
});

import { WorksTab } from "../works-tab";

/**
 * **거르기는 라이브러리 화면의 한 줄이 정한다**(2026-10-08 사용자 요청). 작업물 화면은 고른 것을
 * 받아 카드를 그리고, 단추에 달 개수를 위로 알린다. **그림 없는 작업은 카드도 개수도 없다.**
 */
const P = "44444444-4444-4444-8444-444444444444";
const BLANK = "55555555-5555-4555-8555-555555555555";
const S = "66666666-6666-4666-8666-666666666666";
const AD = "77777777-7777-4777-8777-777777777777";
const calls: Array<{ url: string; method: string; body?: string }> = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const stamp = { createdAt: "2026-10-08T00:00:00.000Z", updatedAt: "2026-10-08T00:00:00.000Z", ratio: "1:1", modelId: "gpt-image-2" };
function reply(url: string, method: string): Response {
  if (method === "DELETE") return json({ ok: true });
  if (url.startsWith("/api/showcase/manage")) return new Response("{}", { status: 403 });
  if (url.startsWith("/api/sns/projects")) {
    return json({ ok: true, projects: [{ id: S, title: "카드뉴스 하나", status: "ready", ...stamp,
      data: { flow: { cards: [{ index: 1, assetUrl: "https://img/s.png" }] } } }] });
  }
  if (url.startsWith("/api/poster/projects")) {
    return json({ ok: true, projects: [
      { id: P, title: "포스터 하나", status: "done", ...stamp, data: {}, images: [{ url: "https://img/p.png", variantIndex: 0 }] },
      { id: BLANK, title: "기획만 한 포스터", status: "ready", ...stamp, data: {}, images: [] },
    ] });
  }
  if (url.startsWith("/api/easy/works")) return json({ ok: true, workIds: [] });
  if (url.startsWith("/api/library?id=")) {
    return json({ ok: true, images: [
      { position: 0, mimeType: "image/jpeg", url: "https://img/ad-0.jpg" },
      { position: 1, mimeType: "image/png", url: "https://img/ad-1.png" },
    ] });
  }
  if (url.startsWith("/api/library")) {
    return json({ ok: true, items: [{
      id: AD, title: "봄 세일 · 광고 규격 2개", tool: "ad", aspectRatio: null, sourceType: "generation", imageCount: 2,
      createdAt: "2026-10-07T00:00:00.000Z", coverUrl: "https://img/ad.png", coverThumbUrl: null, mine: true, ownerEmail: null,
    }] });
  }
  return new Response("{}", { status: 404 });
}

let view: ReactTestRenderer;
const flush = async () => { for (let i = 0; i < 20; i += 1) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };
const text = () => JSON.stringify(view.toJSON());

beforeEach(() => {
  calls.length = 0;
  gallery.open.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
    return reply(url, method);
  }));
});
afterEach(() => { act(() => view?.unmount()); vi.unstubAllGlobals(); });

describe("작업물 화면과 한 줄 거르기", () => {
  it("전체 — 그림 있는 작업만 카드가 된다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    expect(text()).toContain("포스터 하나");
    expect(text()).toContain("카드뉴스 하나");
    expect(text()).not.toContain("기획만 한 포스터");
    expect(text()).not.toContain("아직 그림이 없습니다");
  });

  it("고른 기능의 작업만 그린다", async () => {
    await act(async () => { view = create(<WorksTab filter="sns" />); });
    await flush();
    expect(text()).toContain("카드뉴스 하나");
    expect(text()).not.toContain("포스터 하나");
  });

  it("그 안에 거르기 단추를 따로 두지 않는다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    expect(view.root.findAll((node) => node.props.role === "group" && node.props["aria-label"] === "만든 기능으로 거르기")).toHaveLength(0);
  });

  it("단추에 달 개수를 위로 알린다 — 그림 없는 작업은 세지 않는다", async () => {
    const onSummary = vi.fn();
    await act(async () => { view = create(<WorksTab onSummary={onSummary} />); });
    await flush();
    expect(onSummary).toHaveBeenLastCalledWith({
      counts: { all: 3, easy: 0, poster: 1, sns: 1, ad: 1, create: 0, redesign: 0 },
      easyKnown: true,
    });
  });
});

/** **광고소재 결과**(2026-10-08) — 라이브러리 표에 있는 계정 보관 작업이다. */
describe("광고소재 작업", () => {
  it("광고소재를 고르면 그 작업만", async () => {
    await act(async () => { view = create(<WorksTab filter="ad" />); });
    await flush();
    expect(text()).toContain("봄 세일 · 광고 규격 2개");
    expect(text()).not.toContain("포스터 하나");
    expect(text()).toContain("광고소재");
  });

  /** 도구 주소(`/api/poster/projects/…`)로 보내면 아무것도 안 지워지고 사라진 것처럼 보인다. */
  it("지우면 라이브러리 표에서 지운다", async () => {
    await act(async () => { view = create(<WorksTab filter="ad" />); });
    await flush();
    const corner = view.root.find((node) => node.type === "button" && node.props["aria-label"] === "봄 세일 · 광고 규격 2개 지우기");
    await act(async () => { corner.props.onClick({ stopPropagation() {} }); });
    await flush();
    const confirm = view.root.findAll((node) => node.type === "button" && node.findAll((child) => child.children.includes("지웁니다")).length > 0).at(-1)!;
    await act(async () => { confirm.props.onClick(); });
    await flush();
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([
      { url: "/api/library", method: "DELETE", body: JSON.stringify({ id: AD }) },
    ]);
  });
});

/**
 * **광고 파일은 실제 형식대로 이름 붙인다**(2026-10-08 독립 리뷰). 광고 규격 대부분이 JPG 인데
 * 늘 `.png` 로 붙이면 JPEG 내용에 PNG 이름이 달린 파일을 매체에 올리게 된다.
 */
describe("광고소재 그림 내려받기 이름", () => {
  it("저장된 형식의 확장자를 쓴다", async () => {
    await act(async () => { view = create(<WorksTab filter="ad" />); });
    await flush();
    const card = view.root.find((node) => typeof node.type === "string" && typeof node.props.onClick === "function"
      && String(node.props.className ?? "").includes("cursor-pointer"));
    await act(async () => { card.props.onClick(); });
    await flush();
    const names = (gallery.open.mock.calls[0]![0] as { images: Array<{ name: string }> }).images.map((image) => image.name);
    expect(names).toEqual(["봄 세일 · 광고 규격 2개 1번째.jpg", "봄 세일 · 광고 규격 2개 2번째.png"]);
  });
});
