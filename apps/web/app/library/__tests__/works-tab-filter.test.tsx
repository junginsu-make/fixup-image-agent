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
  if (url.startsWith("/api/characters")) {
    return json({ ok: true, characters: [{
      id: "char-1", name: "호랑이", kind: "character", look: "3d", createdAt: "2026-10-08T01:00:00.000Z", mine: true,
      views: [
        { angle: "front", url: "https://img/char-front.png?token=a", thumbUrl: "https://img/char-front.thumb.webp" },
        { angle: "back", url: "https://img/char-back.jpg?token=b", thumbUrl: null },
      ],
    }, {
      id: "char-team", name: "팀원 캐릭터", kind: "person", look: "photoreal", createdAt: "2026-10-08T01:00:00.000Z", mine: false,
      views: [{ angle: "front", url: "https://img/team.png", thumbUrl: null }],
    }], angles: [{ id: "front", label: "정면" }, { id: "back", label: "뒷면" }] });
  }
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
      counts: { all: 4, easy: 0, poster: 1, sns: 1, ad: 1, create: 0, redesign: 0, character: 1 },
      easyKnown: true,
      charactersReady: true,
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

/**
 * **캐릭터도 생성 결과다**(2026-10-08 사용자 — 「이 시스템에서 생성한 모든 것은 생성 결과」). 「전체」에
 * 정면 한 장 카드로 섞여 나오고 숫자에도 든다. 누르면 각도를 넘겨 보고, 지우기는 캐릭터 만들기 화면이 한다.
 */
describe("캐릭터도 전체에", () => {
  it("전체에 캐릭터 카드가 정면 한 장으로 나온다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    expect(text()).toContain("호랑이");
    expect(text()).toContain("캐릭터");
  });

  it("누르면 모든 각도를 넘겨 본다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    const card = view.root.find((node) => typeof node.type === "string" && typeof node.props.onClick === "function"
      && String(node.props.className ?? "").includes("cursor-pointer")
      && node.findAll((child) => child.children.includes("호랑이")).length > 0);
    await act(async () => { card.props.onClick(); });
    await flush();
    const images = (gallery.open.mock.calls[0]![0] as { images: Array<{ src: string }> }).images;
    const request = gallery.open.mock.calls[0]![0] as { images: Array<{ src: string; name: string; meta: Array<[string, string]> }> };
    expect(images.map((image) => image.src)).toEqual(["https://img/char-front.png?token=a", "https://img/char-back.jpg?token=b"]);
    // 받을 때는 실제 형식대로 이름 붙인다(리뷰). 같은 그림이 캐릭터 화면에서와 다른 이름이면 안 된다.
    expect(request.images.map((image) => image.name)).toEqual(["호랑이 정면.png", "호랑이 뒷면.jpg"]);
    // 내 캐릭터는 「확인할 수 없음」 이 아니라 「나」.
    expect(request.images[0]!.meta).toContainEqual(["만든 사람", "나"]);
  });

  /**
   * 캐릭터는 캐릭터 표·각도 그림·참고 이미지에 함께 있다. 라이브러리 표로 보내면 한쪽만 사라지므로 **캐릭터 지우기
   * 주소**로 보낸다 — 그 주소가 셋을 함께 지운다(2026-10-09).
   */
  it("내 캐릭터는 캐릭터 지우기 주소로 지운다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    await pressDeleteAndConfirm("호랑이");
    expect(calls.filter((call) => call.method === "DELETE")).toEqual([
      { url: "/api/characters", method: "DELETE", body: JSON.stringify({ id: "char-1" }) },
    ]);
  });

  /**
   * **관리자는 남의 것도 지운다**(2026-10-09 사용자 — 「카드뉴스는 되는데 상세페이지·캐릭터는 안 된다」).
   * 상세페이지는 관리자 주소로, 캐릭터는 캐릭터 지우기 주소로(주인은 서버가 찾는다).
   */
  it("관리자는 남의 상세페이지와 캐릭터도 지울 수 있다", async () => {
    const DOC = "77777777-7777-4777-8777-777777777777";
    const OWNER = "99999999-9999-4999-8999-999999999999";
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      if (method === "DELETE") return json({ ok: true });
      if (url.startsWith("/api/showcase/manage")) return json({ ok: true, items: [] });
      if (url.startsWith("/api/admin/works")) return json({ ok: true, sns: [], poster: [], easyWorkIds: [] });
      if (url.startsWith("/api/admin/pdp-documents")) {
        return json({ ok: true, documents: [{ id: DOC, userId: OWNER, revision: 1, sourceDraftId: null, createdAt: stamp.createdAt,
          updatedAt: stamp.updatedAt, title: "남의 상세페이지", stage: "editor", sectionCount: 1, aspectRatio: "9:16", imageCount: 1,
          cover: null, mine: false, coverUrl: "https://img/live.png" }] });
      }
      if (url.startsWith("/api/characters")) {
        return json({ ok: true, characters: [{ id: "char-other", name: "남의 캐릭터", kind: "character", look: "3d",
          createdAt: stamp.createdAt, mine: false, ownerEmail: "m@example.com",
          views: [{ angle: "front", url: "https://img/other.png", thumbUrl: null }] }], angles: [{ id: "front", label: "정면" }] });
      }
      return reply(url, method);
    }));
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    await pressDeleteAndConfirm("남의 상세페이지");
    await pressDeleteAndConfirm("남의 캐릭터");
    expect(calls.filter((call) => call.method === "DELETE").map((call) => [call.url, call.body])).toEqual([
      [`/api/admin/pdp-documents/${DOC}?owner=${OWNER}`, undefined],
      ["/api/characters", JSON.stringify({ id: "char-other" })],
    ]);
  });

  it("관리자가 전체 회원을 보면 캐릭터도 전체 범위로 묻는다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ url, method });
      if (url.startsWith("/api/showcase/manage")) return json({ ok: true, items: [] });
      if (url.startsWith("/api/admin/works")) return json({ ok: true, sns: [], poster: [], easyWorkIds: [] });
      return reply(url, method);
    }));
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    expect(calls.some((call) => call.url === "/api/characters?scope=all")).toBe(true);
  });

  /** 첫 화면 갤러리는 작업물·카드뉴스·포스터만 건다. 캐릭터에 「첫 화면에 걸기」를 내면 눌러도 실패한다. */
  it("관리자에게도 캐릭터에는 「첫 화면에 걸기」가 없다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.startsWith("/api/showcase/manage")) return json({ ok: true, items: [] });
      if (url.startsWith("/api/admin/works")) return json({ ok: true, sns: [], poster: [], easyWorkIds: [] });
      return reply(url, method);
    }));
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    const card = view.root.find((node) => typeof node.type === "string" && typeof node.props.onClick === "function"
      && String(node.props.className ?? "").includes("cursor-pointer")
      && node.findAll((child) => child.children.includes("호랑이")).length > 0);
    await act(async () => { card.props.onClick(); });
    await flush();
    expect((gallery.open.mock.calls[0]![0] as { action?: unknown }).action).toBeUndefined();
  });
});

describe("캐릭터 — 테두리", () => {
  /** 회원 목록은 같은 팀 사람 것이 섞여 올 수 있다. 작업물처럼 내 것만 둔다. */
  it("회원 화면에서는 남의 캐릭터를 빼낸다", async () => {
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    expect(text()).not.toContain("팀원 캐릭터");
  });

  /** 캐릭터를 못 읽어도 다른 생성 결과는 그대로 나오고, 왜 캐릭터가 없는지 말한다. */
  it("캐릭터를 못 읽어도 다른 생성 결과는 나오고 까닭을 말한다", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/characters")) return new Response("{}", { status: 500 });
      return reply(url, init?.method ?? "GET");
    }));
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    expect(text()).toContain("포스터 하나");
    expect(text()).toContain("캐릭터를 불러오지 못했습니다");
  });

  /** 캐릭터가 늦게 와도 다른 생성 결과는 먼저 그린다(리뷰). 캐릭터는 도착하는 대로 더한다. */
  it("캐릭터를 기다리지 않고 다른 생성 결과를 먼저 그린다", async () => {
    let release: (value: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/characters")) return new Promise<Response>((resolve) => { release = resolve; });
      return reply(url, init?.method ?? "GET");
    }));
    await act(async () => { view = create(<WorksTab />); });
    await flush();
    expect(text()).toContain("포스터 하나");
    expect(text()).not.toContain("호랑이");
    await act(async () => { release(reply("/api/characters", "GET")); });
    await flush();
    expect(text()).toContain("호랑이");
  });
});

/**
 * **캐릭터를 받는 동안**(리뷰). 다른 생성 결과를 먼저 그리고 캐릭터는 나중에 더하므로, 그 사이 「캐릭터」를
 * 누르면 「없다」가 아니라 「불러오는 중」을 보이고, 숫자는 도착한 뒤에 단다(0 이었다가 바뀌지 않게).
 */
describe("캐릭터를 받는 동안", () => {
  it("「캐릭터」는 불러오는 중이라고 말하고, 숫자는 아직 모른다고 알린다", async () => {
    let release: (value: Response) => void = () => undefined;
    const onSummary = vi.fn();
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/characters")) return new Promise<Response>((resolve) => { release = resolve; });
      return reply(url, init?.method ?? "GET");
    }));
    await act(async () => { view = create(<WorksTab filter="character" onSummary={onSummary} />); });
    await flush();
    expect(text()).toContain("캐릭터를 불러오는 중입니다");
    expect(text()).not.toContain("없습니다");
    expect(onSummary).toHaveBeenLastCalledWith(expect.objectContaining({ charactersReady: false }));
    await act(async () => { release(reply("/api/characters", "GET")); });
    await flush();
    expect(text()).toContain("호랑이");
    expect(onSummary).toHaveBeenLastCalledWith(expect.objectContaining({ charactersReady: true }));
  });

  it("캐릭터가 하나도 없으면 「아직 만든 캐릭터가 없습니다」", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/characters")) return json({ ok: true, characters: [], angles: [] });
      return reply(url, init?.method ?? "GET");
    }));
    await act(async () => { view = create(<WorksTab filter="character" />); });
    await flush();
    expect(text()).toContain("아직 만든 캐릭터가 없습니다.");
  });
});

/** 카드의 지우기 단추를 누르고 확인 창의 「지웁니다」를 누른다. */
async function pressDeleteAndConfirm(name: string) {
  const corner = view.root.find((node) => node.type === "button" && node.props["aria-label"] === `${name} 지우기`);
  await act(async () => { corner.props.onClick({ stopPropagation() {} }); });
  await flush();
  const confirm = view.root.findAll((node) => node.type === "button" && node.findAll((child) => child.children.includes("지웁니다")).length > 0).at(-1)!;
  await act(async () => { confirm.props.onClick(); });
  await flush();
}
