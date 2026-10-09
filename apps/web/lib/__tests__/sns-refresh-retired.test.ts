import { describe, expect, it, vi } from "vitest";
import type { SnsProjectRecord } from "../../app/api/sns/projects/project-service";

/**
 * **카드뉴스를 열 때 회원이 지운 그림의 첨부는 서명하지 않는다**(2026-10-08 코드 리뷰 — 계획 2단계).
 *
 * 주소가 비면 화면에 안 보이고, 만들기 두 길은 「쓸 수 없는 첨부」(409)로 예약 전에 멈춘다 — 그림 파일이 지워지던
 * 때와 같다. 「그대로 넣기」 카드는 첨부 위치를 그대로 쓰므로 그 위치도 서명하지 않는다. 만든 결과 카드는 그대로다.
 */
vi.mock("server-only", () => ({}));
vi.mock("../local-store", () => ({ isLocalStoreEnabled: () => false, localStoreRoot: () => "/tmp" }));
vi.mock("../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[]) => ({ data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })), error: null }),
      }),
    },
  }),
}));
vi.mock("../sns/retired-attachments", () => ({
  retiredAttachmentPaths: async (userId: string, paths: string[]) =>
    new Set(paths.filter((path) => userId === "u1" && path.includes("gone"))),
}));
vi.mock("../watermark", () => ({ markAsAi: async (bytes: Buffer) => bytes }));

const { refreshProjectAssetUrls, refreshProjectListAssetUrls, hasUnusableAttachment } = await import("../sns/runtime");

const project = {
  id: "p1", userId: "u1", title: "t", status: "copy_ready",
  data: {
    source: { kind: "text", text: "본문" },
    attachments: [
      { id: "a-live", kind: "style_reference", assetPath: "u1/references/live.png", url: "" },
      { id: "a-gone", kind: "place_as_is", assetPath: "u1/references/gone.png", url: "" },
    ],
    flow: { stage: "copy", cards: [
      { index: 1, kind: "place_as_is", role: "body", attachmentId: "a-gone", assetPath: "u1/references/gone.png", copy: { index: 1, headline: "h" } },
      { index: 2, kind: "generated", role: "body", assetPath: "u1/sns/p1/2.png", copy: { index: 2, headline: "h" } },
    ] },
  },
} as unknown as SnsProjectRecord;

describe("지운 그림의 첨부", () => {
  it("서명하지 않고, 만들기는 쓸 수 없는 첨부로 멈춘다", async () => {
    const refreshed = await refreshProjectAssetUrls(project);
    expect(refreshed.data.attachments.map((attachment) => [attachment.id, attachment.url])).toEqual([
      ["a-live", "signed:u1/references/live.png"],
      ["a-gone", ""],
    ]);
    expect(hasUnusableAttachment(refreshed)).toBe(true);
  });

  it("「그대로 넣기」 카드도 그 위치로 보이지 않는다 — 만든 결과 카드는 그대로", async () => {
    const refreshed = await refreshProjectAssetUrls(project);
    const [placed, generated] = refreshed.data.flow!.cards;
    expect(placed!.assetUrl).toBeFalsy();
    expect(generated!.assetUrl).toBe("signed:u1/sns/p1/2.png");
  });
});

/** 목록·라이브러리 미리보기도 같다 — 아직 만들기 전 「그대로 넣기」 카드는 첨부 위치를 그대로 갖고 있다(재리뷰). */
describe("목록 화면", () => {
  it("지운 그림 위치의 「그대로 넣기」 카드는 서명하지 않는다 — 만든 카드는 그대로", async () => {
    const [listed] = await refreshProjectListAssetUrls([project]);
    const [placed, generated] = listed!.data.flow!.cards;
    expect(placed!.assetUrl).toBeFalsy();
    expect(generated!.assetUrl).toBe("signed:u1/sns/p1/2.png");
  });
});
