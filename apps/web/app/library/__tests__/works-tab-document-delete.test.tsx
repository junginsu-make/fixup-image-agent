import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **문서 목록을 못 읽었을 때 문서 카드를 일반 삭제로 보내지 않는다**(3차 리뷰 W24).
 *
 * `/api/library` 는 서버 문서도 카드로 싣는다. 문서 목록 API 가 실패하면 그 카드가 문서 정보 없이
 * 남는데, 지우기를 누르면 일반 라이브러리 삭제로 가서 「내가 만든 작업물만 지울 수 있습니다」가
 * 떴다 — 자기 것인데. 문서인지 확인하지 못한 카드는 지우지 않고 「잠시 뒤 다시」를 안내한다.
 */
const st = vi.hoisted(() => ({ calls: [] as Array<{ url: string; method: string }>, documentsFail: true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../../_components/image-viewer", () => ({ openImageGallery: vi.fn() }));
vi.mock("../../_components/thumb-image", () => ({ ThumbImage: () => null }));
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
import { UNCONFIRMED_DOCUMENT_NOTICE } from "../document-works";

const U = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const OLD = "33333333-3333-4333-8333-333333333333";
const card = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id, title, tool: "create", aspectRatio: null, sourceType: "generation", sourceId: id, imageCount: 2,
  createdAt: "2026-10-02T00:00:00.000Z", coverUrl: "https://cover/" + id, coverThumbUrl: null, mine: true, ownerEmail: null, ...extra,
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function reply(url: string, method: string): Response {
  if (method === "DELETE") return json(403, { ok: false, message: "내가 만든 작업물만 지울 수 있습니다." });
  if (url.startsWith("/api/showcase/manage")) return json(403, { ok: false });
  if (url.startsWith("/api/sns/projects")) return json(200, { ok: true, projects: [] });
  if (url.startsWith("/api/poster/projects")) return json(200, { ok: true, projects: [] });
  if (url.startsWith("/api/easy/works")) return json(200, { ok: true, workIds: [] });
  if (url.startsWith("/api/library")) return json(200, { ok: true, items: [card(DOC, "서버 상세페이지", { documentId: DOC, documentOwner: U }), card(OLD, "옛 작업")] });
  if (url.startsWith("/api/pdp/documents")) return st.documentsFail ? json(503, { ok: false, message: "작업 목록을 읽지 못했습니다." }) : json(200, { ok: true, documents: [{
    id: DOC, userId: U, revision: 2, sourceDraftId: null, createdAt: "2026-10-02T00:00:00.000Z", updatedAt: "2026-10-02T01:00:00.000Z",
    title: "서버 상세페이지", stage: "editor", sectionCount: 2, aspectRatio: "9:16", imageCount: 2, cover: null, mine: true, coverUrl: "https://cover/doc" }] });
  return json(404, { ok: false });
}

let view: ReactTestRenderer;
const flush = async () => { for (let i = 0; i < 20; i += 1) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };
const text = () => JSON.stringify(view.toJSON());
async function pressDelete(title: string) {
  const button = view.root.find((node) => node.type === "button" && node.props["aria-label"] === `${title} 지우기`);
  await act(async () => { button.props.onClick({ stopPropagation() {} }); });
  await flush();
}

beforeEach(() => {
  st.calls = [];
  st.documentsFail = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    st.calls.push({ url, method });
    return reply(url, method);
  }));
});
afterEach(async () => {
  if (view) act(() => view.unmount());
  await flush();
  vi.unstubAllGlobals();
});

describe("W24 문서 목록을 못 읽었을 때의 지우기", () => {
  it("문서 카드는 확인 창을 열지 않고 「잠시 뒤 다시」를 안내한다 — 일반 삭제 요청 0번", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    await pressDelete("서버 상세페이지");
    expect(text()).not.toContain("지울까요?");
    expect(text()).toContain(UNCONFIRMED_DOCUMENT_NOTICE);
    expect(st.calls.filter((call) => call.method === "DELETE")).toEqual([]);
  });

  it("문서 목록을 읽었으면 같은 문서 카드는 문서 삭제 확인 창을 연다", async () => {
    st.documentsFail = false;
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    await pressDelete("서버 상세페이지");
    expect(text()).toContain("지울까요?");
    expect(text()).toContain("라이브러리에서도 함께 사라집니다.");
    expect(text()).not.toContain("함께 지워집니다");
  });

  /** 회원의 지우기는 「지운 때」만 적는다(2026-10-08). 확인 창이 「그림도 사라진다」고 말하면 사실이 아니다. */
  it("회원에게는 내 화면에서 사라진다고 말한다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    await pressDelete("옛 작업");
    expect(text()).toContain("내 화면에서 사라지고, 되돌릴 수 없습니다.");
    expect(text()).not.toContain("만들어 둔 그림도 함께 사라지고");
  });

  it("문서가 아닌 옛 작업은 지금처럼 확인 창을 연다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    await pressDelete("옛 작업");
    expect(text()).toContain("지울까요?");
  });
});
