import { beforeEach, describe, expect, it, vi } from "vitest";
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
const removed: string[] = [];
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
        remove: async (paths: string[]) => { removed.push(...paths); return { error: null }; },
        // 서명은 서버 권한으로 한다. 회원 세션으로는 팀원의 파일에 서명할 수
        // 없기 때문이다 — Storage 정책이 경로 첫 칸을 소유자로 본다.
        createSignedUrl: async () => ({ data: { signedUrl: "signed" }, error: null }),
        createSignedUrls: async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })),
          error: null,
        }),
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
    // 서명은 여기서 안 한다. 세션 클라이언트가 맡는 것은 DB 뿐이다.
  }),
}));

vi.mock("../watermark", () => ({ markAsAi: async (b: Buffer) => b }));

const {
  createQueuedGenerationDependencies,
  localResultUrlForTest,
  refreshProjectAssetUrls,
} = await import("../sns/runtime");

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
  uploads.length = 0; cardUpdates.length = 0; localWrites.length = 0; removed.length = 0;
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
    // **같은 자리의 옛 파일을 지운다.** 자리를 비우면서 파일을 남기면 그것을
    // 가리키는 것이 아무것도 없어져 영영 남는다.
    expect(removed).toContain("u1/sns/p1/1.thumb.webp");
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

describe("로컬 주소 만들기", () => {
  it("미리보기는 번호만 떼고 표시를 붙인다", () => {
    // 이름을 통째로 번호로 넘기면 `Number("1.thumb.webp")` 가 NaN 이 되어
    // 404 가 난다 — 로컬 목록의 표지가 통째로 깨진다.
    expect(localResultUrlForTest("u1/sns/p1/1.thumb.webp"))
      .toBe("/api/sns/projects/p1/cards/1/file?size=thumb");
  });

  it("원본은 예전 그대로다", () => {
    expect(localResultUrlForTest("u1/sns/p1/1.png"))
      .toBe("/api/sns/projects/p1/cards/1/file");
  });
});

function projectWithCards(cards: Array<Record<string, unknown>>) {
  return {
    ...project(),
    data: { source: { kind: "text", text: "본문" }, attachments: [], flow: { stage: "result", cards } },
  } as never;
}

describe("refreshProjectAssetUrls — 결과판도 미리보기를 받는다", () => {
  it("만든 카드에 미리보기 주소를 붙인다", async () => {
    // **결과판이 이 함수를 반드시 지난다.** 여기서 안 붙이면 카드 열 장을
    // 원본으로 받는 상태가 그대로다 — 이 변경의 목적이 바로 그것이었다.
    const refreshed = await refreshProjectAssetUrls(projectWithCards([
      { index: 1, kind: "generated", assetPath: "u1/sns/p1/1.png", thumbPath: "u1/sns/p1/1.thumb.webp" },
    ]));

    const card = refreshed.data.flow!.cards[0]!;
    expect(card.assetUrl).toBeTruthy();
    expect(card.thumbUrl).toBeTruthy();
    expect(card.thumbUrl).not.toBe(card.assetUrl);
  });

  it("미리보기가 없는 옛 카드는 그대로 둔다", async () => {
    const refreshed = await refreshProjectAssetUrls(projectWithCards([
      { index: 1, kind: "generated", assetPath: "u1/sns/p1/1.png" },
    ]));

    expect(refreshed.data.flow!.cards[0]!.thumbUrl).toBeUndefined();
  });

  it("사용자가 넣은 카드에는 미리보기를 붙이지 않는다 — 보이는 그림과 확대가 달라진다", async () => {
    // `place_as_is` 카드의 `assetUrl` 은 letterbox 결과가 아니라 **첨부 원본**을
    // 가리킨다. 거기에 letterbox 결과의 미리보기를 짝지으면 화면에 뜨는 그림과
    // 확대·내려받기가 서로 다른 그림이 된다.
    const refreshed = await refreshProjectAssetUrls(projectWithCards([
      { index: 1, kind: "place_as_is", assetPath: "u1/sns/p1/1.png", thumbPath: "u1/sns/p1/1.thumb.webp" },
    ]));

    expect(refreshed.data.flow!.cards[0]!.thumbUrl).toBeUndefined();
  });
});
