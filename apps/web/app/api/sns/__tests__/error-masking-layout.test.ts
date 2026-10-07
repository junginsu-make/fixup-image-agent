import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_TEMPLATES } from "@fixup/layout-core";

/**
 * **카드뉴스 뼈대 · 세트 라우트가 날것의 오류 글을 화면에 안 보낸다**(2026-10-07 서버 처리 오류 원문 가리기 Task 1).
 *
 * 전에는 `catch` 마다 `error.message` 를 그대로 돌려줬다. 표 이름 · 제약 이름 같은 Supabase 글과
 * 설정 오류의 환경변수 이름이 화면에 떴다. 이제 그 라우트의 일반 문장을 주고 원문은 서버 기록에만 남긴다.
 * **상태 코드는 그대로**, 일부러 쓴 안내(입력 검사 · 404 · 403 · 그리기 붐빔)도 그대로다.
 */
vi.mock("server-only", () => ({}));

/** 표 이름 · 제약 이름이 든 Supabase 글. 화면에 나가면 안 된다. */
const 날것 = 'duplicate key value violates unique constraint "layout_decks_pkey" on table layout_templates';

let finalized: Array<{ success: boolean; reason?: string }> = [];
let settled: Array<{ success: boolean; reason?: string }> = [];
let analyzePrimary: () => Promise<unknown>;
let analyzeBackup: () => Promise<unknown>;
let referenceImage: { bytes: Buffer; contentType: string } | undefined;
let providerThrows: unknown;
let projectGet: () => Promise<unknown>;
let projectSave: () => Promise<unknown>;
let renderThrows: unknown;
let slotThrows: unknown;
let deckThrows: unknown;
let templateThrows: unknown;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1" }),
  finalizeAiUsage: async (_reservation: unknown, success: boolean, _units: number, reason?: string) => {
    finalized.push({ success, reason });
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, _units: number, reason?: string) => {
    settled.push({ success, reason });
    return undefined;
  },
}));
vi.mock("../../../../lib/membership/credit-ledger", () => ({ freeCreditPlan: () => ({}) }));
vi.mock("../../../../lib/layout/library-image", () => ({
  referenceImageBytes: async () => referenceImage,
  toDataUrl: () => "data:image/png;base64,AA==",
}));
vi.mock("../../../../lib/layout/analyze-provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/layout/analyze-provider")>()),
  createLayoutAnalysisProviders: () => {
    if (providerThrows) throw providerThrows;
    return { primary: { analyze: () => analyzePrimary() }, backup: { analyze: () => analyzeBackup() } };
  },
}));
vi.mock("../../../../lib/sns-flow-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/sns-flow-store")>()),
  snsFlowStoreForUser: async () => ({ get: () => projectGet(), save: () => projectSave() }),
}));
vi.mock("../../../../lib/sns/queued-flow", () => ({ hasActiveQueuedGeneration: () => false }));
vi.mock("../../../../lib/layout/preview-service", () => ({
  renderPreviewCard: async () => {
    if (renderThrows) throw renderThrows;
    return { image: "data:image/png;base64,AA==", warnings: [], slots: [], unitUsd: 0 };
  },
}));
vi.mock("../../../../lib/layout/render-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/layout/render-gate")>()),
  withRenderSlot: async (_userId: string, work: () => Promise<unknown>) => {
    if (slotThrows) throw slotThrows;
    return work();
  },
}));
vi.mock("../../../../lib/layout/deck-store", () => ({
  listDecks: async () => { if (deckThrows) throw deckThrows; return []; },
  saveDeck: async () => { if (deckThrows) throw deckThrows; return {}; },
  deleteDeck: async () => { if (deckThrows) throw deckThrows; },
}));
vi.mock("../../../../lib/layout/template-store", () => ({
  listSavedTemplates: async () => { if (templateThrows) throw templateThrows; return []; },
  saveTemplate: async () => { if (templateThrows) throw templateThrows; return {}; },
  deleteTemplate: async () => { if (templateThrows) throw templateThrows; },
}));

const analyze = await import("../layout/analyze/route");
const apply = await import("../layout/apply/route");
const deckPreview = await import("../layout/deck-preview/route");
const decks = await import("../layout/decks/route");
const deckById = await import("../layout/decks/[id]/route");
const preview = await import("../layout/preview/route");
const templates = await import("../layout/templates/route");
const templateById = await import("../layout/templates/[id]/route");
const { SnsProjectNotWritable } = await import("../../../../lib/sns-flow-store");
const { LayoutAnalysisConfigurationError } = await import("../../../../lib/layout/analyze-provider");
const { RenderBusyError } = await import("../../../../lib/layout/render-gate");

const post = (body: unknown) => new Request("http://local/api/sns/layout", { method: "POST", body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const slotsOf = (role: "cover" | "body" | "ending") => DEFAULT_TEMPLATES.find((template) => template.role === role)!.slots;
const deck = () => ({ name: "세트", ratio: "4:5", total: 6, frames: { cover: slotsOf("cover"), body: slotsOf("body"), ending: slotsOf("ending") } });

let errors: ReturnType<typeof vi.spyOn>;
const logged = () => errors.mock.calls.flat().map(String).join(" ");

/** 원문 없이 일반 문장만, 상태 코드는 그대로. 원문은 서버 기록에 남는다. */
async function expectMasked(response: Response, status: number, message: string, raw = 날것) {
  expect(response.status).toBe(status);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual({ ok: false, message });
  expect(text).not.toContain(raw);
  expect(logged()).toContain(raw);
}

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  finalized = [];
  settled = [];
  analyzePrimary = async () => { throw new Error(날것); };
  analyzeBackup = async () => { throw new Error(날것); };
  referenceImage = { bytes: Buffer.from("x"), contentType: "image/png" };
  providerThrows = undefined;
  projectGet = async () => ({ id: "p1", status: "copy_ready", ratio: "4:5", data: { flow: { cards: [{ index: 1 }] } } });
  projectSave = async () => ({ id: "p1" });
  renderThrows = undefined;
  slotThrows = undefined;
  deckThrows = undefined;
  templateThrows = undefined;
});
afterEach(() => errors.mockRestore());

describe("레퍼런스 칸 읽기 (layout/analyze)", () => {
  it("설정 오류는 503 그대로, 환경변수 이름은 화면에 안 보낸다 — 묶은 자리는 지금처럼 돌려준다", async () => {
    providerThrows = new LayoutAnalysisConfigurationError(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
    await expectMasked(await analyze.POST(post({ referenceImageId: "ref-1" })), 503, "칸을 읽어내지 못했습니다.", "API_KEY");
    expect(finalized).toEqual([{ success: false, reason: "layout_analysis_unconfigured" }]);
  });

  /*
   * **칸 읽기 실패는 200 의 `issues` 로 화면에 뜬다**(Task 3). 패키지(`withIssueFallback`)가 던진 글을 그대로
   * 적으므로, 두 제공자 호출을 감싸 원문은 기록에만 남기고 우리 문장으로 다시 던진다. 주→예비 넘어가기는 같다.
   */
  it("두 제공자 원문은 issues 에 없다 — 200 · 직접 만들기 안내 · 정산은 그대로", async () => {
    const response = await analyze.POST(post({ referenceImageId: "ref-1" }));
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      ok: true,
      slots: [],
      issues: [
        "주 모델 칸 읽기 실패: 응답을 받지 못했습니다.",
        "OpenAI 예비로도 칸을 읽지 못했습니다: 응답을 받지 못했습니다.",
        "레퍼런스에서 칸을 읽어내지 못했습니다. 직접 만들어 주세요.",
      ],
    });
    expect(text).not.toContain(날것);
    expect(logged()).toContain(날것);
    expect(settled).toEqual([{ success: false, reason: "layout_analysis_empty" }]);
  });

  it("주 제공자가 실패하면 지금처럼 예비로 읽는다 — 까닭에 원문 없이", async () => {
    analyzeBackup = async () => ({ slots: [] });
    const response = await analyze.POST(post({ referenceImageId: "ref-1" }));
    const body = await response.json();
    expect(body.issues[0]).toBe("주 모델이 실패해 OpenAI 예비로 칸을 읽었습니다: 응답을 받지 못했습니다.");
    expect(JSON.stringify(body)).not.toContain(날것);
  });

  it("못 찾은 레퍼런스는 404 와 지금 문장 그대로", async () => {
    referenceImage = undefined;
    const response = await analyze.POST(post({ referenceImageId: "ref-1" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, message: "레퍼런스 그림을 찾지 못했습니다." });
  });
});

describe("뼈대 붙이기 (layout/apply)", () => {
  it("저장소 원문은 가리고 500 그대로", async () => {
    projectGet = async () => { throw new Error(날것); };
    await expectMasked(await apply.POST(post({ projectId: "p1", clear: true })), 500, "뼈대를 작업에 붙이지 못했습니다.");
  });

  it("일부러 쓴 안내는 그대로다 — 없는 작업 404, 남의 작업 403", async () => {
    projectGet = async () => undefined;
    const missing = await apply.POST(post({ projectId: "p1", clear: true }));
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ ok: false, message: "작업을 찾을 수 없습니다." });

    projectGet = async () => ({ id: "p1", status: "copy_ready", ratio: "4:5", data: { flow: { cards: [{ index: 1 }] } } });
    projectSave = async () => { throw new SnsProjectNotWritable(); };
    const denied = await apply.POST(post({ projectId: "p1", clear: true }));
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ ok: false, message: "내가 만든 카드뉴스만 고치거나 지울 수 있습니다." });
  });
});

describe("세트 미리보기 (layout/deck-preview)", () => {
  it("그리기 원문은 가리고 500 그대로", async () => {
    renderThrows = new Error(`sharp: Input file is missing ${날것}`);
    await expectMasked(await deckPreview.POST(post({ deck: deck(), copy: {} })), 500, "세트를 그려 보지 못했습니다.");
  });

  it("그리기 붐빔 안내는 그 상태 코드 · 문장 그대로", async () => {
    slotThrows = new RenderBusyError("지금 서버가 그리는 중입니다. 잠시 뒤에 다시 눌러 주세요.");
    const response = await deckPreview.POST(post({ deck: deck(), copy: {} }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ ok: false, message: "지금 서버가 그리는 중입니다. 잠시 뒤에 다시 눌러 주세요." });
  });
});

describe("세트 목록 · 저장 · 지우기 (layout/decks)", () => {
  it("불러오기 원문은 가리고 500 그대로", async () => {
    deckThrows = new Error(날것);
    await expectMasked(await decks.GET(), 500, "세트를 불러오지 못했습니다.");
  });

  it("저장 원문은 가리고 500 그대로", async () => {
    deckThrows = new Error(날것);
    await expectMasked(await decks.POST(post(deck())), 500, "세트를 저장하지 못했습니다.");
  });

  it("저장 입력 검사는 400 과 지금 문장 그대로", async () => {
    const response = await decks.POST(post({ name: "" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, message: "세트 입력을 확인해 주세요." });
  });

  it("지우기 원문은 가리고 500 그대로, 되면 지금처럼 ok", async () => {
    deckThrows = new Error(날것);
    await expectMasked(await deckById.DELETE(post({}), params("d1")), 500, "세트를 지우지 못했습니다.");

    deckThrows = undefined;
    expect(await (await deckById.DELETE(post({}), params("d1"))).json()).toEqual({ ok: true });
  });
});

describe("카드 한 장 미리보기 (layout/preview)", () => {
  it("그리기 원문은 가리고 500 그대로", async () => {
    renderThrows = new Error(날것);
    await expectMasked(await preview.POST(post({ ratio: "4:5", slots: slotsOf("body"), copy: {} })), 500, "미리보기를 만들지 못했습니다.");
  });

  it("모르는 비율은 400 과 지금 문장 그대로", async () => {
    const response = await preview.POST(post({ ratio: "3:7", slots: slotsOf("body"), copy: {} }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, message: "지원하지 않는 비율입니다: 3:7" });
  });
});

describe("뼈대 목록 · 저장 · 지우기 (layout/templates)", () => {
  it("불러오기 원문은 가리고 500 그대로", async () => {
    templateThrows = new Error(날것);
    await expectMasked(await templates.GET(), 500, "뼈대 목록을 불러오지 못했습니다.");
  });

  it("저장 원문은 가리고 500 그대로", async () => {
    templateThrows = new Error(날것);
    await expectMasked(await templates.POST(post({ name: "틀", role: "body", slots: slotsOf("body") })), 500, "뼈대를 저장하지 못했습니다.");
  });

  it("지우기 원문은 가리고 500 그대로", async () => {
    templateThrows = new Error(날것);
    await expectMasked(await templateById.DELETE(post({}), params("saved-1")), 500, "뼈대를 지우지 못했습니다.");
  });

  it("기본 뼈대 지우기는 400 과 지금 문장 그대로", async () => {
    const response = await templateById.DELETE(post({}), params(DEFAULT_TEMPLATES[0]!.id));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, message: "기본 뼈대는 지울 수 없습니다." });
  });
});
