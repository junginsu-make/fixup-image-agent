import { describe, expect, it, vi } from "vitest";
import { RedesignError } from "./errors";
import { generateSections } from "./generate";

/**
 * **분석이 실패하면 지어낸 결과로 유료 생성을 돌렸다**(F-7-3).
 *
 * 설계 §14.5: 「분석 실패 후 **빈 분석으로 유료 생성** | 수정, **오류 표시·제출
 * 전 중단**」.
 *
 * `analyzeSource` 가 어떤 실패든 잡아서 **만들어 낸 결과**를 돌려줬다.
 *
 * ```ts
 * product_inferred: { category: "업로드 자료 기반 추정", confidence: 0.4 },
 * page_blueprint: [],                 // ← 비어 있다
 * strategy: "원본 자료의 제품컷/USP/근거를 보존하고…",   // ← 일반론
 * ```
 *
 * 그 상태로 생성이 그대로 돌고 **장마다 값이 나간다.** 사용자는 자기 자료를
 * 한 번도 안 읽은 페이지를 받고 그 값을 낸다.
 *
 * 더 나쁜 것은 **아무도 그 사실을 모른다**는 점이다. 실패는 `diagnostic_summary`
 * 라는 글에만 남는데, 그 값을 읽어 화면에 띄우는 곳이 **한 군데도 없다**
 * (2026-09-21 확인).
 *
 * ── 왜 멈추는 쪽이 맞나 ─────────────────────────────────────
 *
 * 예약은 생성 **앞**에 있다. 여기서 멈추면 크레딧은 0으로 닫히고 사용자는
 * 아무것도 잃지 않는다. 반대로 계속 가면 **읽지도 않은 자료로 만든 페이지**에
 * 값을 치른다.
 */

/** `GenerateInputFile` 은 `type` 이다. `mimeType` 으로 적으면 파일명 추측에 기댄다. */
const 이미지 = {
  name: "원본.png",
  type: "image/png",
  buffer: Buffer.from("AAA"),
};

const 입력 = (over: Record<string, unknown> = {}) => ({
  model: "openai",
  openaiKey: "sk-test",
  files: [이미지] as never,
  request: "밝게 바꿔 주세요",
  channel: "smartstore",
  ratio: "3:4",
  count: 2,
  startSection: 1,
  ...over,
});

/**
 * **첫 호출(분석)만 터뜨린다.** 그 뒤 호출은 멀쩡히 답한다.
 *
 * 전부 터뜨리면 「분석에서 멈췄다」와 「그냥 다 실패했다」를 구별하지 못한다.
 * 뒤가 멀쩡한데도 그림이 한 장도 안 나와야 **분석 자리에서 멈춘 것**이다.
 */
const 분석이터진다 = () => {
  let 호출수 = 0;
  vi.stubGlobal("fetch", async () => {
    호출수 += 1;
    if (호출수 === 1) throw new Error("connect ETIMEDOUT");

    const body = JSON.stringify({
      data: [{ b64_json: Buffer.from("AAA").toString("base64") }],
    });
    return { ok: true, status: 200, headers: new Headers(), text: async () => body };
  });
};

describe("분석이 실패하면 거기서 멈춘다", () => {
  it("**지어낸 결과로 계속 가지 않는다**", async () => {
    분석이터진다();

    try {
      await expect(generateSections(입력() as never)).rejects.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * **값이 나가기 전에 멈춘다.** 그림을 한 장이라도 그리면 그만큼 치른다.
   */
  it("**그림을 한 장도 안 그린다**", async () => {
    분석이터진다();
    const generateImage = vi.fn();

    try {
      await generateSections(입력({ generateImage }) as never).catch(() => {});

      expect(generateImage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * **무슨 일이 일어났는지 말한다.** 전에는 실패가 `diagnostic_summary` 라는
   * 글에만 남았고, 그 값을 화면에 띄우는 곳이 한 군데도 없었다.
   */
  it("**사용자가 읽을 말이 붙는다**", async () => {
    분석이터진다();

    try {
      // 한 번만 부른다. 스텁은 **첫 호출**만 터뜨리므로 두 번 부르면 두 번째는
      // 분석이 성공해 버린다.
      const 오류 = await generateSections(입력() as never).catch((error: unknown) => error);

      expect(오류).toBeInstanceOf(RedesignError);
      expect((오류 as RedesignError).message).toContain("분석");
      // 무엇을 하면 되는지가 있어야 한다.
      expect((오류 as RedesignError).message).toMatch(/다시|잠시/);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * **일시적 실패라고 말한다.** 자료가 잘못됐다는 뜻이 아니다 — 사용자가
   * 멀쩡한 자료를 다시 만들려고 애쓰게 하면 안 된다.
   */
  it("**다시 시도할 수 있는 실패로 표시한다**", async () => {
    분석이터진다();

    try {
      const 오류 = (await generateSections(입력() as never).catch((e: unknown) => e)) as RedesignError;

      // 4xx 로 주면 화면이 「입력이 잘못됐다」로 읽는다.
      expect(오류.status).toBeGreaterThanOrEqual(500);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * **터지는 실패만 실패가 아니다**(F-7-3 의 나머지 절반).
 *
 * 설계 §14.5 가 쓴 말은 「분석 실패 후 **빈 분석**으로 유료 생성」이다. 그런데
 * 분석이 비는 길은 둘이고, 위에서 막은 것은 **던지는 쪽뿐**이다.
 *
 * 다른 하나는 **200 인데 본문이 빈 경우**다.
 *
 * ```ts
 * const text = data.output_text || extractOpenAIText(data);  // ""
 * return parseMaybeJson(text);                               // { summary: "" }
 * ```
 *
 * `parseMaybeJson` 은 **절대 던지지 않는다.** 그래서 `{ summary: "" }` 가
 * 정상 반환으로 catch 를 지나쳐 그대로 생성으로 흐르고, 프롬프트에는
 * `분석 요약: {"summary":""}` 가 박힌 채 **장마다 값이 나간다.**
 *
 * 지어낼 수 있는 상황이 아니다. 기획 모델(`gpt-5.5`)은 추론 모델이라 추론
 * 토큰을 다 쓰면 200 에 빈 `output_text` 를 준다. Google 쪽은 안전차단이면
 * `candidates` 가 비어 `|| ""` 로 떨어진다.
 */
describe("분석이 비어도 거기서 멈춘다", () => {
  /** 첫 호출(분석)만 **200 에 빈 본문**을 주고, 그 뒤는 멀쩡히 답한다. */
  const 빈답을준다 = () => {
    let 호출수 = 0;
    vi.stubGlobal("fetch", async () => {
      호출수 += 1;
      const body = 호출수 === 1
        ? JSON.stringify({ output_text: "" })
        : JSON.stringify({ data: [{ b64_json: Buffer.from("AAA").toString("base64") }] });
      return { ok: true, status: 200, headers: new Headers(), text: async () => body };
    });
  };

  it("**빈 분석으로 그림을 그리지 않는다**", async () => {
    빈답을준다();
    const generateImage = vi.fn();

    try {
      await generateSections(입력({ generateImage }) as never).catch(() => {});

      expect(generateImage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**터진 실패와 같은 말, 같은 상태로 준다**", async () => {
    빈답을준다();

    try {
      const 오류 = (await generateSections(입력() as never).catch((e: unknown) => e)) as RedesignError;

      expect(오류).toBeInstanceOf(RedesignError);
      expect(오류.status).toBeGreaterThanOrEqual(500);
      expect(오류.message).toContain("분석");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

/**
 * **다시 시도해도 안 되는 실패를 「잠시 후 다시」로 뭉개지 않는다.**
 *
 * 제공자가 4xx 로 거절한 것은 영원히 안 된다 — 키가 틀렸거나, 조직 인증이
 * 안 됐거나, 올린 그림 형식이 안 맞는 경우다. `humanizeProviderError` 가 그
 * 셋에 대해 **무엇을 하면 되는지**를 적어 두었는데, 전부 502 「잠시 후 다시」로
 * 덮으면 그 안내가 도달할 수 없는 글이 된다.
 */
describe("고칠 수 있는 실패는 갈라 말한다", () => {
  /** 첫 호출(분석)만 주어진 상태로 거절하고, 그 뒤는 멀쩡히 답한다. */
  const 거절한다 = (status: number, message: string) => {
    let 호출수 = 0;
    vi.stubGlobal("fetch", async () => {
      호출수 += 1;
      if (호출수 === 1) {
        return {
          ok: false, status, headers: new Headers(),
          text: async () => JSON.stringify({ error: { message } }),
        };
      }
      const body = JSON.stringify({ data: [{ b64_json: Buffer.from("AAA").toString("base64") }] });
      return { ok: true, status: 200, headers: new Headers(), text: async () => body };
    });
  };

  it("**키가 틀렸으면 무엇을 하면 되는지 말한다**", async () => {
    거절한다(401, "Incorrect API key provided: sk-xxx");

    try {
      const 오류 = (await generateSections(입력() as never).catch((e: unknown) => e)) as RedesignError;

      expect(오류).toBeInstanceOf(RedesignError);
      // 「잠시 후 다시」가 아니다. 다시 시도해도 영원히 안 된다.
      expect(오류.message).not.toContain("잠시 후");
      expect(오류.message).toContain("최신 키를 다시 입력");
      expect(오류.status).toBeLessThan(500);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("**그래도 그림은 한 장도 안 그린다**", async () => {
    거절한다(401, "Incorrect API key provided: sk-xxx");
    const generateImage = vi.fn();

    try {
      await generateSections(입력({ generateImage }) as never).catch(() => {});

      expect(generateImage).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** **429 는 뺀다.** 그것은 진짜로 잠시 후 다시다. */
  it("**한도에 걸린 것은 잠시 후 다시다**", async () => {
    거절한다(429, "Rate limit reached");

    try {
      const 오류 = (await generateSections(입력() as never).catch((e: unknown) => e)) as RedesignError;

      expect(오류.status).toBeGreaterThanOrEqual(500);
      expect(오류.message).toContain("잠시 후");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /** **5xx 는 우리 쪽에서 할 일이 없다.** 그대로 「잠시 후 다시」다. */
  it("**제공자가 죽은 것은 잠시 후 다시다**", async () => {
    거절한다(503, "upstream unavailable");

    try {
      const 오류 = (await generateSections(입력() as never).catch((e: unknown) => e)) as RedesignError;

      expect(오류.status).toBeGreaterThanOrEqual(500);
      expect(오류.message).toContain("이 요청에는 크레딧이 사용되지 않았습니다");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

