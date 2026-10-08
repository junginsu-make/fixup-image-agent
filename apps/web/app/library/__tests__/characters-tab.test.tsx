import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gallery = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock("../../_components/image-viewer", () => ({ openImageGallery: gallery.open }));
vi.mock("../../_components/thumb-image", () => ({
  ThumbImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

import { CharactersTab } from "../characters-tab";

/**
 * **라이브러리의 캐릭터 화면**(2026-10-08 사용자 요청).
 *
 * - 최고 관리자는 모든 회원의 캐릭터를 본다(사용자가 여러 번 말함) — `scope=all` 로 묻는다
 * - 카드에는 정면 한 장만, 누르면 큰 창에서 옆으로 넘겨 각도·다각도를 본다(작업물·상세페이지와 같다)
 */
const views = (id: string) => [
  { angle: "front", url: `https://img/${id}-front.png`, thumbUrl: `https://img/${id}-front.thumb.webp` },
  { angle: "left_45", url: `https://img/${id}-left.png`, thumbUrl: null },
  { angle: "sheet", url: `https://img/${id}-sheet.png`, thumbUrl: null },
];
const characters = [
  { id: "c1", name: "호랑이", kind: "character", look: "3d", createdAt: "2026-10-01T00:00:00.000Z", mine: true, views: views("c1") },
  { id: "c2", name: "남의 고양이", kind: "animal", look: "anime", createdAt: "2026-10-07T00:00:00.000Z", mine: false, ownerEmail: "other@example.com", views: views("c2") },
];
const urls: string[] = [];

let view: ReactTestRenderer;
const flush = async () => { for (let i = 0; i < 10; i += 1) await act(async () => { await new Promise<void>((resolve) => setImmediate(resolve)); }); };
const text = () => JSON.stringify(view.toJSON());

beforeEach(() => {
  urls.length = 0;
  gallery.open.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    urls.push(url);
    return new Response(JSON.stringify({
      ok: true, characters,
      angles: [{ id: "front", label: "정면" }, { id: "left_45", label: "왼쪽 45°" }],
      sheet: { id: "sheet", label: "다각도 한 장" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }));
});
afterEach(() => { act(() => view?.unmount()); vi.unstubAllGlobals(); });

async function open() {
  await act(async () => { view = create(<CharactersTab />); });
  await flush();
}
const card = (name: string) => view.root.find((node) => node.type === "button"
  && node.props["aria-label"] === `${name} 크게 보기`);

describe("라이브러리 캐릭터", () => {
  it("전체 회원 범위로 묻는다 — 서버가 관리자에게만 넓힌다", async () => {
    await open();
    expect(urls).toEqual(["/api/characters?scope=all"]);
  });

  it("카드마다 정면 한 장만 보인다", async () => {
    await open();
    const images = view.root.findAll((node) => node.type === "img");
    expect(images.map((image) => image.props.src)).toEqual([
      "https://img/c1-front.thumb.webp",
      "https://img/c2-front.thumb.webp",
    ]);
  });

  it("남의 캐릭터에는 만든 사람을 적는다", async () => {
    await open();
    expect(text()).toContain("other@example.com");
  });

  it("누르면 큰 창에서 모든 장을 넘겨 본다 — 정면이 먼저", async () => {
    await open();
    await act(async () => { card("호랑이").props.onClick(); });
    const images = (gallery.open.mock.calls[0]![0] as { images: Array<{ src: string; alt: string }> }).images;
    expect(images.map((image) => image.src)).toEqual([
      "https://img/c1-front.png", "https://img/c1-left.png", "https://img/c1-sheet.png",
    ]);
    // 이름표는 서버가 준 말이다. 다각도도 「sheet」 가 아니라 이름으로 적는다.
    expect(images.map((image) => image.alt)).toEqual(["호랑이 · 정면", "호랑이 · 왼쪽 45°", "호랑이 · 다각도 한 장"]);
  });

  it("장수를 적는다", async () => {
    await open();
    const badges = view.root.findAll((node) => typeof node.type === "string" && node.children.join("") === "3장");
    expect(badges.length).toBeGreaterThan(0);
  });
});
