import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ push: vi.fn(), conversations: true, blank: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: st.push, replace: vi.fn() }) }));
vi.mock("../../_components/image-viewer", () => ({ openImageGallery: vi.fn() }));
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

/** **라이브러리에서 쉽게 작업을 열면 쉽게 대화로**(2026-10-06 설계 C, 사용자 보고 3). */
const P = "44444444-4444-4444-8444-444444444444";
const C = "11111111-1111-4111-8111-111111111111";
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function reply(url: string): Response {
  if (url.startsWith("/api/showcase/manage")) return json(403, { ok: false });
  if (url.startsWith("/api/sns/projects")) return json(200, { ok: true, projects: [] });
  if (url.startsWith("/api/poster/projects")) {
    return json(200, { ok: true, projects: [{
      id: P, title: "쉽게 포스터", status: "generating", ratio: "1:1", modelId: "gpt-image-2",
      createdAt: "2026-10-06T00:00:00.000Z", updatedAt: "2026-10-06T00:00:00.000Z", data: { instruction: "포스터" },
      // 그림 없는 작업은 라이브러리에 안 보인다(2026-10-08). 과정 보기 단추는 카드에 달린다.
      images: st.blank ? [] : [{ url: "https://img/p.png", variantIndex: 0 }],
    }] });
  }
  if (url.startsWith("/api/easy/works")) {
    return json(200, st.conversations ? { ok: true, workIds: [P], conversations: { [P]: C } } : { ok: true, workIds: [P] });
  }
  if (url.startsWith("/api/library")) return json(200, { ok: true, items: [] });
  return json(404, { ok: false });
}

let view: ReactTestRenderer;
const flush = async () => { for (let i = 0; i < 20; i += 1) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };
async function 연다() {
  await act(async () => { view = create(<WorksTab />); });
  await flush();
}
const 과정보기 = () => view.root.find((node) => node.type === "button" && node.props["aria-label"] === "쉽게 포스터 과정 보기");
/**
 * **제목으로 그 카드를 찾는다**(최종 리뷰 2026-10-06). 「처음 나온 cursor-pointer」로 고르면
 * 카드가 늘거나 다른 누를 것이 같은 꼴이면 엉뚱한 것을 누른다. 카드 본문(누르면 뷰어 · 이동)
 * 가운데 **이 제목 글자를 품은 것** 하나만 고른다 — 둘 이상이면 `find` 가 실패해 알려 준다.
 */
const 카드 = (title: string) => view.root.find((node) =>
  typeof node.type === "string"
  && typeof node.props.onClick === "function"
  && String(node.props.className ?? "").includes("cursor-pointer")
  && node.findAll((child) => child.children.includes(title)).length > 0);

beforeEach(() => {
  st.push.mockReset();
  st.conversations = true;
  st.blank = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => reply(url)));
});
afterEach(() => { act(() => view?.unmount()); vi.unstubAllGlobals(); });

describe("과정 보기 → 쉽게 대화", () => {
  it("내 쉽게 작업의 과정 보기는 그 대화로 간다", async () => {
    await 연다();
    await act(async () => { 과정보기().props.onClick({ stopPropagation() {} }); });
    expect(st.push).toHaveBeenCalledWith(`/easy/${C}`);
  });

  /** 그림 없는 작업은 크레딧이 안 나갔다 — 라이브러리에 안 보인다(2026-10-08 사용자 결정). 이어서 하기는 쉽게 대화에서. */
  it("그림 없는 쉽게 작업은 카드가 없다", async () => {
    st.blank = true;
    await 연다();
    expect(() => 카드("쉽게 포스터")).toThrow();
  });

  it("대화를 모르는 옛 응답이면 지금처럼 도구 화면으로 간다", async () => {
    st.conversations = false;
    await 연다();
    await act(async () => { 과정보기().props.onClick({ stopPropagation() {} }); });
    expect(st.push).toHaveBeenCalledWith(`/poster/${P}`);
  });
});
