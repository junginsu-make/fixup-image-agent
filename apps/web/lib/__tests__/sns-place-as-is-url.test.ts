import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";

/**
 * **「그대로 넣기」 카드는 저장된 웹 주소로 서버가 아무 데나 받으러 가면 안 된다**(2026-10-03 SSRF 리뷰).
 *
 * 카드의 `assetUrl` 은 작업 데이터(`sns_projects.data`)에 들어 있고 회원이 그 칸을 직접 고칠 수 있다.
 * 생성할 때 서버가 그 주소를 그대로 `fetch` 하면, 회원이 적은 주소(내부망·메타데이터 주소·거대한 파일)로
 * 우리 서버가 요청을 보낸다. 원본은 **저장소 위치**(첨부 원본 → 카드에 적힌 내 폴더 위치)로 읽는다 —
 * 전에도 그 위치를 서명한 주소를 썼으므로 결과물은 같다.
 */
vi.mock("server-only", () => ({}));
// 회원이 지운 첨부 대조(2026-10-08)는 `sns-refresh-retired.test.ts` 가 잰다 — 여기서는 지운 것이 없다.
vi.mock("../sns/retired-attachments", () => ({ retiredAttachmentPaths: async () => new Set() }));
vi.mock("../local-store", () => ({
  isLocalStoreEnabled: () => false,
  localStoreRoot: () => "/tmp",
  getLocalDatabase: () => ({}),
  readLocalSnsResultFile: async () => Buffer.alloc(0),
  readLocalReferenceFile: async () => Buffer.alloc(0),
}));
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async () => ({ error: null }),
        remove: async () => ({ error: null }),
        createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://storage.test/signed/${path}` }, error: null }),
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `https://storage.test/signed/${path}` })), error: null }),
      }),
    },
  }),
}));
vi.mock("../supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => {
      const self: Record<string, unknown> = { update: () => self, eq: () => self, then: (r: (x: unknown) => unknown) => Promise.resolve(r({ error: null })) };
      return self;
    },
  }),
}));
vi.mock("../watermark", () => ({ markAsAi: async (b: Buffer) => b }));

const { createQueuedGenerationDependencies, refreshProjectAssetUrls } = await import("../sns/runtime");

const INTERNAL = "http://169.254.169.254/latest/meta-data/";
const fetched: string[] = [];
let body: () => BodyInit = () => new Uint8Array();
let declaredLength: string | null = null;
let png = Buffer.alloc(0);

function project(cards: Array<Record<string, unknown>>, attachments: Array<Record<string, unknown>> = []): SnsProjectRecord {
  return {
    id: "p1", userId: "u1", title: "t", status: "copy_ready",
    ratio: "4:5", language: "ko", modelId: "nano-banana", cardCountMode: "fixed", cardCount: 1,
    data: { source: { kind: "text", text: "본문" }, attachments, flow: { stage: "copy", cards } },
    slotPlan: { total: 1, cover: 0, placeAsIs: 1, aiBody: 0, ending: 0, issues: [] },
    createdAt: "2026-10-03T00:00:00.000Z", updatedAt: "2026-10-03T00:00:00.000Z",
  } as never;
}

const placeCard = (over: Record<string, unknown> = {}) =>
  ({ index: 1, kind: "place_as_is", role: "body", copy: { index: 1, headline: "h" }, ...over }) as never;

async function dependenciesFor(attachments: Array<Record<string, unknown>> = []) {
  return createQueuedGenerationDependencies({
    userId: "u1", project: project([], attachments), requestStore: {} as never, providers: {} as never,
  });
}

beforeEach(async () => {
  fetched.length = 0;
  declaredLength = null;
  png = await sharp({ create: { width: 40, height: 50, channels: 3, background: "#2277cc" } }).png().toBuffer();
  body = () => png;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    fetched.push(String(url));
    const headers: Record<string, string> = { "content-type": "image/png" };
    if (declaredLength) headers["content-length"] = declaredLength;
    return new Response(body(), { headers });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("「그대로 넣기」 — 저장된 웹 주소로 받으러 가지 않는다", () => {
  it("열거나 생성할 때 고쳐 쓴 주소가 남지 않는다 — 첨부도 내 폴더 위치도 없으면 주소를 비운다", async () => {
    const refreshed = await refreshProjectAssetUrls(project([placeCard({ assetUrl: INTERNAL })]));
    expect(refreshed.data.flow!.cards[0]!.assetUrl ?? "").not.toBe(INTERNAL);
  });

  it("생성(원본 넣기)은 저장된 웹 주소로 서버가 받으러 가지 않는다", async () => {
    const dependencies = await dependenciesFor();
    await expect(dependencies.saveOriginal(placeCard({ assetUrl: INTERNAL }))).rejects.toThrow();
    expect(fetched).toEqual([]);
  });

  it("남의 폴더 위치만 있으면 받지 않는다", async () => {
    const dependencies = await dependenciesFor([{ id: "a1", kind: "place_as_is", assetPath: "u9/references/x.png", url: "" }]);
    await expect(dependencies.saveOriginal(placeCard({ attachmentId: "a1", assetPath: "u9/sns/p/1.png", assetUrl: INTERNAL })))
      .rejects.toThrow();
    expect(fetched).toEqual([]);
  });
});

describe("「그대로 넣기」 — 정상 원본은 지금처럼 들어간다", () => {
  it("첨부가 있으면 첨부 원본을 저장소 위치로 읽는다(카드에 적힌 주소는 안 본다)", async () => {
    const dependencies = await dependenciesFor([{ id: "a1", kind: "place_as_is", assetPath: "u1/references/a1.png", url: "x" }]);
    // 카드 위치(지난 결과)와 첨부 원본이 다르다 — 원본(첨부)을 먼저 읽어야 다시 만들기가 결과를 또 접지 않는다.
    const saved = await dependencies.saveOriginal(placeCard({ attachmentId: "a1", assetPath: "u1/sns/p1/1.png", assetUrl: INTERNAL }));
    expect(fetched).toEqual(["https://storage.test/signed/u1/references/a1.png"]);
    expect(saved.assetPath).toBe("u1/sns/p1/1.png");
  });

  it("첨부가 없으면 카드에 적힌 내 폴더 위치를 읽는다(관리자 복사본·다시 만들기)", async () => {
    const dependencies = await dependenciesFor();
    await dependencies.saveOriginal(placeCard({ assetPath: "u1/sns/p1/1.png", assetUrl: INTERNAL }));
    expect(fetched).toEqual(["https://storage.test/signed/u1/sns/p1/1.png"]);
  });

  it("열 때 카드 주소는 첨부 → 내 폴더 위치 순으로 서명한 주소다", async () => {
    const withAttachment = await refreshProjectAssetUrls(project(
      [placeCard({ attachmentId: "a1", assetUrl: INTERNAL })],
      [{ id: "a1", kind: "place_as_is", assetPath: "u1/references/a1.png", url: "old" }],
    ));
    expect(withAttachment.data.flow!.cards[0]!.assetUrl).toBe("https://storage.test/signed/u1/references/a1.png");
    const withOwnPath = await refreshProjectAssetUrls(project([placeCard({ assetPath: "u1/sns/p1/1.png", assetUrl: INTERNAL })]));
    expect(withOwnPath.data.flow!.cards[0]!.assetUrl).toBe("https://storage.test/signed/u1/sns/p1/1.png");
  });
});

describe("받아 오는 그림의 크기 상한 — 서버 메모리를 지킨다", () => {
  it("밝힌 크기가 상한을 넘으면 받기 전에 멈춘다", async () => {
    // 본문은 작고 머리글만 크다 — 이 시험은 「받기 전에」 멈추는 갈래만 본다.
    declaredLength = String(33 * 1024 * 1024);
    const dependencies = await dependenciesFor([{ id: "a1", kind: "style_reference", assetPath: "u1/references/a1.png", url: "https://storage.test/signed/u1/references/a1.png" }]);
    await expect(dependencies.uploadReference({ id: "a1", assetPath: "u1/references/a1.png", url: "https://storage.test/signed/u1/references/a1.png" } as never))
      .rejects.toThrow(/너무 큽니다/);
  });

  it("크기를 밝히지 않아도 받는 도중 상한을 넘으면 멈춘다", async () => {
    body = () => new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(4 * 1024 * 1024)); },
    });
    const dependencies = await dependenciesFor();
    await expect(dependencies.uploadReference({ id: "a1", assetPath: "u1/references/a1.png", url: "https://storage.test/signed/u1/references/a1.png" } as never))
      .rejects.toThrow(/너무 큽니다/);
  });

  it("화소가 올리기 상한(4천만)을 넘는 그림은 펼치지 않는다", async () => {
    png = await sharp({ create: { width: 6400, height: 6400, channels: 3, background: "#ffffff" } }).png({ compressionLevel: 9 }).toBuffer();
    const dependencies = await dependenciesFor();
    await expect(dependencies.saveOriginal(placeCard({ assetPath: "u1/sns/p1/1.png" }))).rejects.toThrow(/pixel limit/i);
  }, 30_000);
});
