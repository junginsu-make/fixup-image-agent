import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **라이브러리에서도 200개 뒤가 사라졌다**(C-7).
 *
 * 라이브러리는 디자인 레퍼런스도 한 줄짜리 항목으로 싣는다. 목록 API 가 앞
 * 200장만 주던 시절에는 그 뒤가 **아무 표시 없이 없는 것이 됐다.** 사용자에게는
 * 「분명 올렸는데 라이브러리엔 없다」가 된다.
 *
 * 설계 §12: 「레퍼런스 목록은 pagination 을 제공한다. 200개 이후 보이지 않게
 * 숨기지 않는다.」
 */

const 물은주소: string[] = [];

/** 쪽으로 나눠 주는 서버를 흉내 낸다. */
function 표(총: number, 한쪽: number) {
  vi.stubGlobal("fetch", async (url: string) => {
    물은주소.push(String(url));
    if (!String(url).startsWith("/api/pdp/style-references")) {
      return { ok: true, json: async () => ({ ok: true }) };
    }
    const offset = Number(new URL(String(url), "http://localhost").searchParams.get("offset") ?? 0);
    const references = Array.from({ length: Math.max(0, Math.min(한쪽, 총 - offset)) }, (_, i) => ({
      id: `s${offset + i}`,
      name: `레퍼런스 ${offset + i}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      url: `signed:${offset + i}`,
    }));
    return {
      ok: true,
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
  물은주소.length = 0;
  vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => {} } });
});
afterEach(() => vi.unstubAllGlobals());

describe("라이브러리가 레퍼런스를 모을 때", () => {
  it("**끝까지 따라간다** — 앞 한 쪽만 싣고 나머지를 버리지 않는다", async () => {
    표(240, 100);
    const { loadLibrary } = await import("../library");

    const items = await loadLibrary();

    const references = items.filter((item) => item.tool === "reference");
    expect(references).toHaveLength(240);
  });

  it("**자리를 옮겨 가며 묻는다**", async () => {
    표(240, 100);
    const { loadLibrary } = await import("../library");

    await loadLibrary();

    const 레퍼런스요청 = 물은주소.filter((url) => url.startsWith("/api/pdp/style-references"));
    expect(레퍼런스요청.some((url) => url.includes("offset=100"))).toBe(true);
    expect(레퍼런스요청.some((url) => url.includes("offset=200"))).toBe(true);
  });

  /**
   * **끝없이 돌지 않는다.** 서버가 `nextOffset` 을 잘못 주는 날에도 화면이
   * 멈추지는 않아야 한다.
   */
  it("**아주 많으면 어느 선에서 멈춘다**", async () => {
    표(100_000, 100);
    const { loadLibrary } = await import("../library");

    await loadLibrary();

    const 레퍼런스요청 = 물은주소.filter((url) => url.startsWith("/api/pdp/style-references"));
    expect(레퍼런스요청.length).toBeLessThanOrEqual(20);
  });

  it("한 쪽에 다 들어가면 한 번만 묻는다", async () => {
    표(5, 100);
    const { loadLibrary } = await import("../library");

    await loadLibrary();

    expect(물은주소.filter((url) => url.startsWith("/api/pdp/style-references"))).toHaveLength(1);
  });
});
