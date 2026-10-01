import { describe, expect, it, vi } from "vitest";
import { createFalUploader, uploadUniqueReferences } from "../upload";
import type { FalRouter } from "../route";

const 길 = (key: string): FalRouter => ({
  submit: vi.fn(),
  routeOf: vi.fn(),
  finished: vi.fn(),
  uploadRoute: async () => ({ accountId: "acct", key }),
});

describe("공용 fal 업로드", () => {
  it("바이트를 fal에 올리고 짧게 쓸 URL을 돌려준다 — 키는 router 가 고른다", async () => {
    const upload = vi.fn(async () => "https://v3b.fal.media/reference.png");
    const configs: unknown[] = [];
    const uploader = createFalUploader(길("key-a"), (config) => { configs.push(config); return { storage: { upload } } as never; });

    const url = await uploader.uploadReference(new Uint8Array([1, 2, 3]), "image/png");

    expect(url).toBe("https://v3b.fal.media/reference.png");
    expect(configs).toEqual([{ credentials: "key-a", retry: { maxRetries: 0 } }]);
    expect(upload).toHaveBeenCalledWith(expect.any(Blob), { lifecycle: { expiresIn: "1h" } });
  });

  it("같은 배치에서 같은 키는 한 번만 올린다", async () => {
    const upload = vi.fn(async (item: { id: string }) => `https://fal.media/${item.id}`);
    const urls = await uploadUniqueReferences(
      [{ id: "same" }, { id: "same" }, { id: "other" }],
      (item) => item.id,
      upload,
    );

    expect(upload).toHaveBeenCalledTimes(2);
    expect(urls).toEqual({ same: "https://fal.media/same", other: "https://fal.media/other" });
  });
});
