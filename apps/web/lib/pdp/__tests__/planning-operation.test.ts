import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  analyze: vi.fn(), text: vi.fn(), auth: vi.fn(), admitted: vi.fn(), slice: vi.fn(), providers: vi.fn(), suggest: vi.fn(),
}));
vi.mock("@fixup/pdp-core", async () => ({
  ...await vi.importActual("@fixup/pdp-core"), analyzeProduct: mocks.analyze, planFromText: mocks.text,
}));
vi.mock("../../membership/api", () => ({ authenticateApiMember: mocks.auth }));
vi.mock("../../generation/llm-operation", () => ({ runLlmOperation: mocks.admitted }));
vi.mock("../providers", () => ({ createPdpProviders: mocks.providers }));
vi.mock("../slice-image", () => ({ sliceTallReference: mocks.slice }));
vi.mock("../../style-reference", () => ({ suggestStyleReference: mocks.suggest }));
import { durablePdpPlanning } from "../planning-operation";
const request = (body: unknown) => new Request("https://example.invalid/api/pdp/analyze", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, member: { userId: "owner" } });
  mocks.admitted.mockImplementation(async (_r, _u, _options, call) => call());
  mocks.slice.mockResolvedValue([{ imageBase64: "slice", mimeType: "image/png" }]);
  mocks.providers.mockReturnValue({ llm: {}, generateImage: {} });
  mocks.analyze.mockResolvedValue({ blueprint: { sections: [] } });
  mocks.text.mockResolvedValue({ brief: {}, blueprint: {} });
  mocks.suggest.mockResolvedValue({ reference: null });
});
it("checks authentication before reading the input or admitting paid work", async () => {
  mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) });
  expect((await durablePdpPlanning(request({}), "analyze")).status).toBe(401);
  expect(mocks.admitted).not.toHaveBeenCalled(); expect(mocks.providers).not.toHaveBeenCalled();
});
it("runs reference slicing and model work inside admission and preserves analyze output", async () => {
  mocks.admitted.mockImplementation(async (_r, _u, options, call) => {
    expect(options.operation).toBe("pdp_analyze"); expect(options.identity.mode).toBe("analyze");
    expect(mocks.slice).not.toHaveBeenCalled(); return call();
  });
  const response = await durablePdpPlanning(request({ imageBase64: "product", styleReference: { imageBase64: "ref" } }), "analyze");
  expect(response.status).toBe(200);
  expect(mocks.analyze.mock.calls[0][0].styleReference.slices[0].imageBase64).toBe("slice");
  expect(mocks.analyze.mock.calls[0][2]).toEqual({ skipFirstImage: true });
  expect((await response.json()).result.blueprint).toEqual({ sections: [] });
});
it("refuses provider execution when admission is closed", async () => {
  mocks.admitted.mockRejectedValue(new Error("admission_closed"));
  expect((await durablePdpPlanning(request({}), "text")).status).toBe(503);
  expect(mocks.text).not.toHaveBeenCalled(); expect(mocks.providers).not.toHaveBeenCalled();
});
it("keeps text-plan defaults and optional style selection within the same operation", async () => {
  const response = await durablePdpPlanning(request({ text: "sample" }), "text");
  expect(response.status).toBe(200);
  expect(mocks.text.mock.calls[0][0]).toMatchObject({ copyIntensity: "normal", gapPolicy: "ask" });
  expect(mocks.suggest).toHaveBeenCalledWith("owner", {});
  expect(mocks.admitted.mock.calls[0][2].identity.mode).toBe("text");
});
