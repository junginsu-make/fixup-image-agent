import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  auth: vi.fn(), reserve: vi.fn(), settle: vi.fn(), generate: vi.fn(),
  recorder: vi.fn(), failed: vi.fn(), makeRecorder: vi.fn(),
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
    sectionFailed: state.failed,
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

  /**
   * **안 나온 장도 적는다**(F-7-8).
   *
   * 전에는 성공한 것만 적었다. 그래서 되찾을 때 서버가 아는 것은 「만들어진
   * 것」뿐이고 **왜 빠졌는지는 아무 데도 안 남았다** — 사용자는 집계 숫자만
   * 보고 여덟 장을 통째로 다시 만든다.
   *
   * 설계 §14.6: 「failedSections 미표시 | **영구 상태·섹션별 실패/미시도 이유
   * 표시**」.
   */
  it("**안 나온 섹션은 까닭과 함께 적는다**", async () => {
    state.generate
      .mockResolvedValueOnce({ imageBase64: "OK", mimeType: "image/png", generatedImages: 1 })
      .mockRejectedValueOnce(new Error("fal down"));

    await 켜고({ ...body(), sections: [section, { ...section, section_id: "s2" }] });

    // 성공한 것은 그림으로, 실패한 것은 까닭으로.
    expect(state.recorder).toHaveBeenCalledTimes(3); // started + sectionDone 1 + finished
    expect(state.failed).toHaveBeenCalledTimes(1);
    expect(state.failed).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: "s2", errorCode: expect.any(String) }),
    );
  });

  it("**다 나오면 실패는 안 적는다**", async () => {
    await 켜고({ ...body(), sections: [section, { ...section, section_id: "s2" }] });

    expect(state.failed).not.toHaveBeenCalled();
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

/**
 * **원가 기록이 실패하면 정산 완료라고 하지 않는다**(N-6, 설계 §8.4).
 *
 * 전에는 `settled: Boolean(usage)` 였다. 그런데 `usage` 는 **비용 기록 실패와
 * 무관하게** 돌아온다 — 기록 실패는 로그에만 남았다. 그래서 **돈이 새는
 * 요청이 「정산 완료」로 닫혀** 아무도 다시 안 봤다.
 */
describe("원가 기록이 실패하면", () => {
  const 켜고 = async (settleResult: unknown) => {
    state.settle.mockResolvedValue(settleResult);
    process.env.PDP_JOBS_ENABLED = "1";
    try {
      await batch(request(body()));
    } finally {
      delete process.env.PDP_JOBS_ENABLED;
    }
    const 마무리 = state.recorder.mock.calls.at(-1)?.[0] as { settled?: boolean } | undefined;
    return 마무리;
  };

  it("**정산 완료로 닫지 않는다**", async () => {
    const 마무리 = await 켜고({ used: 1, quota: 100, costRecorded: false });

    expect(마무리?.settled).toBe(false);
  });

  it("**잘 적었으면 완료로 닫는다**", async () => {
    const 마무리 = await 켜고({ used: 1, quota: 100, costRecorded: true });

    expect(마무리?.settled).toBe(true);
  });

  /**
   * **비용을 안 넘긴 요청은 적을 것이 없다.** 그때까지 미완으로 보면 재처리
   * 대상이 쓸데없이 는다.
   */
  it("**그 칸이 아예 없으면 완료로 닫는다**", async () => {
    const 마무리 = await 켜고({ used: 1, quota: 100 });

    expect(마무리?.settled).toBe(true);
  });

  it("**정산 자체를 못 했으면 완료가 아니다**", async () => {
    const 마무리 = await 켜고(undefined);

    expect(마무리?.settled).toBe(false);
  });
});
