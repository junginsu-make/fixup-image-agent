import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const gallery = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: { children: React.ReactNode } & Record<string, unknown>) => <a {...props}>{children}</a>,
}));
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
/** 카드 본문. 작업물 카드처럼 **어디를 눌러도** 큰 창이 열린다. */
const card = (name: string) => view.root.find((node) => typeof node.type === "string"
  && typeof node.props.onClick === "function"
  && String(node.props.className ?? "").includes("cursor-pointer")
  && node.findAll((child) => child.children.includes(name)).length > 0);

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

/**
 * **작업물 카드와 같은 느낌**(2026-10-08 사용자 보고 — 「누르면 새 페이지가 열리는 것 같다」).
 * 전에는 그림만 눌렸고 아래 「과정 보기」 글자를 누르면 상세 페이지로 넘어갔다. 이제 카드 어디를
 * 눌러도 큰 창이고, 「과정 보기」는 작업물처럼 모서리 아이콘이다.
 */
describe("작업물 카드와 같은 모양", () => {
  it("카드 이름 쪽을 눌러도 큰 창이 열린다", async () => {
    await open();
    await act(async () => { card("남의 고양이").props.onClick(); });
    expect(gallery.open).toHaveBeenCalledTimes(1);
  });

  it("「과정 보기」는 모서리 아이콘이고, 누르면 카드의 큰 창은 안 열린다", async () => {
    await open();
    const steps = view.root.find((node) => node.props["aria-label"] === "호랑이 과정 보기");
    expect(steps.props.href).toBe("/characters/c1");
    // 이 렌더러는 이벤트를 위로 흘리지 않는다. 그래서 흘림을 막는지를 직접 본다.
    const stopPropagation = vi.fn();
    await act(async () => { steps.props.onClick({ stopPropagation }); });
    expect(stopPropagation).toHaveBeenCalled();
    expect(gallery.open).not.toHaveBeenCalled();
  });

  it("아래쪽 글자 단추 「과정 보기」는 없다", async () => {
    await open();
    const texts = view.root.findAll((node) => node.type === "a" && node.children.join("") === "과정 보기");
    expect(texts).toEqual([]);
  });
});

/** 키보드로도 연다(독립 리뷰). 전에는 그림이 진짜 단추라 Tab·Enter 로 열렸다. */
describe("키보드", () => {
  it("카드에 닿아 Enter·Space 로 큰 창을 연다", async () => {
    await open();
    const target = card("호랑이");
    expect(target.props.tabIndex).toBe(0);
    expect(target.props.role).toBe("button");
    await act(async () => { target.props.onKeyDown({ key: "Enter", preventDefault() {} }); });
    await act(async () => { target.props.onKeyDown({ key: " ", preventDefault() {} }); });
    expect(gallery.open).toHaveBeenCalledTimes(2);
  });

  /** 남의 캐릭터는 보기 전용이다. 「다시 만들 수 있다」 는 내 것에만 맞는 말이다. */
  it("남의 캐릭터 말풍선은 다시 만들기를 약속하지 않는다", async () => {
    await open();
    const other = view.root.find((node) => node.props["aria-label"] === "남의 고양이 과정 보기");
    const words = other.findAll((node) => node.type === "span")
      .flatMap((node) => node.children.filter((child): child is string => typeof child === "string"))
      .join("");
    expect(words).toContain("만들 때 쓴 설정과 각도를 봅니다.");
    expect(words).not.toContain("다시 만들 수 있습니다");
  });
});
