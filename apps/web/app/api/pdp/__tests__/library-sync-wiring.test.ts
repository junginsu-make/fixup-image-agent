import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **생성 라우트가 서버 라이브러리 맞추기를 실제로 부르는가**(2026-09-28 사용자 결정).
 *
 * 규칙(`library-sync-plan`)과 맞추는 일(`library-sync`)은 따로 시험한다. 여기서는
 * 라우트를 실제로 돌려 **기록기에 그림이 적히고, 그 뒤 맞추기가 불리는지** 본다.
 * 전에는 단건(다시 만들기)이 아무것도 안 적어, 서버가 다시 만든 그림을 몰랐다.
 */
vi.mock("server-only", () => ({}));

const DOC = "40c82a0c-97d0-4aae-868d-f667883edb10";
const recorded: string[] = [];
const synced: Array<Record<string, unknown>> = [];

let failGeneration = false;
vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@fixup/pdp-core");
  return {
    ...actual,
    generateSectionImage: async () => {
      if (failGeneration) throw new Error("provider down");
      return { imageBase64: "IMG", mimeType: "image/png", generatedImages: 1, qa: undefined };
    },
  };
});
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1", usage: {} }),
  settleAiUsage: async () => ({}),
  finalizeAiUsage: async () => ({}),
}));
vi.mock("../../../../lib/membership/credit-ledger", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../../../../lib/membership/credit-ledger")),
  markCreditStarted: async () => {},
}));
vi.mock("../../../../lib/evidence-gate", () => ({ rejectIfUnverified: () => null }));
vi.mock("../../../../lib/pdp/slice-image", () => ({ withSlicedStyleReference: async (page: unknown) => page }));
vi.mock("../../../../lib/pdp/providers", () => ({ createPdpProviders: () => ({}) }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/characters", () => ({ loadCharacterView: async () => null }));
vi.mock("../../../../lib/pdp/jobs", async () => ({
  ...(await vi.importActual<Record<string, unknown>>("../../../../lib/pdp/jobs")),
  isPdpJobsEnabled: () => true,
}));
vi.mock("../../../../lib/pdp/jobs/recorder", () => ({
  createJobRecorder: async () => ({
    jobId: "job-1",
    started: async () => { recorded.push("started"); },
    sectionDone: async (result: { sectionId: string }) => { recorded.push(`done ${result.sectionId}`); },
    sectionFailed: async () => { recorded.push("failed"); },
    finished: async () => { recorded.push("finished"); },
  }),
}));
vi.mock("../../../../lib/pdp/jobs/library-sync", () => ({
  syncDocumentLibraryLater: async (input: Record<string, unknown>) => { synced.push(input); },
}));

const { POST: single } = await import("../images/route");
const { POST: batch } = await import("../images/batch/route");

const section = (id: string) => ({ section_id: id, headline: "제목", subheadline: "부제", prompt_en: "a product", layout_notes: "" });
const post = (body: unknown) => new Request("http://localhost/api/pdp/images", { method: "POST", body: JSON.stringify(body) });
const common = { originalImageBase64: "AAAA", aspectRatio: "3:4", page: { imageModel: "nano-banana-pro" } };

beforeEach(() => {
  recorded.length = 0;
  synced.length = 0;
  failGeneration = false;
});

describe("단건(다시 만들기)", () => {
  it("**문서를 알면 그림을 서버에 적고 라이브러리를 맞춘다** — 전에는 아무것도 안 적었다", async () => {
    const response = await single(post({ ...common, section: section("s2"), documentId: DOC, pageSectionIds: ["s1", "s2"], libraryTitle: "물 단백질" }));
    expect(response.status).toBe(200);
    expect(recorded).toEqual(["started", "done s2", "finished"]);
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ userId: "u1", documentId: DOC, pageSectionIds: ["s1", "s2"], title: "물 단백질" });
    // 방금 만든 그림을 그대로 넘긴다 — 화면이 받는 바이트와 같아 지문이 맞는다(3차 리뷰 HIGH).
    expect(synced[0]!.images).toEqual([{ sectionId: "s2", image: { base64: "IMG", mimeType: "image/png" } }]);
  });

  it("**실패해도 기록을 닫는다** — 결과 없는 작업이 「가장 최근」으로 남지 않는다(리뷰 HIGH-3)", async () => {
    failGeneration = true;
    await single(post({ ...common, section: section("s2"), documentId: DOC, pageSectionIds: ["s1", "s2"] }));
    expect(recorded).toEqual(["started", "failed", "finished"]);
    expect(synced).toEqual([]);
  });

  it("문서를 모르면 적지도 맞추지도 않는다 — 묶을 열쇠가 없다(화면이 대신 올린다)", async () => {
    await single(post({ ...common, section: section("s2") }));
    expect(recorded).toEqual([]);
    expect(synced).toEqual([]);
  });
});

describe("일괄", () => {
  it("**다 적은 뒤 라이브러리를 맞춘다**", async () => {
    await batch(post({ ...common, sections: [section("s1"), section("s2")], sectionIndexes: [0, 1], documentId: DOC, pageSectionIds: ["s1", "s2"] }));
    expect(recorded.at(-1)).toBe("finished");
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ documentId: DOC, pageSectionIds: ["s1", "s2"] });
    expect((synced[0]!.images as Array<{ sectionId: string }>).map((entry) => entry.sectionId)).toEqual(["s1", "s2"]);
  });

  it("**페이지 차례가 없는 옛 화면의 요청은 맞추지 않는다** — 지운 섹션까지 섞였다(3차 리뷰 MEDIUM)", async () => {
    await batch(post({ ...common, sections: [section("s1")], sectionIndexes: [0], documentId: DOC }));
    expect(synced).toEqual([]);
  });
});

describe("화면 배선", () => {
  const editor = readFileSync(new URL("../../../create/PdpEditor.tsx", import.meta.url), "utf8");
  const maker = readFileSync(new URL("../../../create/PdpMakerClient.tsx", import.meta.url), "utf8");

  it("**단건·일괄 요청과 확인 요청 모두 지금 페이지 차례를 싣는다**", () => {
    expect(editor.match(/\.\.\.librarySyncFields\(\),/g)).toHaveLength(3);
  });

  it("**문서가 있으면 서버에 확인하고, 모자란 섹션만 서버에 보낸다** — 화면이 페이지를 따로 올리지 않는다(2차 리뷰 HIGH-A)", () => {
    const 저장 = editor.slice(editor.indexOf("const handleSaveToLibrary"), editor.indexOf("saveToLibraryRef.current = handleSaveToLibrary"));
    const 서버 = 저장.slice(저장.indexOf("if (draftId && (auto || !hasEdits))"), 저장.indexOf("const versionKey"));
    expect(서버).toContain("outcome = await confirmServerLibrary({");
    expect(서버).toContain('apiJson("/pdp/library-sync"');
    expect(서버).toContain("...librarySyncFields(), pageSectionHashes, ...(supplied ? { supplied } : {})");
    // 요청마다 **지금 화면**에서 지문과 보낼 그림을 짓는다 — 확인 중에 다시 만든 그림을 되돌리지 않게(4차 리뷰 MEDIUM).
    expect(서버).toMatch(/request: async \(supplied\) => \{\s+const pageSectionHashes = await pageImageHashes\(librarySectionsRef\.current/);
    expect(서버).toContain("const section = librarySectionsRef.current.find((entry) => entry.section_id === sectionId);");
    // 무엇을 할지는 `nextLibraryStep` 이 정한다(따로 동작으로 시험). 여기는 그 답을 따르는지만 본다.
    expect(서버).toContain("const step = nextLibraryStep(outcome, { auto, singleRun, hasProgress: Boolean(libraryProgressRef.current) });");
    expect(서버).toMatch(/if \(step === "retry"\) \{[\s\S]{0,300}return;\s+\}/);
    expect(서버).toContain('if (step === "skip") return;');
  });

  it("**저장 중에 온 자동 저장은 끝난 뒤 다시 돈다** — 버리지 않는다(4차 리뷰 MEDIUM)", () => {
    const 저장 = editor.slice(editor.indexOf("const deferIfLibraryBusy"), editor.indexOf("saveToLibraryRef.current = handleSaveToLibrary"));
    expect(저장).toContain("if (auto) libraryRerunRef.current = { auto: true, singleRun };");
    expect(저장).toContain("setTimeout(() => void saveToLibraryRef.current(rerun), 0);");
    // 문서 저장과 기존 두 저장 경로 모두 끝날 때 잠금을 푼다.
    expect(저장.match(/releaseLibrarySave\(\);/g)).toHaveLength(3);
    expect(저장.match(/if \(deferIfLibraryBusy\(auto, singleRun\)\) return;/g)).toHaveLength(2);
    expect(저장).not.toContain("librarySavingRef.current) return;");
  });

  it("자동 저장은 한 장 다시 만들기인지 알린다", () => {
    expect(editor).toContain('void saveToLibraryRef.current({ auto: true, singleRun: generationRun.mode !== "batch" });');
  });

  it("글자·도형을 얹은 단추 누르기는 서버 확인 없이 편집본을 올린다 — 서버는 편집본을 모른다", () => {
    expect(editor).toContain("if (draftId && (auto || !hasEdits)) {");
  });

  it("차례는 요청 때마다 **지금** 것을 싣는다(리뷰 MEDIUM-4)", () => {
    expect(editor).toContain("pageSectionIds: librarySectionsRef.current.map((section) => section.section_id)");
  });

  it("**편집 화면에 들어서자마자 초안 번호를 받는다**", () => {
    expect(maker).toMatch(/appState !== "editor" \|\| !result \|\| activeDraftId[\s\S]{0,120}void persistDraft\("auto"\)/);
  });
});
