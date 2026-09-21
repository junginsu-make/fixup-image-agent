import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **전사가 장부 밖에 있었다**(F-7-9).
 *
 * 설계 §14.5: 「전사 사용량 **계량·한도 없음** | 수정 | W3/W8 / 성공·실패
 * meter 와 limit」.
 * 설계 §7.2: 「기획·레퍼런스 분석·**전사** 성공/실패를 LLM meter 에 연결한다.
 * 이미지 크레딧 0 이어도 원가 기록은 남긴다.」
 * 설계 §7.2: 「현재 시간당 분석 제한 설정은 재사용하고 레퍼런스 분석·**전사**
 * 에도 명시된 LLM 작업 한도를 적용한다.」
 *
 * 라우트가 이랬다 — 로그인만 보고 `await req.json()` 한 줄.
 *
 *   - **예약이 없다.** 시간당 한도가 없다. 같은 페이지를 천 번 전사해도 막는
 *     것이 없다
 *   - **계량기가 없다.** 글 모델 값이 원가 집계에서 $0 으로 보인다
 *   - **본문 상한이 없다.** 스트립은 base64 그림이다. 배치 하나가 10MB 다
 *
 * 전사는 값이 작지 않다. 스트립 마흔 장까지, 배치당 여덟 장이므로 **한 번
 * 돌면 호출이 다섯 번까지** 간다.
 */

vi.mock("server-only", () => ({}));

const 예약: Array<{ operation: string; units: number }> = [];
const 정산: Array<{ success: boolean; units: number; errorCode?: string; llmUsd?: number }> = [];
/** 정산이 무엇을 돌려줄까. 못 닫으면 `undefined` 다(`settleAiUsage` 의 계약). */
let 정산결과: unknown = {};
let 예약허용 = true;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async (_req: Request, operation: string, units: number) => {
    예약.push({ operation, units });
    return 예약허용
      ? { ok: true as const, userId: "u1", requestId: "r1", usage: {} }
      : { ok: false as const, response: Response.json({ error: "너무 많습니다." }, { status: 429 }) };
  },
  settleAiUsage: async (
    _reservation: unknown,
    success: boolean,
    units: number,
    errorCode?: string,
    cost?: { llmUsd?: number },
  ) => {
    정산.push({ success, units, errorCode, llmUsd: cost?.llmUsd });
    return 정산결과;
  },
}));

let 전사호출 = 0;
let 전사가터진다 = false;

vi.mock("@fixup/redesign-core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    transcribeStrips: async (input: { onUsage?: (u: unknown) => void }) => {
      전사호출 += 1;
      // 제공자가 토큰을 적어 준다. 계량기가 감싸고 있으면 여기 값이 잡힌다.
      input.onUsage?.({ model: "gpt-5.5", inputTokens: 4200, outputTokens: 850 });
      if (전사가터진다) throw new Error("connect ETIMEDOUT");
      return { transcript: "### 구간 1", lastSectionType: "후킹" };
    },
  };
});

const { POST } = await import("../transcribe-strips/route");

const 스트립 = (base64 = "AAA") => ({ base64, mimeType: "image/jpeg", yStartRatio: 0, yEndRatio: 1 });

const 요청 = (body?: unknown) =>
  new Request("http://localhost/api/redesign/transcribe-strips", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-idempotency-key": "11111111-1111-4111-8111-111111111111",
    },
    body: JSON.stringify(body ?? { strips: [스트립()], batchIndex: 0, batchCount: 1, provider: "openai" }),
  });

beforeEach(() => {
  예약.length = 0;
  정산.length = 0;
  정산결과 = {};
  전사호출 = 0;
  예약허용 = true;
  전사가터진다 = false;
});

describe("전사도 장부를 거친다", () => {
  it("**제 칸으로 예약한다** — 상세페이지 분석 칸을 쓰면 전사하다가 기획이 막힌다", async () => {
    await POST(요청());

    expect(예약).toEqual([{ operation: "redesign_transcribe", units: 0 }]);
  });

  it("**크레딧은 안 깎는다** — 새로 그리는 것이 없다", async () => {
    await POST(요청());

    expect(정산[0]?.units).toBe(0);
  });

  /**
   * **이미지 크레딧이 0 이어도 원가 기록은 남긴다**(설계 §7.2).
   *
   * 계량기가 안 감싸면 제공자가 적은 토큰이 갈 곳이 없어 조용히 버려진다
   * (`lib/llm/meter.ts`).
   */
  it("**글 모델에 쓴 돈이 실린다**", async () => {
    const response = await POST(요청());

    expect(response.status).toBe(200);
    expect(전사호출).toBe(1);
    expect(정산[0]?.success).toBe(true);
    expect(정산[0]?.llmUsd).toBeGreaterThan(0);
  });

  /**
   * **실패해도 값은 이미 나갔다**(설계 §7.2 의 「성공/실패」).
   *
   * 모델이 돌다가 끊긴 경우가 그렇다. 여기서 안 남기면 그 요청은 장부에서
   * 0원으로 보인다.
   */
  it("**터져도 쓴 돈을 남긴다**", async () => {
    전사가터진다 = true;

    const response = await POST(요청());

    expect(response.status).toBe(500);
    expect(정산[0]?.success).toBe(false);
    expect(정산[0]?.llmUsd).toBeGreaterThan(0);
  });
});

describe("한도에 걸리면 부르지 않는다", () => {
  it("**429 를 그대로 돌려준다**", async () => {
    예약허용 = false;

    const response = await POST(요청());

    expect(response.status).toBe(429);
    expect(전사호출).toBe(0);
  });
});

/**
 * **본문 상한이 없었다.** 스트립은 base64 그림이고 배치 하나가 10MB 다.
 * `req.json()` 은 끝까지 읽는다 — 얼마가 오든 다 받아 메모리에 쌓는다.
 *
 * 설계 §12: 「Content-Length 만 신뢰하지 않는다. 수신 스트림·파일 수·MIME
 * signature·이미지 픽셀을 제한한다.」
 */
describe("본문이 너무 크면 문지기에서 끝난다", () => {
  it("**413 이고 예약도 안 한다** — 값싼 실패로 한도를 태우지 않는다", async () => {
    const { TRANSCRIBE_JSON_LIMIT } = await import("../transcribe-strips/limits");
    const 큰것 = "A".repeat(TRANSCRIBE_JSON_LIMIT + 1024);

    const response = await POST(요청({ strips: [스트립(큰것)], batchIndex: 0, batchCount: 1 }));

    expect(response.status).toBe(413);
    expect(예약).toHaveLength(0);
    expect(전사호출).toBe(0);
  });
});

/**
 * **장부를 못 닫았다고 전사를 버리지 않는다**(X-02).
 *
 * 설계 §14.6: 「PDP·리디자인 **모든 유료/계량 라우트 실패 주입**」.
 *
 * `settleAiUsage` 가 던지지 않고 `undefined` 를 준다는 성질은
 * `lib/membership/__tests__/settle-swallows.test.ts` 가 실제로 돌려 잰다.
 * 여기서는 **이 라우트가 그 성질 위에서 제대로 도는지**를 잰다 — 못 닫았다고
 * 500 을 주면 사용자는 이미 값을 치른 전사를 잃는다.
 */
describe("장부가 안 닫혀도 전사를 돌려준다", () => {
  it("**정산이 아무것도 못 줘도 200 이다**", async () => {
    정산결과 = undefined;

    const response = await POST(요청());

    expect(response.status).toBe(200);
    expect((await response.json()).transcript).toContain("구간 1");
  });

  it("**사용량 칸만 빈다** — 결과는 그대로다", async () => {
    정산결과 = undefined;

    const body = await (await POST(요청())).json() as { usage?: unknown; transcript?: string };

    expect(body.usage).toBeUndefined();
    expect(body.transcript).toBeTruthy();
  });

  it("**정산을 한 번은 부른다** — 안 부르면 예약이 묶인 채 남는다", async () => {
    await POST(요청());

    expect(정산).toHaveLength(1);
  });
});

