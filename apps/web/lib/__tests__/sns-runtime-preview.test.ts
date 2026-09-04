import { beforeEach, describe, expect, it, vi } from "vitest";
// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";

/**
 * 미리보기를 **실제로 부르고 있는가.**
 *
 * `thumbnail.ts` 가 아무리 잘 지켜져도 아무도 안 부르면 소용이 없다. 그런데
 * `updateCard` 가 `thumb_path` 를 안 쓰기만 해도 기능 전체가 조용히 죽는다 —
 * 미리보기 파일은 계속 만들어져 올라가지만 그 자리를 아는 행이 없어서, 화면은
 * 예전처럼 원본을 받고 저장소에는 아무도 못 찾는 파일이 쌓인다. **실패 신호가
 * 없다.**
 */

vi.mock("server-only", () => ({}));

const uploads: Array<{ path: string; contentType: string }> = [];
const cardUpdates: Array<Record<string, unknown>> = [];
const localWrites: string[] = [];
let local = false;
let failPreviewUpload = false;

vi.mock("../local-store", () => ({
  isLocalStoreEnabled: () => local,
  localStoreRoot: () => "/tmp",
  getLocalDatabase: () => ({}),
  updateLocalSnsCard: async (_db: unknown, _u: string, _p: string, _i: number, patch: Record<string, unknown>) => {
    cardUpdates.push(patch);
  },
  writeLocalSnsResultFile: async (_r: string, u: string, p: string, i: number) => {
    const path = `${u}/sns/${p}/${i}.png`;
    localWrites.push(path);
    return path;
  },
  writeLocalSnsPreviewFile: async (_r: string, u: string, p: string, i: number) => {
    const path = `${u}/sns/${p}/${i}.thumb.webp`;
    localWrites.push(path);
    return path;
  },
  readLocalSnsResultFile: async () => Buffer.alloc(0),
}));

vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string, _b: Buffer, o: { contentType: string }) => {
          if (failPreviewUpload && path.includes(".thumb.")) return { error: { message: "실패" } };
          uploads.push({ path, contentType: o.contentType });
          return { error: null };
        },
      }),
    },
  }),
}));

vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const self: Record<string, unknown> = {
        update: (patch: Record<string, unknown>) => { cardUpdates.push(patch); return self; },
        eq: () => self,
        then: (r: (x: unknown) => unknown) => Promise.resolve(r({ error: null })),
      };
      return self;
    },
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: "signed" }, error: null }) }) },
  }),
}));

vi.mock("../watermark", () => ({ markAsAi: async (b: Buffer) => b }));

const { createQueuedGenerationDependencies } = await import("../sns/runtime");

async function card(): Promise<Buffer> {
  const width = 600, height = 750;
  const pixels = Buffer.alloc(width * height * 4);
  let seed = 3;
  const noise = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % 24; };
  for (let i = 0; i < width * height; i += 1) {
    pixels[i * 4] = Math.min(255, (i % width) % 200 + noise());
    pixels[i * 4 + 1] = Math.min(255, 120 + noise());
    pixels[i * 4 + 2] = Math.min(255, 80 + noise());
    pixels[i * 4 + 3] = 255;
  }
  return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

function project(): SnsProjectRecord {
  return {
    id: "p1", userId: "u1", title: "t", status: "copy_ready",
    ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "fixed", cardCount: 1,
    data: { source: { kind: "text", text: "본문" }, attachments: [] },
    slotPlan: { total: 1, cover: 1, placeAsIs: 0, aiBody: 0, ending: 0, issues: [] },
    createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z",
  } as never;
}

async function runtime() {
  return createQueuedGenerationDependencies({
    userId: "u1",
    project: project(),
    requestStore: {} as never,
    providers: {} as never,
  });
}

beforeEach(() => {
  uploads.length = 0; cardUpdates.length = 0; localWrites.length = 0;
  local = false; failPreviewUpload = false;
});

describe("saveAsset — 미리보기 배선", () => {
  it("원본과 미리보기를 함께 올리고 자리를 표에 적는다", async () => {
    const dependencies = await runtime();

    await dependencies.saveAsset(
      `data:image/png;base64,${(await card()).toString("base64")}` as never,
      { index: 1, kind: "generated" } as never,
    );

    expect(uploads.map((u) => u.path)).toEqual(["u1/sns/p1/1.png", "u1/sns/p1/1.thumb.webp"]);
    expect(uploads[1]!.contentType).toBe("image/webp");
    // **자리를 안 적으면 기능이 통째로 죽는다.** 파일은 쌓이는데 아무도 못 찾는다.
    expect(cardUpdates.some((patch) => patch.thumb_path === "u1/sns/p1/1.thumb.webp")).toBe(true);
  });

  it("미리보기만 못 올리면 자리를 비워 둔다 — 없는 파일을 가리키면 안 된다", async () => {
    failPreviewUpload = true;
    const dependencies = await runtime();

    await dependencies.saveAsset(
      `data:image/png;base64,${(await card()).toString("base64")}` as never,
      { index: 1, kind: "generated" } as never,
    );

    expect(uploads.map((u) => u.path)).toEqual(["u1/sns/p1/1.png"]);
    expect(cardUpdates.some((patch) => patch.thumb_path === null)).toBe(true);
  });

  it("로컬 모드도 미리보기를 만든다 — 개발 환경 전체가 이 갈래로 돈다", async () => {
    local = true;
    const dependencies = await runtime();

    await dependencies.saveAsset(
      `data:image/png;base64,${(await card()).toString("base64")}` as never,
      { index: 1, kind: "generated" } as never,
    );

    expect(localWrites).toEqual(["u1/sns/p1/1.png", "u1/sns/p1/1.thumb.webp"]);
    expect(cardUpdates.some((patch) => patch.thumbPath === "u1/sns/p1/1.thumb.webp")).toBe(true);
  });
});
