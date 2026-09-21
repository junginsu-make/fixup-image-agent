import { beforeEach, describe, expect, it, vi } from "vitest";
import { imageCreditUnits } from "../../../../lib/credit-cost";

/**
 * **1장씩 쪼개 부르는 바람에 올림이 장마다 반복됐다**(F-7-7).
 *
 * 설계 §14.5: 「**1장씩 분할로 분석·올림 반복** | 계획 1회 + 논리 작업 정산,
 * 개별 생성 resume | W3/W4 / 청크 독립 금액」.
 * 설계 §7.2: 「한 번의 '전체 생성'은 **논리 작업 단위**로 예상 금액을 계산한다.
 * 내부 청크/섹션 분할 때문에 **올림이 반복되지 않는다.**」
 *
 * 화면의 「나머지 섹션 생성」은 자기 자신을 한 장씩 다시 부른다. 그래서 여덟
 * 장 채우기는 요청 여덟 번이고, 요청마다 `creditUnits` 가 따로 올림한다.
 *
 *   한 장  $0.165 → ceil(3.3)  = **4장**   ← 여덟 번이면 32장
 *   여덟 장 $1.32  → ceil(26.4) = **27장**
 *
 * **쪼갠 것은 우리 사정인데 값은 사용자가 낸다.** 열 장이면 7장(21%)을 더 낸다.
 *
 * ── 어떻게 고치나 ───────────────────────────────────────────
 *
 * 청크마다 「**논리 작업의 누적 금액**에서 앞서 청구한 만큼을 뺀 것」을 받는다.
 * 합치면 올림이 딱 한 번 일어난 것과 같아지고, 중간에 멈춰도 그때까지의 논리
 * 금액만 낸다 — 개별 생성 resume 이 그대로 산다.
 */

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), reserve: vi.fn(), finalize: vi.fn(), settle: vi.fn(), generate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: mocks.auth, reserveAiUsage: mocks.reserve,
  finalizeAiUsage: mocks.finalize, settleAiUsage: mocks.settle,
}));
vi.mock("../../../../lib/server-keys", () => ({ resolveOpenaiKey: () => "test", resolveGoogleKey: () => "test" }));
vi.mock("../../../../lib/redesign/image-generator", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/redesign/image-generator")>(
    "../../../../lib/redesign/image-generator",
  );
  return { ...actual, createRedesignImageGenerator: () => async () => ({ buffer: Buffer.from("IMG"), mimeType: "image/png" }) };
});
vi.mock("../../../../lib/characters", () => ({ loadCharacterView: async () => null }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("@fixup/redesign-core", async () => ({
  ...(await vi.importActual("@fixup/redesign-core")), generateSections: mocks.generate,
}));

const { POST: generate } = await import("../generate/route");

/** 한 청크(1장)를 부른다. `jobIndex` 는 논리 작업 안에서 몇 번째인가. */
const 청크 = async (jobIndex: number, jobTotal: number, extra: Record<string, string> = {}) => {
  const form = new FormData();
  form.append("files", new File(["image"], "p.png", { type: "image/png" }));
  form.append("model", "openai");
  form.append("count", "1");
  form.append("startSection", String(jobIndex));
  form.append("jobIndex", String(jobIndex));
  form.append("jobTotal", String(jobTotal));
  for (const [key, value] of Object.entries(extra)) form.append(key, value);
  return generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));
};

const 예약한장 = () => mocks.reserve.mock.calls.map((call) => call[2] as number);
const 차감한장 = () => mocks.settle.mock.calls.map((call) => call[2] as number);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
  mocks.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1" });
  mocks.settle.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValue({ project: { sections: [{ imageUrl: "result" }] } });
});

describe("쪼개 불러도 한 번에 부른 값과 같다", () => {
  it("**여덟 번 나눠 부른 합이 한 번에 여덟 장 값과 같다**", async () => {
    for (let i = 1; i <= 8; i += 1) await 청크(i, 8);

    const 합 = 차감한장().reduce((a, b) => a + b, 0);
    expect(합).toBe(imageCreditUnits("gpt-image-2.5-flare", 8));
  });

  it("**예약도 같은 셈이다** — 예약과 차감이 갈리면 장부가 어긋난다", async () => {
    for (let i = 1; i <= 8; i += 1) await 청크(i, 8);

    expect(예약한장()).toEqual(차감한장());
  });

  /**
   * **중간에 멈춰도 그때까지의 논리 금액만 낸다.** 개별 생성 resume 이 이
   * 성질 위에 선다.
   */
  it("**세 장에서 멈추면 세 장짜리 작업 값이다**", async () => {
    for (let i = 1; i <= 3; i += 1) await 청크(i, 8);

    const 합 = 차감한장().reduce((a, b) => a + b, 0);
    expect(합).toBe(imageCreditUnits("gpt-image-2.5-flare", 3));
  });

  /**
   * **올림이 반복되면 이보다 커진다.** 이 시험이 그것을 값으로 잡는다.
   */
  it("**장마다 올림하던 옛 셈보다 적다**", async () => {
    for (let i = 1; i <= 8; i += 1) await 청크(i, 8);

    const 합 = 차감한장().reduce((a, b) => a + b, 0);
    const 옛셈 = imageCreditUnits("gpt-image-2.5-flare", 1) * 8;
    expect(합).toBeLessThan(옛셈);
  });

  it("**한 장짜리 작업은 전과 같다** — 쪼갤 것이 없다", async () => {
    await 청크(1, 1);

    expect(차감한장()[0]).toBe(imageCreditUnits("gpt-image-2.5-flare", 1));
  });

  /**
   * **작업 정보가 없으면 전과 같이 센다.** 옛 화면이나 바깥 호출이 들어와도
   * 값이 틀어지면 안 된다.
   */
  it("**작업 정보가 없으면 한 장 값이다**", async () => {
    const form = new FormData();
    form.append("files", new File(["image"], "p.png", { type: "image/png" }));
    form.append("count", "1");
    await generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));

    expect(차감한장()[0]).toBe(imageCreditUnits("gpt-image-2.5-flare", 1));
  });

  /**
   * **못 만들었으면 안 받는다.** 증분이라고 해서 달라지지 않는다.
   */
  it("**실패한 청크는 0장이다**", async () => {
    mocks.generate.mockResolvedValue({ project: { sections: [] } });

    await 청크(3, 8);

    expect(차감한장()[0]).toBe(0);
  });
});

/**
 * **계획 1회**(F-7-7 의 나머지 절반).
 *
 * 청크마다 분석을 다시 돌리면 글 모델 값이 청크 수만큼 늘고, 무엇보다
 * **청크마다 다른 계획**이 나온다 — 1~2장과 3~4장이 서로 다른 전략으로
 * 그려진다.
 */
describe("이미 한 기획을 코어에 넘긴다", () => {
  it("**화면이 보낸 분석을 그대로 싣는다**", async () => {
    const 분석 = { strategy: "효능을 앞세운다", product_inferred: { category: "크림" } };

    await 청크(2, 8, { analysis: JSON.stringify(분석) });

    const 넘긴것 = mocks.generate.mock.calls[0]![0] as { analysis?: unknown };
    expect(넘긴것.analysis).toEqual(분석);
  });

  it("**안 보내면 안 싣는다** — 코어가 전과 같이 분석한다", async () => {
    await 청크(1, 8);

    const 넘긴것 = mocks.generate.mock.calls[0]![0] as { analysis?: unknown };
    expect(넘긴것.analysis).toBeUndefined();
  });

  /**
   * **깨진 글이 와도 죽지 않는다.** 화면 사본이 잘렸거나 옛 판일 수 있다.
   * 그때는 안 실으면 코어가 다시 분석한다 — 생성이 멎는 쪽이 더 나쁘다.
   */
  it("**JSON 이 아니면 그냥 안 싣는다**", async () => {
    const response = await 청크(2, 8, { analysis: "{깨진" });

    expect(response.status).toBe(200);
    const 넘긴것 = mocks.generate.mock.calls[0]![0] as { analysis?: unknown };
    expect(넘긴것.analysis).toBeUndefined();
  });

  /**
   * **너무 크면 안 싣는다.** 분석은 몇 KB 짜리 요약이다. 그보다 크면 화면이
   * 보낸 것이 분석이 아니다.
   */
  it("**너무 크면 안 싣는다**", async () => {
    const 큰것 = JSON.stringify({ strategy: "가".repeat(80_000) });

    await 청크(2, 8, { analysis: 큰것 });

    const 넘긴것 = mocks.generate.mock.calls[0]![0] as { analysis?: unknown };
    expect(넘긴것.analysis).toBeUndefined();
  });
});

/**
 * **화면이 자리를 말하면 금액이 따라온다. 그래서 자리를 믿으면 안 된다.**
 *
 * 2026-09-21 리뷰에서 실측으로 드러났다.
 *
 * ```
 * jobIndex=1e17   → 예약 0 · 차감 0      ← 공짜
 * jobIndex=1e308  → 예약 NaN            ← 장부가 터진다
 * jobIndex=2      → 5장이 4장            ← 상시 할인
 * ```
 *
 * 0 은 **그냥 싼 것이 아니다.** `reserve_generation` 의 동시 생성 검사는
 * `elsif p_units > 0 then` 안에 있고, 월 한도 검사도 `v_used + v_reserved + 0`
 * 이라 늘 통과한다. **한도를 다 쓴 계정이 무제한으로 유료 이미지를 만든다** —
 * 장부에는 `requested_units=0` 행만 남아 눈에도 안 띈다.
 *
 * 그래서 경계에서 막는다. 자리는 1 이상, 모두 몇 장 이하, 10 이하다.
 */
describe("자리를 꾸며 보내면 거절한다", () => {
  const 거절되는자리: Array<[string, string, string]> = [
    ["아주 큰 수", "100000000000000000", "8"],
    ["더 큰 수", "1e308", "8"],
    ["칸 수보다 큰 자리", "9", "8"],
    ["상한을 넘는 자리", "11", "11"],
    ["0", "0", "8"],
    ["음수", "-5", "8"],
    ["숫자가 아님", "abc", "8"],
    ["소수", "1.5", "8"],
  ];

  it.each(거절되는자리)("**%s 는 거절한다**", async (_label, jobIndex, jobTotal) => {
    const form = new FormData();
    form.append("files", new File(["image"], "p.png", { type: "image/png" }));
    form.append("count", "1");
    form.append("jobIndex", jobIndex);
    form.append("jobTotal", jobTotal);

    const response = await generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));

    expect(response.status).toBe(400);
    // 값싼 거절이 한도를 태우면 안 된다.
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("**모두 몇 장인지 없이 자리만 보내면 거절한다**", async () => {
    const form = new FormData();
    form.append("files", new File(["image"], "p.png", { type: "image/png" }));
    form.append("count", "1");
    form.append("jobIndex", "5");

    const response = await generate(new Request("http://local/api/redesign/generate", { method: "POST", body: form }));

    expect(response.status).toBe(400);
  });

  /**
   * **막은 뒤에도 남는 것이 있다.** 자리를 1~10 으로 조여도 매번 마지막
   * 자리를 보내면 한 장당 한 칸까지 덜 낼 수 있다. 그것이 얼마인지 값으로
   * 적어 둔다 — 감수 범위를 말로만 두면 다음 사람이 얼마인지 모른다.
   */
  it("**꾸며서 덜 내도 한 장을 못 넘는다**", async () => {
    await 청크(10, 10);
    const 꾸민것 = 차감한장()[0]!;

    mocks.settle.mockClear();
    await 청크(1, 1);
    const 정직한것 = 차감한장()[0]!;

    expect(정직한것 - 꾸민것).toBeLessThanOrEqual(1);
  });

  it("**예약은 절대 0 이나 NaN 이 아니다**", async () => {
    for (let i = 1; i <= 10; i += 1) await 청크(i, 10);

    for (const 장 of 예약한장()) {
      expect(Number.isFinite(장)).toBe(true);
      expect(장).toBeGreaterThan(0);
    }
  });
});

