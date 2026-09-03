import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLibraryImages, resetLibraryImagesCache } from "../library-images";

/**
 * 한 화면에 그림 고르는 자리가 둘이다 — 로고 칸과 「이 레퍼런스처럼」.
 * 각자 부르면 같은 목록을 두 번 받아 온다.
 */

function respondWith(payload: unknown, delayMs = 0): typeof fetch {
  return vi.fn(async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return { json: async () => payload } as Response;
  }) as unknown as typeof fetch;
}

afterEach(() => {
  resetLibraryImagesCache();
  vi.restoreAllMocks();
});

describe("fetchLibraryImages", () => {
  it("목록을 그대로 돌려준다", async () => {
    const images = [{ id: "a", title: "로고", signedUrl: "/file/a" }];
    const fetcher = respondWith({ ok: true, images });

    expect(await fetchLibraryImages(fetcher)).toEqual(images);
  });

  it("같이 부르면 한 번만 받아 온다", async () => {
    const fetcher = respondWith({ ok: true, images: [] }, 5);

    const [first, second] = await Promise.all([fetchLibraryImages(fetcher), fetchLibraryImages(fetcher)]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it("끝난 뒤에 다시 부르면 새로 받아 온다", async () => {
    // 방금 라이브러리에 올린 그림이 안 보이면 안 된다. 한 번 받고 영영 굳히지 않는다.
    const fetcher = respondWith({ ok: true, images: [] });

    await fetchLibraryImages(fetcher);
    await fetchLibraryImages(fetcher);

    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("서버가 못 하겠다고 하면 그 이유를 던진다", async () => {
    const fetcher = respondWith({ ok: false, message: "권한이 없습니다." });

    await expect(fetchLibraryImages(fetcher)).rejects.toThrow("권한이 없습니다.");
  });

  it("실패한 뒤에는 다시 시도할 수 있다", async () => {
    const broken = vi.fn(async () => { throw new Error("끊김"); }) as unknown as typeof fetch;
    await expect(fetchLibraryImages(broken)).rejects.toThrow("끊김");

    const working = respondWith({ ok: true, images: [{ id: "a", title: null, signedUrl: null }] });
    expect(await fetchLibraryImages(working)).toHaveLength(1);
  });
});
