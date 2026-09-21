import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: vi.fn(), reserve: vi.fn(), settle: vi.fn(), generate: vi.fn(),
  recorder: vi.fn(), makeRecorder: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: state.auth, reserveAiUsage: state.reserve,
  finalizeAiUsage: vi.fn(), settleAiUsage: state.settle,
}));
vi.mock("@fixup/pdp-core", async () => {
  const actual = await vi.importActual<typeof import("@fixup/pdp-core")>("@fixup/pdp-core");
  return { ...actual, generateSectionImage: state.generate };
});
vi.mock("../../../../lib/pdp/providers", () => ({ createPdpProviders: () => ({ llm: { generate: vi.fn() } }) }));
vi.mock("../../../../lib/characters", () => ({ loadCharacterView: vi.fn() }));
vi.mock("../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));
vi.mock("../../../../lib/pdp/jobs/recorder", () => ({ createJobRecorder: state.makeRecorder }));

const { POST: batch } = await import("../images/batch/route");

const section = { section_id: "s1", headline: "제품", bullets: [], prompt_en: "a product", layout_notes: "" };
const request = (data: unknown) =>
  new Request("http://local/api/pdp", { method: "POST", body: JSON.stringify(data) });
const body = () => ({ originalImageBase64: "AAAA", aspectRatio: "3:4", sections: [section] });

beforeEach(() => {
  vi.resetAllMocks();
  state.auth.mockResolvedValue({ ok: true, member: { userId: "u1" } });
  state.reserve.mockResolvedValue({ ok: true, userId: "u1", requestId: "res-1" });
  state.settle.mockResolvedValue(undefined);
  state.generate.mockResolvedValue({ imageBase64: "RESULT", mimeType: "image/png", generatedImages: 1 });
  state.recorder.mockReturnValue(undefined);
  state.makeRecorder.mockImplementation(async () => ({
    jobId: "job-1",
    started: state.recorder,
    sectionDone: state.recorder,
    finished: state.recorder,
  }));
});

/**
 * **스위치가 꺼져 있으면 지금과 한 글자도 다르지 않아야 한다.**
 *
 * 이 라우트는 돈이 오가는 자리다. 새 코드가 붙었다는 이유로 동작이 달라지면
 * 안 되고, 켜기 전까지는 있는 줄도 몰라야 한다.
 */
describe("스위치가 꺼져 있을 때", () => {
  it("기록기를 아예 만들지 않는다", async () => {
    const response = await batch(request(body()));

    expect(response.status).toBe(200);
    expect(state.makeRecorder).not.toHaveBeenCalled();
  });

  it("응답이 그대로다", async () => {
    const response = await batch(request(body()));
    const json = await response.json();

    expect(json.succeeded).toBe(1);
    expect(json.results[0].imageBase64).toBe("RESULT");
  });
});

describe("스위치가 켜졌을 때", () => {
  const 켜고 = async (data: unknown = body()) => {
    process.env.PDP_JOBS_ENABLED = "1";
    try {
      return await batch(request(data));
    } finally {
      delete process.env.PDP_JOBS_ENABLED;
    }
  };

  it("작업을 만들고 결과를 적는다", async () => {
    await 켜고();

    expect(state.makeRecorder).toHaveBeenCalledTimes(1);
    const options = state.makeRecorder.mock.calls[0]![0] as { enabled: boolean; input: Record<string, unknown> };
    expect(options.enabled).toBe(true);
    // 예약 식별자는 **서버가 정한다.** 클라이언트가 제출하지 않는다.
    expect(options.input.reservationRequestId).toBe("res-1");
    expect(options.input.userId).toBe("u1");
  });

  it("**그림이 나온 섹션마다 적는다**", async () => {
    await 켜고({ ...body(), sections: [section, { ...section, section_id: "s2" }] });

    // started 1 + sectionDone 2 + finished 1
    expect(state.recorder).toHaveBeenCalledTimes(4);
  });

  it("**실패한 섹션은 적지 않는다** — 적을 그림이 없다", async () => {
    state.generate
      .mockResolvedValueOnce({ imageBase64: "OK", mimeType: "image/png", generatedImages: 1 })
      .mockRejectedValueOnce(new Error("fal down"));

    await 켜고({ ...body(), sections: [section, { ...section, section_id: "s2" }] });

    // started 1 + sectionDone 1(성공한 것만) + finished 1
    expect(state.recorder).toHaveBeenCalledTimes(3);
  });

  it("응답은 꺼져 있을 때와 같다 — 기록은 곁다리다", async () => {
    const response = await 켜고();
    const json = await response.json();

    expect(json.succeeded).toBe(1);
    expect(json.results[0].imageBase64).toBe("RESULT");
  });

  it("**기록기가 터져도 그림은 나간다**", async () => {
    state.makeRecorder.mockRejectedValue(new Error("DB down"));

    const response = await 켜고();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.results[0].imageBase64).toBe("RESULT");
  });
});

/*
  **작업 번호는 응답에 안 싣는다**(K-04 리뷰 MEDIUM).

  한때 실었다. 그런데 화면은 그것을 안 쓴다 — 탭을 닫고 나간 사용자는 응답을
  못 받은 사람이라, 번호로 찾는 길이 애초에 안 통한다. 화면은 자기 초안
  번호로 묻는다(`GET /api/pdp/jobs?documentId=`). 설계 §8.3 의 응답 규격에도
  이 칸은 없다.

  아무도 안 쓰는 칸을 두면 그 칸만 지키는 시험이 남아, 다음 사람이 「쓰이는
  값」으로 오해한다.
*/
