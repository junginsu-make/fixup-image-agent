import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **제공자가 거절했을 때 상태 조회가 무엇을 하는가.**
 *
 * 2026-09-16 실측: 포스터를 글만으로 만들었더니 fal 이 `422`(content checker)로
 * 거절했고 청구는 `$0.00` 이었다. 그런데 화면에는 「500 Internal Server Error」만
 * 떴고, 예약한 장은 10분 동안 그 사람 한도에서 묶여 있었다 — 쓰지도 않은 장이.
 *
 * 가르는 규칙 자체는 `lib/fal/failure.ts` 가 값으로 재고 있다. **여기서 보는 것은
 * 그 판단이 라우트에 실제로 닿았는가** — 상태 코드와 예약 해제다. 규칙만 고치고
 * 라우트가 안 부르면 아무것도 안 바뀐다.
 */

vi.mock("server-only", () => ({}));

const finalized: Array<{ success: boolean; units: number; error?: string }> = [];
const updates: Array<Record<string, unknown>> = [];
let project: { id: string; modelId: string; data: Record<string, unknown> } | undefined;
/** `jobResult` 가 던질 것. 시험마다 바꾼다. */
let resultThrows: unknown = null;
/** fal 을 물었는가(엔드포인트 검사가 그 앞에서 막는지 본다). */
let falAsked = 0;
/** 참이면 `createPosterFalClients` 가 진짜처럼 설정 오류를 던진다. */
let falKeyMissing = false;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true as const, member: { userId: "u1", profile: { role: "member" } } }),
  finalizeAiUsage: async (
    _reservation: unknown, success: boolean, units: number, errorCode?: string,
  ) => { finalized.push({ success, units, error: errorCode }); },
}));

vi.mock("../../../../lib/poster/stores", () => ({
  posterStoresForUser: () => ({
    projects: {
      get: async () => project,
      update: async (_id: string, patch: Record<string, unknown>) => {
        updates.push(patch);
        Object.assign(project!, patch);
        return project;
      },
    },
    requests: { unitCost: async () => 0.1, complete: async () => {} },
    images: { byProject: async () => [], add: async () => [] },
  }),
}));

vi.mock("../../../../lib/poster/providers", () => {
  // 진짜와 같은 문장이다 — 환경변수 이름이 화면에 새는지 본다.
  class PosterProviderConfigurationError extends Error {
    constructor(readonly missing: string[]) {
      super(`다음 환경변수가 없어 포스터를 만들 수 없습니다: ${missing.join(", ")}`);
    }
  }
  return {
    createPosterFalClients: () => {
      if (falKeyMissing) throw new PosterProviderConfigurationError(["FAL_KEY"]);
      return {
        queue: {
          jobStatus: async () => { falAsked += 1; return "completed"; },
          jobResult: async () => {
            falAsked += 1;
            if (resultThrows) throw resultThrows;
            return { images: [] };
          },
        },
      };
    },
    PosterProviderConfigurationError,
  };
});

const { POST } = await import("../projects/[id]/status/route");

const call = (endpoint = "openai/gpt-image-2.5/sunburst/edit") =>
  POST(
    new Request("http://localhost/api/poster/projects/p1/status", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestRowId: "r1", falRequestId: "f1", endpoint }),
    }),
    { params: Promise.resolve({ id: "p1" }) },
  );

/** fal 클라이언트가 던지는 모양. `status` 를 실은 `Error` 다. */
const falError = (status: number, message: string) =>
  Object.assign(new Error(message), { name: "ApiError", status });

let errors: ReturnType<typeof vi.spyOn>;
const logged = () => errors.mock.calls.flat().map(String).join(" ");

beforeEach(() => {
  errors = vi.spyOn(console, "error").mockImplementation(() => {});
  finalized.length = 0;
  updates.length = 0;
  resultThrows = null;
  falAsked = 0;
  falKeyMissing = false;
  project = { id: "p1", modelId: "gpt-image-2.5-sunburst", data: { reservationId: "res-1" } };
});
afterEach(() => errors.mockRestore());

describe("제공자가 거절하면", () => {
  /** 이것이 실제로 난 일이다. 500 이면 「우리가 고장났다」는 뜻이 된다. */
  it("500 이 아니라 그 상태를 그대로 돌려준다", async () => {
    resultThrows = falError(422, "flagged by a content checker");
    const response = await call();

    expect(response.status).toBe(422);
  });

  it("무엇을 하라고 한국어로 알려 준다", async () => {
    resultThrows = falError(422, "flagged by a content checker");
    const body = await (await call()).json();

    expect(body.ok).toBe(false);
    expect(body.kind).toBe("rejected");
    expect(body.message).toContain("거절");
  });

  /**
   * 운영자는 이 원문으로 fal 기록을 찾는다. 버리면 못 찾는다 — **서버 기록에** 남긴다(2026-10-07 후속
   * Task 12). 전에는 응답의 `detail` 칸에 실었는데 화면 셋(포스터 · 쉽게 · 셸 폴러) 다 안 읽고, fal 원문에는
   * 계정 잠김 사유처럼 고객에게 보이면 안 되는 말이 섞일 수 있다(`lib/fal/queue.ts`).
   */
  it("제공자가 준 원문은 서버 기록에만 남기고 응답에는 싣지 않는다", async () => {
    resultThrows = falError(422, "flagged by a content checker");
    const text = await (await call()).text();

    expect(JSON.parse(text).detail).toBeUndefined();
    expect(text).not.toContain("flagged by a content checker");
    expect(logged()).toContain("flagged by a content checker");
  });

  /**
   * **핵심.** 돈이 안 나갔는데 장이 묶여 있으면 쓰지도 않은 몫만큼 한도가 준다.
   * 안 풀면 10분(`reserve_generation` 의 `interval '10 minutes'`)을 기다려야 한다.
   */
  it("묶어 둔 장을 바로 돌려준다", async () => {
    resultThrows = falError(422, "flagged by a content checker");
    await call();

    expect(finalized).toHaveLength(1);
    expect(finalized[0]!.success).toBe(false);
    expect(finalized[0]!.units).toBe(0);
  });

  /** 자리도 돌려준다. 안 그러면 창이 지날 때까지 다시 못 누른다. */
  it("작업을 다시 누를 수 있는 상태로 되돌린다", async () => {
    resultThrows = falError(422, "flagged by a content checker");
    await call();

    expect(updates.some((patch) => patch.status === "ready")).toBe(true);
  });

  /** 열쇠를 안 지우면 다음 만들기가 옛 열쇠로 확정해 엉뚱한 요청을 닫는다. */
  it("쓴 예약 열쇠를 지운다", async () => {
    resultThrows = falError(422, "flagged by a content checker");
    await call();

    const patch = updates.find((entry) => entry.status === "ready");
    expect((patch?.data as { reservationId?: string } | undefined)?.reservationId).toBeUndefined();
  });
});

describe("제공자가 바쁘거나 터지면", () => {
  it("429 는 그대로 429 다", async () => {
    resultThrows = falError(429, "rate limited");
    expect((await call()).status).toBe(429);
  });

  /** 남의 고장을 우리 500 으로 말하지 않는다. */
  it("제공자 5xx 는 502 로 알린다", async () => {
    resultThrows = falError(503, "upstream down");
    expect((await call()).status).toBe(502);
  });

  it("둘 다 장을 돌려준다 — 돈이 안 나갔다", async () => {
    for (const status of [429, 503]) {
      finalized.length = 0;
      project = { id: "p1", modelId: "m", data: { reservationId: "res-1" } };
      resultThrows = falError(status, "x");
      await call();

      expect(finalized).toHaveLength(1);
    }
  });
});

/**
 * **우리 쪽에서 터진 것은 다르게 다룬다.**
 *
 * 어디서 터졌는지 모르는데 fal 은 이미 그려서 돈을 받았을 수 있다. 그때 장을
 * 풀면 공짜로 한 장을 준 셈이다. 만료에 맡기는 편이 안전하다.
 */
describe("우리 쪽에서 터지면", () => {
  it("500 을 돌려준다", async () => {
    resultThrows = new Error("그림을 저장하지 못했습니다.");
    expect((await call()).status).toBe(500);
  });

  it("장을 풀지 않는다 — 이미 그려졌을 수 있다", async () => {
    resultThrows = new Error("그림을 저장하지 못했습니다.");
    await call();

    expect(finalized).toHaveLength(0);
  });
});

/**
 * **모르는 엔드포인트는 받지 않는다**(최종 보안 리뷰 M1). 이 값은 브라우저가 준다 — 포스터가 쓰는 모델
 * 엔드포인트(`@fixup/sns-core` 의 `IMAGE_MODELS`)만 받아, 키가 실린 조회가 남의 주소로 가지 않게 한다.
 */
describe("엔드포인트", () => {
  it("포스터 모델의 엔드포인트가 아니면 400 — fal 을 묻지 않는다", async () => {
    for (const endpoint of ["https://xxxfal.run/fal-ai/nano-banana", "openai/x", "fal-ai/../evil"]) {
      const response = await call(endpoint);
      expect(response.status, endpoint).toBe(400);
    }
    expect(falAsked).toBe(0);
    expect(finalized).toHaveLength(0);
  });

  it("포스터 모델의 엔드포인트는 모두 받는다", async () => {
    const { IMAGE_MODELS } = await import("@fixup/sns-core");
    for (const model of IMAGE_MODELS) {
      for (const endpoint of [model.t2i.endpoint, model.i2i.endpoint]) {
        expect((await call(endpoint)).status, endpoint).toBe(200);
      }
    }
  });
});

/** 멀쩡히 끝나는 길이 안 깨졌는지도 본다. */
describe("정상 완료", () => {
  it("200 을 돌려준다", async () => {
    const response = await call();

    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
  });
});

/**
 * **결과가 사라진 것은 거절과 다르게 말해야 한다.**
 *
 * fal 이 「This request has no output」을 돌려주는 경우다 — 만료·삭제·용량
 * 한도(2026-09-16 사용자 보고). 오래된 작업을 다시 열 때 생긴다. 초판은 404 를
 * 거절에 묶어 「지시 문구를 바꾸세요」라고 말했다. 문구는 멀쩡했다.
 */
describe("결과가 사라졌으면", () => {
  const gone = () =>
    Object.assign(new Error("This request has no output"), { name: "ApiError", status: 404 });

  /**
   * **404 를 그대로 돌려주지 않는다.** 셸 폴러가 404 를 「작업이 아예 없다」로
   * 읽고 목록에서 지운다(`running-jobs.tsx:126`). 작업은 있고 결과만 없다.
   */
  it("410 으로 알린다", async () => {
    resultThrows = gone();
    expect((await call()).status).toBe(410);
  });

  it("다시 만들라고 말한다 — 문구를 고치라고 하지 않는다", async () => {
    resultThrows = gone();
    const body = await (await call()).json();

    expect(body.kind).toBe("gone");
    expect(body.message).toContain("다시 만들");
    expect(body.message).not.toContain("문구를 바꾸");
  });

  it("묶어 둔 장을 돌려준다", async () => {
    resultThrows = gone();
    await call();

    expect(finalized).toHaveLength(1);
    expect(finalized[0]!.success).toBe(false);
  });

  /** 종류를 밝혀 보내야 셸이 「만드는 중」에서 지운다(`jobDone`). */
  it("종류를 밝혀 보낸다", async () => {
    resultThrows = gone();
    const body = await (await call()).json();

    expect(typeof body.kind).toBe("string");
  });
});

/**
 * **예상 못 한 오류의 원문을 화면에 보내지 않는다**(2026-10-07 후속 Task 12).
 *
 * 화면이 되풀이해 묻는 길이다(포스터 화면 · 쉽게 `collect.ts` · 셸 폴러). **상태 코드와 `kind` 는 전과
 * 같다** — 셸은 404 면 지우고 `kind` 가 있으면 끝으로 본다(`jobDone`). 글만 바꾼다.
 */
describe("예상 못 한 오류는 원문 대신 우리 문장으로", () => {
  it("우리 쪽 원문(저장소 글 · 서명 주소)은 응답에 없고, 주소를 가려 서버 기록에만", async () => {
    resultThrows = new Error('new row violates row-level security policy for table "objects" (https://abc.supabase.co/storage/v1/object/library/x?token=secret)');
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      ok: false, kind: "fault", message: "만든 그림을 가져오지 못했습니다. 잠시 뒤 다시 확인해 주세요.",
    });
    expect(text).not.toContain("row-level security");
    expect(text).not.toContain("supabase");
    expect(logged()).toContain("row-level security");
    expect(logged()).not.toContain("https://");
  });

  it("설정 오류는 503 그대로, 환경변수 이름과 `missing` 칸은 화면에 안 보낸다", async () => {
    falKeyMissing = true;
    const response = await call();
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ ok: false, message: "만든 그림을 가져오지 못했습니다. 잠시 뒤 다시 확인해 주세요." });
    expect(text).not.toContain("FAL_KEY");
    expect(logged()).toContain("FAL_KEY");
    // 돈 흐름 그대로 — 설정 오류는 장을 풀지 않는다(전과 같다).
    expect(finalized).toHaveLength(0);
  });

  /* 셸 폴러가 응답을 읽는 규칙(`lib/running-jobs.ts` 의 `jobDone`)이 전과 같은 답을 내는지. */
  it("셸은 설정 오류면 계속 묻고, 제공자 거절이면 끝으로 본다 — 전과 같다", async () => {
    const { jobDone } = await import("../../../../lib/running-jobs");
    falKeyMissing = true;
    expect(jobDone(await (await call()).json())).toBe(false);

    falKeyMissing = false;
    resultThrows = falError(422, "flagged by a content checker");
    expect(jobDone(await (await call()).json())).toBe(true);
  });
});
