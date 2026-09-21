import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StyleReferenceManager } from "../StyleReferenceManager";

/**
 * **200개 뒤가 조용히 사라졌다**(C-7).
 *
 * 목록은 앞 200장만 받아 왔고, 화면은 받은 수를 그대로 「N장」이라고 적었다.
 * 240장을 올린 사용자는 **「200장」이라는 말과 함께 40장을 잃어버린다.**
 * 어디에도 더 있다는 표시가 없으니, 올린 것이 사라진 줄 안다.
 *
 * 설계 §12: 「레퍼런스 목록은 pagination 을 제공한다. **200개 이후 보이지 않게
 * 숨기지 않는다.**」
 */

vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

let renderer: ReactTestRenderer;
const flush = async () => {
  for (let i = 0; i < 6; i++) await act(async () => { await new Promise<void>((r) => setImmediate(r)); });
};

/** 어떤 주소로 물었는지. 두 번째 쪽을 정말로 달라고 하는지 본다. */
let 물은주소: string[] = [];

function 표(총: number, 한쪽: number) {
  vi.stubGlobal("fetch", async (url: string) => {
    물은주소.push(url);
    const offset = Number(new URL(url, "http://localhost").searchParams.get("offset") ?? 0);
    const references = Array.from({ length: Math.min(한쪽, 총 - offset) }, (_, i) => ({
      id: `s${offset + i}`,
      name: `레퍼런스 ${offset + i}`,
      source: "upload",
      description: "d",
      createdAt: "2026-01-01",
      url: `signed:${offset + i}`,
    }));
    return {
      json: async () => ({
        ok: true,
        references,
        total: 총,
        nextOffset: offset + 한쪽 < 총 ? offset + 한쪽 : null,
      }),
    };
  });
}

beforeEach(() => {
  물은주소 = [];
  vi.stubGlobal("React", React);
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

const 그리기 = async () => {
  await act(async () => { renderer = create(<StyleReferenceManager />); });
  await flush();
  return JSON.stringify(renderer.toJSON());
};

/** 글이 적힌 단추를 찾아 누른다. */
async function 누르기(글: string) {
  const button = renderer.root.findAll((node) => node.type === "button" && Boolean(node.props["data-more"]))[0];
  expect(button, `「${글}」 단추가 없다`).toBeTruthy();
  await act(async () => { button!.props.onClick?.({}); });
  await flush();
}

describe("가진 것이 보이는 것보다 많을 때", () => {
  it("**가진 수를 말한다** — 보이는 수를 전체라고 하면 거짓말이다", async () => {
    표(240, 100);

    const 글 = await 그리기();

    expect(글).toContain("240");
  });

  it("**더 볼 길을 준다**", async () => {
    표(240, 100);

    const 글 = await 그리기();

    expect(글).toContain("더 보기");
  });

  it("**누르면 다음 쪽을 달라고 한다**", async () => {
    표(240, 100);
    await 그리기();

    await 누르기("더 보기");

    expect(물은주소.some((url) => url.includes("offset=100"))).toBe(true);
  });

  it("**받아 온 것이 앞의 것에 더해진다** — 갈아 끼우면 앞쪽이 사라진다", async () => {
    표(240, 100);
    await 그리기();

    await 누르기("더 보기");
    const 글 = JSON.stringify(renderer.toJSON());

    expect(글).toContain("레퍼런스 0");
    expect(글).toContain("레퍼런스 100");
  });

  it("**끝까지 보면 더 보기가 사라진다**", async () => {
    표(150, 100);
    await 그리기();

    await 누르기("더 보기");
    const 글 = JSON.stringify(renderer.toJSON());

    expect(글).not.toContain("더 보기");
  });
});

describe("한 쪽에 다 들어갈 때", () => {
  it("더 보기를 안 띄운다", async () => {
    표(3, 100);

    const 글 = await 그리기();

    expect(글).not.toContain("더 보기");
    expect(글).toContain("3");
  });
});

/**
 * **지운 뒤에도 숫자가 맞아야 한다.**
 *
 * 배지는 「보이는 수 / 가진 수」다. 지울 때 보이는 수만 줄이면 3장 중 1장을
 * 지웠을 때 「2 / 3장」이 되어, **1장이 어딘가 숨어 있다고 거짓말**한다.
 * 고치기 전 배지(받은 배열의 길이)는 이 경우 맞았으니 회귀다.
 */
describe("지운 뒤의 숫자", () => {
  it("**가진 수도 함께 준다**", async () => {
    표(3, 100);
    await 그리기();
    vi.stubGlobal("window", { confirm: () => true });
    // 삭제 응답
    vi.stubGlobal("fetch", async () => ({ json: async () => ({ ok: true, deleted: true }) }));

    const 지우기 = renderer.root
      .findAll((node) => node.type === "button" && Boolean(node.props["data-delete"]))[0];
    expect(지우기, "지우기 단추가 없다").toBeTruthy();
    await act(async () => { 지우기!.props.onClick?.({}); });
    await flush();

    const 글 = JSON.stringify(renderer.toJSON());
    // 2장이 남았고 가진 것도 2장이다. 「2 / 3장」이면 거짓말이다.
    expect(글).not.toContain("2 / 3");
    expect(글).toContain("2장");
  });
});
