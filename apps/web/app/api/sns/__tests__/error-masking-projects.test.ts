import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **카드뉴스 작업 라우트가 날것의 오류 글을 화면에 안 보낸다**(2026-10-07 서버 처리 오류 원문 가리기 Task 1).
 *
 * 전에는 `catch` 마다 `error.message` 를 그대로 돌려줬다. Supabase · fal · 글 모델의 원문과 설정 오류의
 * 환경변수 이름이 카드뉴스 화면에 떴고, 쉽게 모드는 4xx 를 안 가려 거기서도 뜰 수 있었다. 이제 그 라우트의
 * 일반 문장을 주고 원문은 서버 기록에만 남긴다.
 *
 * **상태 코드는 그대로다.** 화면은 404 로 다시 읽기를, 만들기 실패의 상태 코드로 다시 맞추기를 정하고
 * 상태 조회(폴링)는 502 를 「잠깐 못 물었다」로 넘긴다. 일부러 쓴 안내(입력 검사 · 404 · 409 · 403 ·
 * fal 계정 풀의 두 문장)도 문장 · 상태 코드 · 다른 칸 모두 그대로다. 돈 흐름(예약 · 확정 · 정산)은 안 바뀐다.
 */
vi.mock("server-only", () => ({}));

/** 표 이름이 든 Supabase 글. 화면에 나가면 안 된다. */
const 날것 = 'relation "public.sns_projects" violates row-level security policy for table sns_generation_requests';

type Flow = { cards: Array<Record<string, unknown>>; costs: unknown[]; generation?: unknown };
type Project = { id: string; ratio: string; modelId: string; status: string; title: string; data: { attachments: unknown[]; flow?: Flow } };

const project = (): Project => ({
  id: "p1",
  ratio: "4:5",
  modelId: "gpt-image-2.5-flare",
  status: "copy_ready",
  title: "제목",
  data: {
    attachments: [],
    flow: { cards: [{ index: 1, kind: "generated", role: "cover", status: "done", copy: { index: 1, headline: "제목" } }], costs: [] },
  },
});

let finalized: Array<{ success: boolean; reason?: string }> = [];
let settled: Array<{ success: boolean; reason?: string }> = [];
let listThrows: unknown;
let createThrows: unknown;
let projectGet: () => Promise<Project | undefined>;
let projectSave: () => Promise<unknown>;
let projectRemove: () => Promise<boolean>;
let generationProvidersThrow: unknown;
let planningProvidersThrow: unknown;
let startThrows: unknown;
let pollThrows: unknown;
let planThrows: unknown;
let captionThrows: unknown;
let active = false;
let settleThrows: unknown;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  reserveAiUsage: async () => ({ ok: true as const, userId: "u1", requestId: "r1" }),
  finalizeAiUsage: async (_reservation: unknown, success: boolean, _units: number, reason?: string) => {
    finalized.push({ success, reason });
  },
  settleAiUsage: async (_reservation: unknown, success: boolean, _units: number, reason?: string) => {
    settled.push({ success, reason });
    if (settleThrows && !success) throw settleThrows;
  },
}));
vi.mock("../../../../lib/membership/credit-ledger", () => ({
  freeCreditPlan: () => ({}),
  creditImagePlan: () => ({}),
  markCreditStarted: async () => undefined,
}));
vi.mock("../../../../lib/repository-factory", () => ({
  snsProjectServiceForUser: async () => ({
    list: async () => { if (listThrows) throw listThrows; return []; },
    create: async () => { if (createThrows) throw createThrows; return project(); },
  }),
}));
vi.mock("../../../../lib/teams/current-project", () => ({ selectedProjectFor: async () => null }));
vi.mock("../../../../lib/sns/feature", () => ({ isWebSourceEnabled: () => false }));
vi.mock("../../../admin/works/store", () => ({ deleteAnyWork: async () => true }));
vi.mock("../../../../lib/sns-flow-store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/sns-flow-store")>()),
  snsFlowStoreForUser: async () => ({ get: () => projectGet(), save: () => projectSave(), remove: () => projectRemove() }),
}));
vi.mock("../../../../lib/sns-generation-store", () => ({ snsSubmittedGenerationRequestStoreForUser: () => ({}) }));
vi.mock("../../../../lib/sns/providers", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/sns/providers")>()),
  createSnsGenerationProviders: () => { if (generationProvidersThrow) throw generationProvidersThrow; return {}; },
  createSnsPlanningProviders: () => { if (planningProvidersThrow) throw planningProvidersThrow; return {}; },
}));
vi.mock("../../../../lib/sns/runtime", () => ({
  refreshProjectListAssetUrls: async (value: unknown) => value,
  refreshProjectAssetUrls: async (value: unknown) => value,
  createQueuedGenerationDependencies: async () => ({}),
  hasUnusableAttachment: () => false,
  UNUSABLE_ATTACHMENT_MESSAGE: "쓸 수 없는 첨부가 있습니다.",
  replaceSnsCardRows: async () => undefined,
}));
vi.mock("../../../../lib/sns/queued-flow", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../lib/sns/queued-flow")>()),
  hasActiveQueuedGeneration: () => active,
  startQueuedFlow: async (_project: unknown, flow: unknown) => { if (startThrows) throw startThrows; return flow; },
  pollQueuedFlow: async (_project: unknown, flow: unknown) => { if (pollThrows) throw pollThrows; return flow; },
}));
vi.mock("../../../../lib/sns/project-lock", () => ({ withSnsProjectLock: async (_id: string, run: () => Promise<Response>) => run() }));
vi.mock("../../../../lib/sns/settle", () => ({ settleSnsReservation: async (_user: string, flow: unknown) => flow }));
vi.mock("../../../../lib/ai-control/pause", () => ({ isAiPaused: async () => false }));
vi.mock("../../../../lib/sns/actual-flow", () => ({
  createActualPlanningFlow: async () => { if (planThrows) throw planThrows; return project().data.flow; },
}));
vi.mock("../../../../lib/sns/source-adapters", () => ({ createSourceAdapters: () => ({}) }));
vi.mock("@fixup/sns-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fixup/sns-core")>()),
  writeCaption: async () => { if (captionThrows) throw captionThrows; return { caption: "글", issues: [] }; },
}));

const projects = await import("../projects/route");
const projectById = await import("../projects/[id]/route");
const caption = await import("../projects/[id]/caption/route");
const cards = await import("../projects/[id]/cards/[index]/route");
const generate = await import("../projects/[id]/generate/route");
const plan = await import("../projects/[id]/plan/route");
const status = await import("../projects/[id]/status/route");
const stop = await import("../projects/[id]/stop/route");
const { SnsProjectNotWritable } = await import("../../../../lib/sns-flow-store");
const { SnsProviderConfigurationError } = await import("../../../../lib/sns/providers");
const { ProjectValidationError } = await import("../projects/project-service");
const { FalPoolBusyError, FalPoolUnavailableError } = await import("../../../../lib/fal/pool/router");

const post = (body: unknown = {}) => new Request("http://local/api/sns/projects", { method: "POST", body: JSON.stringify(body) });
const id = { params: Promise.resolve({ id: "p1" }) };
const card = (index: string) => ({ params: Promise.resolve({ id: "p1", index }) });
const 설정오류 = () => new SnsProviderConfigurationError(["FAL_KEY", "OPENAI_API_KEY"], "generation");

let errors: ReturnType<typeof vi.spyOn>;
const logged = () => errors.mock.calls.flat().map(String).join(" ");

/** 원문 없이 일반 문장만, 상태 코드는 그대로. 원문은 서버 기록에 남는다. */
async function expectMasked(response: Response, statusCode: number, message: string, raw = 날것) {
  expect(response.status).toBe(statusCode);
  const text = await response.text();
  expect(JSON.parse(text)).toEqual({ ok: false, message });
  expect(text).not.toContain(raw);
  expect(logged()).toContain(raw);
}

async function expectKept(response: Response, statusCode: number, body: unknown) {
  expect(response.status).toBe(statusCode);
  expect(await response.json()).toEqual(body);
}

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  finalized = [];
  settled = [];
  listThrows = undefined;
  createThrows = undefined;
  projectGet = async () => project();
  projectSave = async () => project();
  projectRemove = async () => true;
  generationProvidersThrow = undefined;
  planningProvidersThrow = undefined;
  startThrows = undefined;
  pollThrows = undefined;
  planThrows = undefined;
  captionThrows = undefined;
  active = false;
  settleThrows = undefined;
});
afterEach(() => errors.mockRestore());

describe("작업 목록 · 만들기 (projects)", () => {
  it("목록 원문은 가리고 500 그대로", async () => {
    listThrows = new Error(날것);
    await expectMasked(await projects.GET(), 500, "프로젝트를 불러오지 못했습니다.");
  });

  it("만들기 원문은 가리고 500 그대로", async () => {
    createThrows = new Error(날것);
    const input = { title: "제목", source: { kind: "text", text: "본문" }, attachments: [], ratio: "4:5", language: "ko" };
    await expectMasked(await projects.POST(post(input)), 500, "프로젝트를 만들지 못했습니다.");
  });

  it("첨부 검사 거절은 400 과 문장 · issues 그대로", async () => {
    createThrows = new ProjectValidationError(["첨부 이미지를 찾을 수 없습니다. 다시 골라 주세요."]);
    const input = { title: "제목", source: { kind: "text", text: "본문" }, attachments: [], ratio: "4:5", language: "ko" };
    await expectKept(await projects.POST(post(input)), 400, {
      ok: false, message: "첨부 이미지를 찾을 수 없습니다. 다시 골라 주세요.", issues: ["첨부 이미지를 찾을 수 없습니다. 다시 골라 주세요."],
    });
  });
});

describe("작업 지우기 (projects/[id])", () => {
  it("지우기 원문은 가리고 500 그대로", async () => {
    projectRemove = async () => { throw new Error(날것); };
    await expectMasked(await projectById.DELETE(post(), id), 500, "작업을 지우지 못했습니다.");
  });

  it("없는 작업 404 · 남의 작업 403 은 그대로", async () => {
    projectRemove = async () => false;
    await expectKept(await projectById.DELETE(post(), id), 404, { ok: false, message: "작업을 찾을 수 없습니다." });
    projectRemove = async () => { throw new SnsProjectNotWritable(); };
    await expectKept(await projectById.DELETE(post(), id), 403, { ok: false, message: "내가 만든 카드뉴스만 고치거나 지울 수 있습니다." });
  });
});

describe("게시글 문구 (caption)", () => {
  it("글 모델 원문은 가리고 500 그대로 — 정산은 지금처럼 실패로 닫는다", async () => {
    captionThrows = new Error(`401 Incorrect API key provided ${날것}`);
    await expectMasked(await caption.POST(post(), id), 500, "게시글 문구를 만들지 못했습니다.");
    expect(settled).toEqual([{ success: false, reason: "sns_caption_failed" }]);
  });

  it("설정 오류는 503 그대로, 환경변수 이름은 화면에 안 보낸다", async () => {
    planningProvidersThrow = 설정오류();
    await expectMasked(await caption.POST(post(), id), 503, "게시글 문구를 만들지 못했습니다.", "FAL_KEY");
  });

  it("실패로 닫기가 흔들려도 우리 JSON 을 보낸다 — 닫기는 같은 인자로 한 번", async () => {
    captionThrows = new Error(날것);
    settleThrows = new Error("rpc credit_settle failed: connection reset");
    await expectMasked(await caption.POST(post(), id), 500, "게시글 문구를 만들지 못했습니다.");
    expect(settled).toEqual([{ success: false, reason: "sns_caption_failed" }]);
    expect(logged()).toContain("credit_settle");
  });

  it("결과가 없으면 404 와 지금 문장 그대로", async () => {
    projectGet = async () => undefined;
    await expectKept(await caption.POST(post(), id), 404, { ok: false, message: "결과를 찾을 수 없습니다." });
  });
});

describe("원고 고치기 (cards/[index] PATCH)", () => {
  it("저장 원문은 가리고 500 그대로", async () => {
    projectSave = async () => { throw new Error(날것); };
    await expectMasked(await cards.PATCH(post({ headline: "새 제목" }), card("1")), 500, "원고를 저장하지 못했습니다.");
  });

  it("없는 장 번호의 안내는 지금처럼 500 과 그 문장 그대로", async () => {
    await expectKept(await cards.PATCH(post({ headline: "새 제목" }), card("9")), 500, { ok: false, message: "카드를 찾을 수 없습니다." });
  });

  it("남의 작업 403 은 그대로", async () => {
    projectSave = async () => { throw new SnsProjectNotWritable(); };
    await expectKept(await cards.PATCH(post({ headline: "새 제목" }), card("1")), 403, { ok: false, message: "내가 만든 카드뉴스만 고치거나 지울 수 있습니다." });
  });
});

describe("한 장 다시 만들기 (cards/[index] POST)", () => {
  it("fal · 장부 원문은 가리고 500 그대로 — 묶은 장은 지금처럼 돌려준다", async () => {
    startThrows = new Error(`fal queue 422 ${날것}`);
    await expectMasked(await cards.POST(post(), card("1")), 500, "카드를 다시 만들지 못했습니다.");
    expect(finalized).toEqual([{ success: false, reason: "sns_card_retry_failed" }]);
  });

  it("설정 오류는 503 그대로, 환경변수 이름은 화면에 안 보낸다", async () => {
    generationProvidersThrow = 설정오류();
    await expectMasked(await cards.POST(post(), card("1")), 503, "카드를 다시 만들지 못했습니다.", "FAL_KEY");
  });

  it("fal 계정 풀이 몰렸다는 글은 지금처럼 500 과 그 문장 그대로", async () => {
    startThrows = new FalPoolBusyError();
    await expectKept(await cards.POST(post(), card("1")), 500, { ok: false, message: "지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요." });
  });

  it("다른 카드가 도는 중이면 409 와 지금 문장 그대로", async () => {
    active = true;
    await expectKept(await cards.POST(post(), card("1")), 409, { ok: false, message: "다른 카드가 생성 중입니다." });
  });
});

describe("카드 만들기 (generate)", () => {
  it("fal · 장부 원문은 가리고 500 그대로 — 묶은 장은 지금처럼 돌려준다", async () => {
    startThrows = new Error(`fal queue 422 ${날것}`);
    await expectMasked(await generate.POST(post(), id), 500, "카드 이미지를 만들지 못했습니다.");
    expect(finalized).toEqual([{ success: false, reason: "sns_submit_failed" }]);
  });

  it("설정 오류는 503 그대로, 환경변수 이름은 화면에 안 보낸다", async () => {
    generationProvidersThrow = 설정오류();
    await expectMasked(await generate.POST(post(), id), 503, "카드 이미지를 만들지 못했습니다.", "FAL_KEY");
  });

  it("fal 계정 풀 준비 문제 글은 지금처럼 500 과 그 문장 그대로", async () => {
    startThrows = new FalPoolUnavailableError(503);
    await expectKept(await generate.POST(post(), id), 500, { ok: false, message: "이미지 생성 준비 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요." });
  });

  it("원고가 없으면 409 와 지금 문장 그대로", async () => {
    projectGet = async () => ({ ...project(), data: { attachments: [] } });
    await expectKept(await generate.POST(post(), id), 409, { ok: false, message: "먼저 기획과 원고를 만들어 주세요." });
  });
});

describe("기획 · 원고 (plan)", () => {
  it("읽기 원문은 가리고 500 그대로", async () => {
    projectGet = async () => { throw new Error(날것); };
    await expectMasked(await plan.GET(post(), id), 500, "프로젝트를 불러오지 못했습니다.");
  });

  it("없는 작업 읽기는 404 와 지금 문장 그대로", async () => {
    projectGet = async () => undefined;
    await expectKept(await plan.GET(post(), id), 404, { ok: false, message: "프로젝트를 찾을 수 없습니다." });
  });

  it("기획 원문은 가리고 500 그대로 — 정산은 지금처럼 실패로 닫는다", async () => {
    planThrows = new Error(날것);
    await expectMasked(await plan.POST(post(), id), 500, "기획과 원고를 만들지 못했습니다.");
    expect(settled).toEqual([{ success: false, reason: "sns_plan_failed" }]);
  });

  it("설정 오류는 503 그대로, 환경변수 이름은 화면에 안 보낸다", async () => {
    planningProvidersThrow = 설정오류();
    await expectMasked(await plan.POST(post(), id), 503, "기획과 원고를 만들지 못했습니다.", "FAL_KEY");
  });

  it("실패로 닫기가 흔들려도 우리 JSON 을 보낸다 — 닫기는 같은 인자로 한 번", async () => {
    planThrows = new Error(날것);
    settleThrows = new Error("rpc credit_settle failed: connection reset");
    await expectMasked(await plan.POST(post(), id), 500, "기획과 원고를 만들지 못했습니다.");
    expect(settled).toEqual([{ success: false, reason: "sns_plan_failed" }]);
    expect(logged()).toContain("credit_settle");
  });
});

describe("상태 조회 폴링 (status)", () => {
  beforeEach(() => { active = true; });

  it("fal 원문은 가리고 502 그대로", async () => {
    pollThrows = new Error(`fal status 500 ${날것}`);
    await expectMasked(await status.POST(post(), id), 502, "fal 상태를 확인하지 못했습니다.");
  });

  it("설정 오류는 503 그대로, 환경변수 이름은 화면에 안 보낸다", async () => {
    generationProvidersThrow = 설정오류();
    await expectMasked(await status.POST(post(), id), 503, "fal 상태를 확인하지 못했습니다.", "FAL_KEY");
  });

  it("fal 계정 풀이 몰렸다는 글은 지금처럼 502 와 그 문장 그대로", async () => {
    pollThrows = new FalPoolBusyError();
    await expectKept(await status.POST(post(), id), 502, { ok: false, message: "지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요." });
  });

  it("흐름이 없으면 404 와 지금 문장 그대로", async () => {
    projectGet = async () => undefined;
    await expectKept(await status.POST(post(), id), 404, { ok: false, message: "생성 흐름을 찾을 수 없습니다." });
  });
});

describe("멈추기 (stop)", () => {
  it("저장 원문은 가리고 500 그대로", async () => {
    projectSave = async () => { throw new Error(날것); };
    await expectMasked(await stop.POST(post(), id), 500, "멈추지 못했습니다.");
  });

  it("흐름이 없으면 404 와 지금 문장 그대로", async () => {
    projectGet = async () => undefined;
    await expectKept(await stop.POST(post(), id), 404, { ok: false, message: "생성 흐름을 찾을 수 없습니다." });
  });
});

/*
 * **쉽게 모드도 같은 답을 받는다.** 쉽게는 카드뉴스 라우트를 함수로 부르고 `read()` 로 읽어
 * `EasyStepError` 로 올린다. 원문이 그 글에 안 실리고, 상태 코드 · 다시 시도 표시는 전과 같다.
 */
it("쉽게 모드의 read() 로 읽어도 원문이 안 실리고 500 · 다시 시도 가능 그대로", async () => {
  const { EasyStepError, read } = await import("../../../../lib/easy/relay");
  startThrows = new Error(날것);
  const thrown = await read(await generate.POST(post(), id), "카드 만들기").catch((error: unknown) => error);
  expect(thrown).toBeInstanceOf(EasyStepError);
  const step = thrown as InstanceType<typeof EasyStepError>;
  expect(step.status).toBe(500);
  expect(step.retryable).toBe(true);
  expect(step.message).toBe("카드 이미지를 만들지 못했습니다.");
});
