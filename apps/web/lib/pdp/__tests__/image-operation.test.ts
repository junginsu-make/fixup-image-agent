import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({ admit: vi.fn(), generate: vi.fn(), assemble: vi.fn(), loadCharacter: vi.fn(), slice: vi.fn(), keyVisual: vi.fn(), auth: vi.fn() }));
vi.mock("../../membership/api", () => ({ authenticateApiMember: mock.auth }));
vi.mock("../../generation/image-operation", () => ({ runImageOperation: mock.admit }));
vi.mock("@fixup/pdp-core", async () => ({ ...await vi.importActual("@fixup/pdp-core"),
  generateSectionImage: mock.generate, buildSectionImageOptions: mock.assemble, generateKeyVisual: mock.keyVisual,
}));
vi.mock("../providers", () => ({ createPdpProviders: () => ({ llm: {}, generateImage: {} }) }));
vi.mock("../slice-image", () => ({ withSlicedStyleReference: mock.slice }));
vi.mock("../../characters", () => ({ loadCharacterView: mock.loadCharacter }));
vi.mock("../../teams/store", () => ({ teamIdOf: async () => "team" }));
vi.mock("../../evidence-gate", () => ({ rejectIfUnverified: () => null }));
import { durableKeyVisual, durablePdpSections } from "../image-operation";
const request = (body: unknown) => new Request("https://example.invalid/api/pdp/images", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ ok: true, member: { userId: "owner" } });
  mock.admit.mockImplementation(async (_r, _u, _options, call) => (await call()).value);
  mock.generate.mockResolvedValue({ imageBase64: "image", mimeType: "image/png", generatedImages: 1 });
  mock.keyVisual.mockResolvedValue({ imageBase64: "image", mimeType: "image/png" });
  mock.assemble.mockImplementation((_page, options) => options);
  mock.slice.mockImplementation(async page => page);
  mock.loadCharacter.mockResolvedValue({ base64: "character", mimeType: "image/png" });
});
it("reserves the representative image at its selected model price, not a fixed one credit", async () => {
  expect((await durableKeyVisual(request({ imageModel: "gpt-image-2", aspectRatio: "1:1" }))).status).toBe(200);
  expect(mock.admit.mock.calls[0][2].units).toBeGreaterThan(1);
  expect(mock.admit.mock.calls[0][2].maximumImages).toBe(1);
});
it("keeps single-section character, index and emphasis input wiring", async () => {
  const response = await durablePdpSections(request({ section: { section_id: "s", layout_notes: "" }, aspectRatio: "1:1", sectionIndex: 7,
    emphasisWords: ["word"], characterId: "character", page: { imageModel: "nano-banana" } }), "single");
  expect(response.status).toBe(200);
  expect(mock.loadCharacter.mock.calls[0][0]).toBe("owner"); expect(mock.loadCharacter.mock.calls[0][3]).toBe("team");
  expect(mock.assemble.mock.calls[0][1]).toMatchObject({ index: 7, emphasisWords: ["word"], characterReference: { base64: "character" } });
});
it("preserves batch partial success, section positions and separate emphasis despite duplicate IDs", async () => {
  mock.generate.mockResolvedValueOnce({ imageBase64: "image", mimeType: "image/png", generatedImages: 2 }).mockRejectedValueOnce(new Error("failed section"));
  mock.admit.mockImplementation(async (_r, _u, _options, call) => {
    const result = await call(); expect(result.images).toHaveLength(1); expect(result.success).toBe(true); return result.value;
  });
  const response = await durablePdpSections(request({ sections: [{ section_id: "same" }, { section_id: "same" }], sectionIndexes: [4, 5],
    emphasisWordsList: [["first"], ["second"]], aspectRatio: "1:1", page: { imageModel: "nano-banana" } }), "batch");
  const body = await response.json();
  expect(body.succeeded).toBe(1); expect(body.results.map((r: { ok: boolean }) => r.ok)).toEqual([true, false]);
  expect(mock.assemble.mock.calls.map(c => c[1].index)).toEqual([4, 5]);
  expect(mock.assemble.mock.calls.map(c => c[1].emphasisWords)).toEqual([["first"], ["second"]]);
});
it("rejects malformed sections before admission or provider work", async () => {
  expect((await durablePdpSections(request({ sections: [null] }), "batch")).status).toBe(400);
  expect(mock.admit).not.toHaveBeenCalled(); expect(mock.generate).not.toHaveBeenCalled();
});
