import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

/**
 * **레퍼런스 분석이 장부 밖에 있었다**(C-4-b · C-7 의 「횟수」).
 *
 * 레퍼런스를 올리면 그림을 읽어 서술을 만든다(글 모델 한 번). 그 돈이 **장부에
 * 한 줄도 없었다.** 예약이 없으니 횟수 제한도 없다 — 같은 그림을 천 번 올려도
 * 막는 것이 아무것도 없었다.
 *
 * 설계 §7.2: 「기획·**레퍼런스 분석**·전사 성공/실패를 LLM meter 에 연결한다.
 * 이미지 크레딧 0 이어도 원가 기록은 남긴다.」
 * 설계 §7.2: 「현재 시간당 분석 제한 설정은 재사용하고 **레퍼런스 분석**·전사
 * 에도 명시된 LLM 작업 한도를 적용한다.」
 */

vi.mock("server-only", () => ({}));

const 예약: Array<{ operation: string; units: number }> = [];
const 정산: Array<{ success: boolean; units: number; errorCode?: string; llmUsd?: number }> = [];
let 예약허용 = true;

vi.mock("../../../../lib/membership/api", () => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  reserveAiUsage: async (_req: Request, operation: string, units: number) => {
    예약.push({ operation, units });
    return 예약허용
      ? { ok: true as const, userId: "u1", requestId: "r1", usage: {} }
      : { ok: false as const, response: Response.json({ ok: false, message: "너무 많습니다." }, { status: 429 }) };
  },
  settleAiUsage: async (
    _reservation: unknown,
    success: boolean,
    units: number,
    errorCode?: string,
    cost?: { llmUsd?: number },
  ) => {
    정산.push({ success, units, errorCode, llmUsd: cost?.llmUsd });
    return {};
  },
}));

/** 글 모델을 부른 척한다. 계량기가 감싸고 있으면 여기 적힌 값이 잡힌다. */
let 모델호출 = 0;

/** 열쇠가 없으면 `analyzeStyleImage` 는 모델을 **안 부르고** 빈 서술을 준다. */
let 모델을부른다 = true;

vi.mock("../../../../lib/user-style-references", () => ({
  registerUserStyleReference: async () => {
    const { recordLlmUsage } = await import("../../../../lib/llm/meter");
    if (모델을부른다) {
      모델호출 += 1;
      recordLlmUsage("claude-sonnet-5", 1200, 300);
    }
    return { ok: true as const, id: "new-id", description: 모델을부른다 ? "설명" : "" };
  },
  listUserStyleReferences: async () => [],
  deleteUserStyleReference: async () => ({ ok: true as const, deleted: true }),
  ownerOfStyleReference: async () => null,
}));

const { POST } = await import("../style-references/route");

const png = async () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#456" } }).png().toBuffer();

const 요청 = async (body?: unknown) =>
  new Request("http://localhost/api/pdp/style-references", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      body ?? { imageBase64: (await png()).toString("base64"), mimeType: "image/png" },
    ),
  });

beforeEach(() => {
  예약.length = 0;
  정산.length = 0;
  모델호출 = 0;
  예약허용 = true;
  모델을부른다 = true;
});

describe("레퍼런스 분석도 장부를 거친다", () => {
  it("**제 칸으로 예약한다** — 상세페이지 분석 칸을 쓰면 정리하다가 기획이 막힌다", async () => {
    await POST(await 요청());

    expect(예약).toEqual([{ operation: "reference_analyze", units: 0 }]);
  });

  it("**크레딧은 안 깎는다** — 새로 그리는 것이 없다", async () => {
    await POST(await 요청());

    expect(정산[0]?.units).toBe(0);
  });

  /**
   * **이미지 크레딧이 0 이어도 원가 기록은 남긴다**(설계 §7.2).
   *
   * 계량기가 안 감싸고 있으면 제공자가 적은 토큰이 갈 곳이 없어 조용히
   * 버려진다(`lib/llm/meter.ts`). 그동안 이 길이 그랬다.
   */
  it("**글 모델에 쓴 돈이 실린다**", async () => {
    await POST(await 요청());

    expect(모델호출).toBe(1);
    expect(정산[0]?.llmUsd).toBeGreaterThan(0);
  });

  it("등록이 되면 성공으로 닫는다", async () => {
    const response = await POST(await 요청());

    expect(response.status).toBe(200);
    expect(정산[0]?.success).toBe(true);
  });
});

/**
 * **모델이 한 번도 안 돌았으면 한 칸을 먹지 않는다**(C-9 에서 세운 원칙).
 *
 * 열쇠가 없으면 `analyzeStyleImage` 는 모델을 **안 부르고** 빈 서술을 준다
 * (`pdp.style-reference.ts` 의 「글 모델이 없으면 서술 없이 간다」). 그대로
 * 성공으로 닫으면, 운영자가 키를 빠뜨린 날 사용자가 시간당 60칸을 전부 잃고도
 * 서술은 하나도 못 받는다. 상세페이지 분석은 같은 경우를 면제한다.
 *
 * **장부에 적는 말은 「등록 실패」가 아니라 「분석이 안 됐다」이다.** 레퍼런스
 * 자체는 저장됐으므로 응답은 200 이고 크레딧도 0 이다.
 */
describe("모델이 안 돌면 한 칸을 안 먹는다", () => {
  it("**열쇠가 없어 서술을 못 만들면 면제 코드로 닫는다**", async () => {
    모델을부른다 = false;

    const response = await POST(await 요청());
    const { consumesAnalysisQuota } = await import("@fixup/pdp-core");

    // 레퍼런스는 저장됐다. 사용자에게는 성공이다.
    expect(response.status).toBe(200);
    // 장부에는 분석이 안 됐다고 적힌다. 그 코드는 한도를 안 먹는다.
    expect(정산[0]?.success).toBe(false);
    expect(consumesAnalysisQuota(정산[0]?.errorCode)).toBe(false);
  });

  it("**모델이 돌았으면 먹는다**", async () => {
    const { consumesAnalysisQuota } = await import("@fixup/pdp-core");

    await POST(await 요청());

    expect(정산[0]?.success).toBe(true);
    expect(consumesAnalysisQuota(정산[0]?.errorCode)).toBe(true);
  });
});

describe("한도에 걸리면 부르지 않는다", () => {
  it("**429 를 그대로 돌려준다**", async () => {
    예약허용 = false;

    const response = await POST(await 요청());

    expect(response.status).toBe(429);
    expect(모델호출).toBe(0);
  });
});

/**
 * **깨진 입력은 한 칸도 안 먹는다**(C-9 와 같은 판단).
 *
 * 문지기에서 끝나는 것은 모델을 부르기 전이다. 예약을 먼저 하면 값싼 실패로
 * 한도를 태울 수 있다.
 */
describe("문지기에서 끝나면 예약도 안 한다", () => {
  it.each([
    ["그림이 아닌 바이트", { imageBase64: Buffer.from("글자").toString("base64"), mimeType: "image/png" }],
    ["이미지가 없다", { mimeType: "image/png" }],
  ])("**%s → 예약 0건**", async (_label, body) => {
    await POST(await 요청(body));

    expect(예약).toHaveLength(0);
    expect(정산).toHaveLength(0);
  });
});

/**
 * **요청 식별자를 안 붙이면 400 이다.**
 *
 * `reserveAiUsage` 는 `x-idempotency-key` 를 요구한다. 예약을 들이면서 화면이
 * 그것을 안 보내면, 레퍼런스 등록이 **통째로 「요청 식별자가 올바르지
 * 않습니다」로 막힌다.** 이 저장소는 같은 사고를 2026-09-08 에 겪었다 — 예약
 * 쪽만 넓히고 부르는 쪽을 빠뜨려 이미지 만들기가 100% 거절됐다.
 *
 * 올리는 곳이 넷이라 하나만 빠져도 그 화면만 조용히 죽는다.
 */
const 화면 = async (relative: string) => {
  const { readFileSync } = await import("node:fs");
  return readFileSync(new URL(`../../../../${relative}`, import.meta.url), "utf8");
};

describe("올리는 화면이 모두 식별자를 붙인다", () => {
  it.each([
    ["기획 화면의 레퍼런스 붙이기", "app/create/StyleReferenceAttach.tsx"],
    ["라이브러리 뷰어의 저장", "app/library/ResultViewer.tsx"],
    ["계정 화면의 올리기", "app/settings/StyleReferenceManager.tsx"],
  ])("**%s 이 직접 붙인다**", async (_label, relative) => {
    const source = await 화면(relative);

    /*
      **덩이로 자른다.** 두 글자를 따로 찾으면, 헤더를 POST 에서 떼어 DELETE 로
      옮겨도 둘 다 걸려서 통과한다 — 그러면 등록이 전부 400 으로 죽는데 시험은
      초록이다(리뷰가 실증했다).
    */
    const post = source.slice(source.indexOf('method: "POST"'));

    expect(post.slice(0, 300)).toContain('"x-idempotency-key": randomId()');
  });

  /**
   * 결과 화면은 `apiJson` 을 거친다. 그 안에서 POST 에 식별자를 붙이므로
   * **여기서 또 붙이면 안 된다** — 다만 그 길로 간다는 것은 잠가 둔다.
   */
  it("**결과 화면의 섹션 저장은 apiJson 을 거친다**", async () => {
    const source = await 화면("app/create/SectionGallery.tsx");
    const call = source.slice(source.indexOf("/pdp/style-references") - 200);

    expect(call).toContain("apiJson");
  });

  it("**그 apiJson 이 POST 에 식별자를 붙인다**", async () => {
    const utils = await 화면("app/create/pdp-utils.ts");

    expect(utils).toContain('headers.set("x-idempotency-key", randomId())');
  });
});
