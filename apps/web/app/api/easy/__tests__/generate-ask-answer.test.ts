import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **물음에 답하는 턴**(2026-10-07 2차 설계 D1 · §3-1).
 *
 * 화면은 처음 말을 다시 보내지 않는다 — 단추 답은 `{ prompt: 단추 글, answersRowId, pick }`, 말로 한
 * 답은 `{ prompt }`. 서버가 대화 줄로 처음 말 · 답 · 고른 값 · 사진을 잇는다. 단추 답은 물음 줄의
 * 판단으로 바로 간다(판단 모델은 안 부르고, 0크레딧 판정 예약 · 정산은 한다 — 2차 최종 리뷰 4).
 */
vi.mock("server-only", () => ({}));

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

let 판단: unknown;
let 지난줄: Array<{ id: string; role: string; body: string; workId: string | null }>;
const 남긴줄: Array<{ role: string; body?: string }> = [];
const 부른라우트: Array<{ step: string; body: Record<string, unknown> }> = [];
const 읽은사진: string[][] = [];
const 받은판단글: string[] = [];
const 센것 = { reserve: 0, decide: 0, settle: 0 };
let 기획실패 = false;
// 후속 Task 9 — 기획 라우트가 날것 예외를 던진다 · 머리말 줄 저장이 실패한다.
let 기획던짐 = false;
let 머리말실패: Error | undefined;
// 후속 Task 9 고침 1 — 사용자 줄 저장이 실패한다 · 물음 줄에 적힌 사진을 못 찾는다.
let 사용자줄실패: Error | undefined;
let 사진못찾음 = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "me-1", profile: { role: "member" } } }),
  reserveAiUsage: async () => {
    센것.reserve += 1;
    return { ok: true as const, userId: "me-1", requestId: "decide", usage: undefined };
  },
  settleAiUsage: async () => {
    센것.settle += 1;
    return { remaining: 0 };
  },
}));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/easy/store", () => ({
  easyStoreForUser: () => ({
    getConversation: async () => ({ id: "c1", title: "있음" }),
    listMessages: async () => 지난줄,
    appendMessage: async (row: { role: string; body?: string }) => {
      if (머리말실패 && row.body?.startsWith("say:")) throw 머리말실패;
      if (사용자줄실패 && row.role === "user") throw 사용자줄실패;
      남긴줄.push(row);
      return { id: `m${남긴줄.length}`, ...row };
    },
    renameConversation: async () => {},
  }),
}));
vi.mock("../../../../lib/easy/chat-provider", () => ({
  createEasyChatProvider: () => ({
    decide: async (text: string) => {
      센것.decide += 1;
      받은판단글.push(text);
      return 판단;
    },
    decideRoles: async () => ({ photos: [{ number: 1, role: "preserve_product", said: false }], conflicting: false }),
  }),
}));
vi.mock("../../../../lib/easy/cardnews-steps", async (original) => ({
  ...(await original<object>()),
  lastCardnewsProject: async () => null,
  cardnewsProjectIds: async () => new Set<string>(),
}));
vi.mock("../../../../lib/easy/read-photos", () => ({
  readEasyPhotos: async (photos: Array<{ id: string }>) =>
    Object.fromEntries(photos.map((photo) => [photo.id, { description: "설명", hasPeople: false, hasText: false }])),
}));
vi.mock("../../../../lib/poster/references", () => ({
  posterReferencesByIds: async (_viewer: unknown, ids: string[]) => {
    읽은사진.push([...ids]);
    if (사진못찾음) return [];
    return ids.map((id) => ({ id, title: id, url: `https://x.test/${id}.png`, storagePath: `me-1/${id}.png` }));
  },
}));
vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: { get: async () => undefined },
    images: { byProject: async () => [], byProjects: async () => [] },
  }),
}));
vi.mock("../../../../lib/llm/meter", () => ({
  withLlmMeter: (fn: () => unknown) => fn(),
  readLlmMeter: () => ({ metered: true, usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 }),
  llmSettleCost: () => ({ model: "", billableImages: 0 }),
}));
const 라우트 = (step: string) => ({
  POST: async (req: Request) => {
    부른라우트.push({ step, body: await req.json() });
    if (step === "plan" && 기획던짐) throw new Error("relation \"poster_plans\" does not exist");
    if (step === "plan" && 기획실패) return Response.json({ ok: false, message: "크레딧이 부족합니다." }, { status: 402 });
    return step === "project"
      ? Response.json({ ok: true, project: { id: "p1" } })
      : Response.json({ ok: true, submission: { requestRowId: "r", falRequestId: "f", endpoint: "e" } });
  },
});
vi.mock("../../poster/projects/route", () => 라우트("project"));
vi.mock("../../poster/projects/[id]/plan/route", () => 라우트("plan"));
vi.mock("../../poster/projects/[id]/generate/route", () => 라우트("generate"));

const { POST } = await import("../generate/route");
const { askBody, readAsk, visibleBody, withPick } = await import("../../../easy/row-marks");
const { NOTHING_TO_EDIT } = await import("../../../easy/chat");

const 보낸다 = async (body: Record<string, unknown>) => {
  const response = await POST(new Request("http://localhost/api/easy/generate", {
    method: "POST",
    headers: { "x-idempotency-key": "11111111-1111-4111-8111-111111111111" },
    body: JSON.stringify({ conversationId: "c1", imageModel: "gpt-image-2.5-flare", ...body }),
  }));
  return { status: response.status, json: await response.json() };
};

type 줄 = { id: string; role: string; body: string; workId: string | null };
const 처음: 줄 = { id: "u1", role: "user", body: "바다 풍경 포스터 만들어줘", workId: null };
const 물음 = (id: string, kind: Parameters<typeof askBody>[0], data: Record<string, unknown> = {}): 줄 =>
  ({ id, role: "assistant", body: askBody(kind, "물음?", data), workId: null });
const 단추줄 = (id: string, text: string, pick: Record<string, unknown>): 줄 =>
  ({ id, role: "user", body: withPick(text, pick), workId: null });

beforeEach(() => {
  판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "" };
  지난줄 = [];
  남긴줄.length = 0; 부른라우트.length = 0; 읽은사진.length = 0; 받은판단글.length = 0;
  센것.reserve = 0; 센것.decide = 0; 센것.settle = 0;
  기획실패 = false;
  기획던짐 = false;
  머리말실패 = undefined;
  사용자줄실패 = undefined;
  사진못찾음 = false;
});

describe("단추로 한 답", () => {
  /**
   * 2차 최종 리뷰 4 — 단추 답도 0크레딧 판정 예약 · 정산은 한다. 운영자 멈춤 · 크레딧 확인이 걸리고, 뒤의 사진
   * 읽기 · 역할 판단 원가가 이 예약에 묶인다. 판단 모델만 안 부른다.
   */
  it("모양 단추면 판단 모델 없이(판정 예약 · 정산은 한다) 처음 말과 고른 비율로 만든다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    const { status } = await 보낸다({ prompt: "이대로 만들기", answersRowId: "q1", pick: { ratio: "1:1" } });
    expect(status).toBe(200);
    expect(센것).toEqual({ reserve: 1, decide: 0, settle: 1 });
    expect(부른라우트.map((call) => call.step)).toEqual(["project", "plan", "generate"]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘", ratio: "1:1" });
    expect(남긴줄[0]).toMatchObject({ role: "user", body: withPick("이대로 만들기", { ratio: "1:1" }) });
  });

  it("갈래 단추 → 모양 단추로 이어지면 처음 말 · 갈래 · 비율을 잇는다", async () => {
    지난줄 = [처음, 물음("q1", "kind", { ids: [] }), 단추줄("u2", "이미지 한 장", { kind: "image" }), 물음("q2", "ratio", { cont: true, wants: "image" })];
    await 보낸다({ prompt: "이걸로 만들기 (세로)", answersRowId: "q2", pick: { ratio: "4:5" } });
    expect(센것.decide).toBe(0);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘", ratio: "4:5" });
  });

  it("새로고침 뒤 사진 물음 단추로 답하면 물음 줄의 사진으로 만든다 — 화면에 첨부가 없어도", async () => {
    지난줄 = [
      { ...처음, body: "1번 제품으로 포스터" },
      물음("q1", "photo", { wants: "image", reason: "unclear", mode: "image", rows: [{ id: 사진(1), role: "unclear" }], ids: [사진(1)] }),
    ];
    await 보낸다({ prompt: "이걸로 만들기", answersRowId: "q1", pick: { photoRoles: [{ id: 사진(1), role: "preserve_product" }] } });
    expect(센것.decide).toBe(0);
    expect(읽은사진).toEqual([[사진(1)]]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "1번 제품으로 포스터", preservedIds: [사진(1)] });
  });

  /** Review Focus 1 */
  it("지난 물음 줄 id 로 온 단추 답은 새 말로 본다 — 판단을 부르고 단추 값 · 물음 줄의 사진을 안 쓴다", async () => {
    지난줄 = [
      처음, 물음("q1", "photo", { wants: "image", ids: [사진(1)] }),
      { id: "u2", role: "user", body: "고마워", workId: null }, { id: "a1", role: "assistant", body: "네", workId: null },
    ];
    판단 = { wants: "talk", reply: "무엇을 도와드릴까요?", ratio: "", look: "", card: 0, note: "" };
    const { json } = await 보낸다({ prompt: "이걸로 만들기", answersRowId: "q1", pick: { photoRoles: [{ id: 사진(1), role: "preserve_product" }] } });
    expect(센것.decide).toBe(1);
    expect(읽은사진).toEqual([]);
    expect(json.talked).toBe(true);
    expect(부른라우트).toEqual([]);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "이걸로 만들기" });
  });

  it("고른 값이 모자란 단추 답(갈래 없음)은 말로 보고 판단 모델이 가른다 — 고른 값 표시도 안 붙인다", async () => {
    지난줄 = [처음, 물음("q1", "kind", { ids: [] })];
    판단 = { wants: "image", reply: "", ratio: "1:1", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "이미지 한 장", answersRowId: "q1", pick: {} });
    expect(센것.decide).toBe(1);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "이미지 한 장" });
  });

  /**
   * 2차 최종 리뷰 1 · Review Focus 7 — 물은 뒤 원고 · 이미지가 사라졌는데 장 · 번호 단추가 오면, 물음 줄의 판단
   * (card_text · image_edit)이 그대로 가면 아래 만들기로 새어 값이 나간다. 판단 읽기와 같은 사실로 다시 보고
   * 사실만 말한다. 판정 예약은 했다(0크레딧).
   */
  it("고칠 것이 사라진 장 · 번호 단추 답은 값 없이 사실만 말한다", async () => {
    지난줄 = [{ ...처음, body: "더 짧게 해줘" }, 물음("q1", "card", { wants: "card_text", count: 2, note: "더 짧게" })];
    const 장 = await 보낸다({ prompt: "2번", answersRowId: "q1", pick: { card: 2 } });
    expect(장.json).toMatchObject({ ok: true, talked: true, message: { body: NOTHING_TO_EDIT } });
    expect(부른라우트).toEqual([]);

    남긴줄.length = 0;
    지난줄 = [{ ...처음, body: "배경만 파랗게" }, 물음("q1", "target", { numbers: [1, 2] })];
    const 번호 = await 보낸다({ prompt: "이미지 1", answersRowId: "q1", pick: { target: 1 } });
    expect(번호.json).toMatchObject({ talked: true, message: { body: NOTHING_TO_EDIT } });
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(부른라우트).toEqual([]);
    expect(센것).toMatchObject({ decide: 0 });
  });

  /** 2차 최종 리뷰 8 · Review Focus 8 — 사진 고르기가 열린 채 친 말은 그 물음의 답이다. 그 말도 지시에 잇는다. */
  it("사진 고르기가 열린 채 말로 친 답은 판단 모델 없이 그 말을 처음 말 뒤에 잇는다", async () => {
    지난줄 = [
      { ...처음, body: "1번 제품으로 포스터" },
      물음("q1", "photo", { wants: "image", reason: "unclear", mode: "image", rows: [{ id: 사진(1), role: "unclear" }], ids: [사진(1)] }),
    ];
    const pick = { photoRoles: [{ id: 사진(1), role: "preserve_product" }], typed: true };
    await 보낸다({ prompt: "1번은 우리 원두 봉투야", answersRowId: "q1", pick, referenceIds: [사진(1)] });
    expect(센것).toMatchObject({ reserve: 1, decide: 0 });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "1번 제품으로 포스터\n1번은 우리 원두 봉투야", preservedIds: [사진(1)] });
    expect(남긴줄[0]).toMatchObject({ role: "user", body: withPick("1번은 우리 원두 봉투야", pick) });
  });
});

describe("말로 한 답", () => {
  it("판단 모델이 답이라고 적으면 처음 말 + 답으로 만든다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = { wants: "image", reply: "", ratio: "4:5", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "세로로 해줘" });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘\n세로로 해줘", ratio: "4:5" });
  });

  it("새로고침 뒤 사진 물음에 말로 답하면(답이라고 읽히면) 물음 줄의 사진을 쓴다", async () => {
    지난줄 = [{ ...처음, body: "이 사진으로 포스터" }, 물음("q1", "photo", { wants: "image", ids: [사진(1)] })];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "1번은 우리 제품이야" });
    expect(읽은사진).toEqual([[사진(1)]]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "이 사진으로 포스터\n1번은 우리 제품이야" });
  });

  /**
   * Review Focus 5 · 8 — 답이 아니면 앞 물음의 처음 말 · 고른 값 · 사진을 안 붙인다. 그리고 모양 물음 바로
   * 뒤라 모양을 또 묻지 않는다(2차 최종 리뷰 6) — 말한 비율이 없으니 정사각형으로 만든다.
   */
  it("모양 물음 뒤 답이 아닌 새 주문은 그 말 그대로, 모양을 다시 묻지 않고 만든다", async () => {
    지난줄 = [
      처음, 물음("q1", "kind", { ids: [사진(1)] }),
      단추줄("u2", "이미지 한 장", { kind: "image" }), 물음("q2", "ratio", { cont: true, wants: "image" }),
    ];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "고양이 포스터 만들어줘" });
    expect(읽은사진).toEqual([]);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "고양이 포스터 만들어줘" });
    expect(남긴줄.some((row) => readAsk(row as never))).toBe(false);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "고양이 포스터 만들어줘", ratio: "1:1" });
  });

  /** 2차 최종 리뷰 6 — 모양 물음에 「그냥 해줘」처럼 모양 없는 답을 쳐도 같은 물음이 또 뜨지 않는다. */
  it("모양 물음에 모양 없는 말로 답하면 같은 물음 없이 처음 말로 만든다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "그냥 알아서 해줘" });
    expect(남긴줄.some((row) => readAsk(row as never))).toBe(false);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘\n그냥 알아서 해줘", ratio: "1:1" });
  });

  /** 2차 최종 리뷰 6 — 갈래 물음 뒤 또 either 면 같은 물음을 되풀이하지 않고 한 장으로, 처음 말을 잇는다. */
  it("갈래 물음 뒤 또 either 면 한 장으로 가고 처음 말을 잇는다 — 다음 물음은 모양", async () => {
    지난줄 = [{ ...처음, body: "신메뉴 홍보물 만들어줘" }, 물음("q1", "kind", { ids: [] })];
    판단 = { wants: "either", reply: "한 장으로 할까요, 카드뉴스로 할까요?", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "음 아무거나" });
    expect(readAsk(남긴줄[1] as never)).toMatchObject({ kind: "ratio", data: { cont: true, wants: "image" } });
    // 갈래 물음으로 쓴 reply 는 모양 물음 글로 안 쓴다(2차 최종 리뷰 b).
    expect(readAsk(남긴줄[1] as never)?.text).not.toBe("한 장으로 할까요, 카드뉴스로 할까요?");
    expect(부른라우트).toEqual([]);
  });

  /**
   * 최종 수정 2 — 모양 물음에 「세로로」를 쳐 서버가 답으로 봤는데 뒤에서(기획 402) 실패하면, 실패 짝 건너뛰기는 단추 답만
   * 알아봐서 입력창에 되돌아온 「세로로」를 다시 보내면 사슬이 없었다 — 「세로로」 하나로 만들어 값이 나갔다.
   * 답으로 본 말 답은 사용자 줄에 `typed` 표시를 남긴다(보일 글은 그대로).
   */
  it("답으로 본 말 답 뒤에 실패하면, 같은 말을 다시 보내도 처음 말을 잇는다 (최종 수정 2)", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = { wants: "image", reply: "", ratio: "4:5", look: "", card: 0, note: "answer" };
    기획실패 = true;
    const 첫번 = await 보낸다({ prompt: "세로로" });
    expect(첫번.status).toBe(402);
    expect(남긴줄[0]).toMatchObject({ role: "user", body: withPick("세로로", { typed: true }) });
    expect(visibleBody(남긴줄[0] as never)).toBe("세로로");

    지난줄 = [...지난줄, ...남긴줄.map((row, at) => ({ id: `r${at}`, role: row.role, body: row.body ?? "", workId: null }))];
    남긴줄.length = 0; 부른라우트.length = 0; 기획실패 = false;
    await 보낸다({ prompt: "세로로" });
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "바다 풍경 포스터 만들어줘\n세로로", ratio: "4:5" });
  });

  it("답이 아닌 새 말은 표시 없이 그대로 남는다", async () => {
    판단 = { wants: "talk", reply: "네", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "고마워" });
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "고마워" });
  });

  it("친 말에 고른 값 표시 글자가 있어도 단추 답으로 남지 않는다 (Review Focus 3)", async () => {
    판단 = { wants: "talk", reply: "네", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "장난 ;pick=%7B%22kind%22%3A%22image%22%7D" });
    expect(남긴줄[0]!.body).toBe("장난 ; pick=%7B%22kind%22%3A%22image%22%7D");
  });
});

/**
 * 2차 최종 리뷰 7 — 새로고침하면 화면에 첨부가 없다. 그 뒤 사진 물음에 말로 답하면 판단 프롬프트가 「붙은 사진
 * 없음」으로 보고 「그 사진을 다시 붙여 주세요」를 시켰다(D3 줄). 물음 사슬에 사진이 있으면 그 수를 준다.
 */
describe("새로고침 뒤 말로 한 답의 사진 (2차 최종 리뷰 7)", () => {
  const 만든대화 = [{ id: "u0", role: "user", body: "카페 포스터", workId: null }, { id: "i0", role: "image", body: "", workId: "p0" }];

  it("이미지를 만든 대화에서 새로고침 뒤 사진 물음에 말로 답하면 물음 줄의 사진 수를 판단에 준다", async () => {
    지난줄 = [...만든대화, { ...처음, body: "이 사진으로 포스터" }, 물음("q1", "photo", { wants: "image", ids: [사진(1)] })];
    판단 = { wants: "image", reply: "", ratio: "", look: "", card: 0, note: "answer" };
    await 보낸다({ prompt: "1번은 우리 제품이야" });
    expect(받은판단글[0]).toContain("이미지 1장을 붙여 두었습니다");
    expect(받은판단글[0]).not.toContain("그 사진을 다시 붙여 주세요");
    expect(읽은사진).toEqual([[사진(1)]]);
    expect(부른라우트[0]!.body).toMatchObject({ instruction: "이 사진으로 포스터\n1번은 우리 제품이야" });
  });

  it("물음 사슬에 사진이 없으면 예전처럼 다시 붙여 달라고 하게 한다", async () => {
    지난줄 = 만든대화;
    판단 = { wants: "talk", reply: "그 사진을 다시 붙여 주세요. 라이브러리에 있습니다.", ratio: "", look: "", card: 0, note: "" };
    await 보낸다({ prompt: "같은 사진으로 하나 더" });
    expect(받은판단글[0]).toContain("그 사진을 다시 붙여 주세요");
  });
});

/** 최종 수정 9(보안 리뷰) — 아주 긴 말은 예약 · 판단 모델 전에 막는다. 값이 안 든다. */
describe("말 길이 상한 (최종 수정 9)", () => {
  it("2000자를 넘는 말은 예약 · 판단 없이 쉬운 말로 막는다", async () => {
    const { status, json } = await 보낸다({ prompt: "가".repeat(2001) });
    expect(status).toBe(400);
    expect(json).toMatchObject({ ok: false, message: "말은 2000자까지 보낼 수 있습니다.", retryable: false });
    expect(센것).toEqual({ reserve: 0, decide: 0, settle: 0 });
    expect(남긴줄).toEqual([]);
  });

  it("2000자까지는 받는다", async () => {
    판단 = { wants: "talk", reply: "네", ratio: "", look: "", card: 0, note: "" };
    const { status } = await 보낸다({ prompt: "가".repeat(2000) });
    expect(status).toBe(200);
    expect(센것.decide).toBe(1);
  });
});

/**
 * 후속 Task 9 — 서버가 말 답을 물음의 답으로 읽어 사용자 줄을 `typed` 표시로 남긴 뒤 실패하면, 새로고침 뒤에는
 * [물음, 말 답, (머리말), 실패] 로 물음 단추가 다시 뜬다. 그 자리 화면도 같게 하도록 실패 응답에 `typedAnswer` 를 싣는다.
 * 실패 응답의 다른 칸은 그대로다(Task 1 가림 포함).
 */
describe("말 답 뒤 실패 응답의 표시 (후속 Task 9)", () => {
  const 말답판단 = { wants: "image", reply: "", ratio: "4:5", look: "", card: 0, note: "answer" };

  it("말 답 뒤 기획이 402 로 막히면 typedAnswer 를 싣고 나머지 칸은 그대로다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = 말답판단;
    기획실패 = true;
    const { status, json } = await 보낸다({ prompt: "세로로" });
    expect(status).toBe(402);
    expect(json).toEqual({ ok: false, step: "기획", message: "크레딧이 부족합니다.", retryable: false, typedAnswer: true });
    expect(남긴줄[0]).toMatchObject({ role: "user", body: withPick("세로로", { typed: true }) });
  });

  it("말 답 뒤 날것 예외도 가린 글 그대로 typedAnswer 를 싣는다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = 말답판단;
    기획던짐 = true;
    const { status, json } = await 보낸다({ prompt: "세로로" });
    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, message: "만들지 못했습니다.", typedAnswer: true });
  });

  it("말 답 뒤 대화가 사라졌다는 안내도 그대로 typedAnswer 를 싣는다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = 말답판단;
    const { EasyConversationMissingError } = await import("../../../../lib/easy/store-core");
    머리말실패 = new EasyConversationMissingError();
    const { status, json } = await 보낸다({ prompt: "세로로" });
    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, message: "대화를 찾을 수 없습니다.", typedAnswer: true });
  });

  it("단추 답이 실패하면 예전 그대로 typedAnswer 가 없다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    기획실패 = true;
    const { status, json } = await 보낸다({ prompt: "이대로 만들기", answersRowId: "q1", pick: { ratio: "1:1" } });
    expect(status).toBe(402);
    expect(json).toEqual({ ok: false, step: "기획", message: "크레딧이 부족합니다.", retryable: false });
  });

  it("답이 아닌 새 말이 실패하면 typedAnswer 가 없다", async () => {
    판단 = { ...말답판단, note: "" };
    기획실패 = true;
    const { status, json } = await 보낸다({ prompt: "세로 포스터 만들어줘" });
    expect(status).toBe(402);
    expect(json).toEqual({ ok: false, step: "기획", message: "크레딧이 부족합니다.", retryable: false });
    expect(남긴줄[0]).toMatchObject({ role: "user", body: "세로 포스터 만들어줘" });
  });
});

/**
 * 후속 Task 9 고침 1 — 서버가 말 답으로 읽었는데 사용자 줄을 **남기기 전에** 실패하면 아무 줄도 안 남는다. 새로고침하면
 * 꼬리가 [물음] 이라 단추가 다시 뜨고 친 말은 없다. 그 자리 화면도 같게 하도록 실패 응답에 `typedUnsaved` 를 싣는다.
 */
describe("말 답을 남기기 전 실패 응답의 표시 (후속 Task 9 고침 1)", () => {
  const 말답판단 = { wants: "image", reply: "", ratio: "4:5", look: "", card: 0, note: "answer" };
  const 많은사진 = Array.from({ length: 30 }, (_, at) => 사진(at + 1));

  it("물음 줄의 사진을 못 찾아 멈추면 typedUnsaved 를 싣고 나머지 칸은 그대로다", async () => {
    지난줄 = [처음, 물음("q1", "photo", { wants: "image", ids: [사진(1)] })];
    판단 = 말답판단;
    사진못찾음 = true;
    const { status, json } = await 보낸다({ prompt: "1번은 우리 제품이야" });
    const { UNUSABLE_PHOTO } = await import("../../../easy/photo-check");
    expect(status).toBe(400);
    expect(json).toEqual({ ok: false, message: UNUSABLE_PHOTO, retryable: false, typedUnsaved: true });
    expect(남긴줄).toEqual([]);
  });

  it("이미지 턴이 사진 장수로 멈춰도 typedUnsaved 를 싣는다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = 말답판단;
    const { status, json } = await 보낸다({ prompt: "세로로", referenceIds: 많은사진 });
    expect(status).toBe(400);
    expect(json).toMatchObject({ ok: false, retryable: false, typedUnsaved: true });
    expect(Object.keys(json).sort()).toEqual(["message", "ok", "retryable", "typedUnsaved"]);
    expect(남긴줄).toEqual([]);
  });

  it("사용자 줄 저장이 실패하면 가린 글 그대로 typedUnsaved 를 싣는다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = 말답판단;
    사용자줄실패 = new Error("relation \"easy_messages\" does not exist");
    const { status, json } = await 보낸다({ prompt: "세로로" });
    expect(status).toBe(500);
    expect(json).toEqual({ ok: false, message: "만들지 못했습니다.", typedUnsaved: true });
  });

  it("답이 아닌 새 말이 남기기 전에 멈추면 예전 그대로 표시가 없다", async () => {
    판단 = { ...말답판단, note: "" };
    const { status, json } = await 보낸다({ prompt: "세로 포스터", referenceIds: 많은사진 });
    expect(status).toBe(400);
    expect(json.typedUnsaved).toBeUndefined();
    expect(json.typedAnswer).toBeUndefined();
  });

  it("단추 답이 남기기 전에 멈추면 예전 그대로 표시가 없다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    const { status, json } = await 보낸다({ prompt: "이대로 만들기", answersRowId: "q1", pick: { ratio: "1:1" }, referenceIds: 많은사진 });
    expect(status).toBe(400);
    expect(json.typedUnsaved).toBeUndefined();
  });

  it("사진 고르기가 열린 채 친 답(typed 단추 답)이 남기기 전에 멈춰도 표시가 없다 — 화면 줄에 이미 표시가 있다", async () => {
    지난줄 = [
      { ...처음, body: "1번 제품으로 포스터" },
      물음("q1", "photo", { wants: "image", reason: "unclear", mode: "image", rows: [{ id: 사진(1), role: "unclear" }], ids: [사진(1)] }),
    ];
    const pick = { photoRoles: [{ id: 사진(1), role: "preserve_product" }], typed: true };
    const { status, json } = await 보낸다({ prompt: "1번은 우리 원두 봉투야", answersRowId: "q1", pick, referenceIds: 많은사진 });
    expect(status).toBe(400);
    expect(json.typedUnsaved).toBeUndefined();
    expect(남긴줄).toEqual([]);
  });

  it("남긴 뒤 실패는 typedAnswer 만 싣는다 — 두 표시가 겹치지 않는다", async () => {
    지난줄 = [처음, 물음("q1", "ratio", { wants: "image" })];
    판단 = 말답판단;
    기획실패 = true;
    const { json } = await 보낸다({ prompt: "세로로" });
    expect(json.typedAnswer).toBe(true);
    expect(json.typedUnsaved).toBeUndefined();
  });
});
