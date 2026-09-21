import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * **아무리 올려도 막는 것이 없었다**(C-7 의 「누적 목록」).
 *
 * 설계 §14.3: 「레퍼런스 body·용량·횟수·**누적 목록** 제한 없음 | 수정 |
 * W8 / T-LIMIT, pagination」.
 *
 * 네 갈래 중 셋(본문 크기·파일 용량/화소·시간당 횟수)과 pagination 은
 * 닫혔는데 **누적만 남아 있었다.** `registerUserStyleReference` 가 넣기 전에
 * 기존 행을 세지 않고, 표에도 쿼터가 없다.
 *
 * 실질 상한은 **시간당 60회뿐**이라 하루면 1,440장, 한 달이면 사실상 무제한이다.
 *
 * ── 몇 장으로 정했나 ────────────────────────────────────────
 *
 * **모델이 읽는 것은 최신 40장뿐이다**(`loadUserReferenceCandidates` 의
 * `limit(MAX_USER_REFERENCES)`). 그보다 많은 것은 고르는 데 **한 번도 쓰이지
 * 않고** 창고만 먹는다.
 *
 * 그렇다고 40 에서 막으면 모아 두고 고르는 쓰임을 끊는다. 목록 한 쪽
 * (`STYLE_REFERENCE_PAGE_MAX` = 200)을 상한으로 둔다 — 모델이 보는 창의 다섯
 * 배고, 한 쪽에 다 보이므로 지울 것을 찾기도 쉽다.
 */

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  reserve: vi.fn(),
  settle: vi.fn(),
  register: vi.fn(),
  count: vi.fn(),
}));

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: mocks.reserve,
  settleAiUsage: mocks.settle,
}));

vi.mock("../../../../lib/user-style-references", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    registerUserStyleReference: mocks.register,
    listUserStyleReferences: async () => ({ references: [], total: 0, nextOffset: null, failed: false }),
    deleteUserStyleReference: async () => ({ ok: true as const, deleted: true }),
    ownerOfStyleReference: async () => null,
    countUserStyleReferences: mocks.count,
  };
});

const { POST } = await import("../style-references/route");

const png = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 120, b: 40 } } })
    .png()
    .toBuffer();

const 올린다 = async () =>
  POST(
    new Request("http://localhost/api/pdp/style-references", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64: (await png()).toString("base64"), mimeType: "image/png" }),
    }),
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "r1", usage: {} });
  mocks.settle.mockResolvedValue({});
  mocks.register.mockResolvedValue({ ok: true, id: "new-id", description: "설명" });
  mocks.count.mockResolvedValue(3);
});

describe("한도 안이면 그대로 올라간다", () => {
  it("**올라간다**", async () => {
    const response = await 올린다();

    expect(response.status).toBe(200);
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });
});

describe("쌓인 것이 한도에 닿으면 막는다", () => {
  it("**한도를 채웠으면 거절한다**", async () => {
    const { STYLE_REFERENCE_MAX_PER_USER } = await import("../../../../lib/pdp/reference-limits");
    mocks.count.mockResolvedValue(STYLE_REFERENCE_MAX_PER_USER);

    const response = await 올린다();

    expect(response.status).toBe(409);
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("**딱 하나 모자라면 통과한다** — 약속한 수는 반드시 된다", async () => {
    const { STYLE_REFERENCE_MAX_PER_USER } = await import("../../../../lib/pdp/reference-limits");
    mocks.count.mockResolvedValue(STYLE_REFERENCE_MAX_PER_USER - 1);

    expect((await 올린다()).status).toBe(200);
  });

  /**
   * **값싼 실패로 한도를 태우지 않는다**(C-9 와 같은 판단). 여기서 끝나는
   * 것은 글 모델을 부르기 전이다.
   */
  it("**막힌 요청은 예약도 안 한다**", async () => {
    const { STYLE_REFERENCE_MAX_PER_USER } = await import("../../../../lib/pdp/reference-limits");
    mocks.count.mockResolvedValue(STYLE_REFERENCE_MAX_PER_USER + 10);

    await 올린다();

    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  /**
   * **무엇을 하면 되는지 말한다.** 「한도입니다」만 말하면 사용자는 무엇을
   * 지워야 할지 모른다.
   */
  it("**어떻게 하면 되는지 붙는다**", async () => {
    const { STYLE_REFERENCE_MAX_PER_USER } = await import("../../../../lib/pdp/reference-limits");
    mocks.count.mockResolvedValue(STYLE_REFERENCE_MAX_PER_USER);

    const body = await (await 올린다()).json() as { message?: string };

    expect(body.message).toContain(String(STYLE_REFERENCE_MAX_PER_USER));
    expect(body.message).toMatch(/지운|지우/);
  });

  it("**사용자에게 보이는 말에 줄표를 안 쓴다**", async () => {
    const { STYLE_REFERENCE_MAX_PER_USER } = await import("../../../../lib/pdp/reference-limits");
    mocks.count.mockResolvedValue(STYLE_REFERENCE_MAX_PER_USER);

    const body = await (await 올린다()).json() as { message?: string };

    expect(body.message).not.toContain("—");
  });

  /**
   * **못 세면 막지 않는다.** 표가 잠깐 안 읽히는 날 올리기가 통째로 멎으면
   * 안 된다. 세는 것은 방어이지 기능이 아니다.
   */
  it("**못 세면 그냥 진행한다**", async () => {
    mocks.count.mockRejectedValue(new Error("표를 못 읽었습니다"));

    expect((await 올린다()).status).toBe(200);
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });
});

describe("상한 값의 근거", () => {
  it("**모델이 읽는 수보다 넉넉하다** — 모아 두고 고르는 쓰임을 끊지 않는다", async () => {
    const { STYLE_REFERENCE_MAX_PER_USER } = await import("../../../../lib/pdp/reference-limits");
    const { MAX_USER_REFERENCES, STYLE_REFERENCE_PAGE_MAX } =
      await import("../../../../lib/user-style-references");

    expect(STYLE_REFERENCE_MAX_PER_USER).toBeGreaterThan(MAX_USER_REFERENCES);
    // 목록 한 쪽에 다 보여야 지울 것을 찾기 쉽다.
    expect(STYLE_REFERENCE_MAX_PER_USER).toBeLessThanOrEqual(STYLE_REFERENCE_PAGE_MAX);
  });
});
