import { describe, expect, it, vi } from "vitest";
import { editSection } from "./edit-section";

/**
 * **고치는 길에는 시험이 한 건도 없었다**(X-03).
 *
 * 설계 §14.6: 「**generate 만 보고 edit 품질 미검사** | 실제 제공자 payload
 * 검사」.
 *
 * `generate.test.ts` 는 있는데 `edit-section` 은 없다. 그런데 이 길에는
 * **값과 품질이 어긋났던 이력**이 있다 — 옛 직접 호출은 `quality: "low"` 로
 * 보내면서 값은 `max` 기준으로 받았다(F-7-5, 2026-09-17).
 *
 * 그 뒤 「새로 만들 때와 같은 길(fal)로 고친다」로 바꿨는데, **그 배선이
 * 실제로 도는지는 아무도 안 봤다.** 통로를 넘겨도 옛 길로 떨어지면 다시 같은
 * 어긋남이 생기고, 겉으로는 그림이 나오니 아무도 모른다.
 *
 * 여기서는 `editSection` 을 실제로 돌려 **제공자에 간 것을 받아 적는다.**
 */

const 그림 =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const 입력 = (over: Record<string, unknown> = {}) => ({
  imageUrl: 그림,
  request: "글자를 키워 주세요",
  section: { id: "S1", name: "첫 섹션" },
  project: { title: "작업" },
  openaiKey: "sk-test",
  googleKey: "g-test",
  ...over,
});

describe("고치는 길도 새로 만드는 길로 간다", () => {
  it("**통로를 주면 그 통로로 고친다**", async () => {
    const 받은것: Array<Record<string, unknown>> = [];
    const generateImage = async (request: Record<string, unknown>) => {
      받은것.push(request);
      return { buffer: Buffer.from("AAA"), mimeType: "image/png" };
    };

    const result = await editSection(입력({ generateImage }) as never);

    expect(받은것).toHaveLength(1);
    expect(result.imageUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  /**
   * **사용자가 적은 말이 실려야 한다.** 안 실리면 고치기가 「아무거나 다시
   * 그리기」가 된다 — 값은 똑같이 나가고 결과만 엉뚱하다.
   */
  it("**사용자가 적은 말이 프롬프트에 실린다**", async () => {
    const 받은것: Array<Record<string, unknown>> = [];
    const generateImage = async (request: Record<string, unknown>) => {
      받은것.push(request);
      return { buffer: Buffer.from("AAA"), mimeType: "image/png" };
    };

    await editSection(입력({ generateImage, request: "뚜껑을 파랗게" }) as never);

    expect(JSON.stringify(받은것[0])).toContain("뚜껑을 파랗게");
  });

  /**
   * **원본 그림이 함께 가야 한다.** 안 가면 고치는 것이 아니라 새로 그리는
   * 것이다.
   */
  it("**고칠 원본이 함께 간다**", async () => {
    const 받은것: Array<Record<string, unknown>> = [];
    const generateImage = async (request: Record<string, unknown>) => {
      받은것.push(request);
      return { buffer: Buffer.from("AAA"), mimeType: "image/png" };
    };

    await editSection(입력({ generateImage }) as never);

    // 참조로 원본이 실렸는지. 키 이름이 바뀌어도 값이 있으면 잡힌다.
    expect(JSON.stringify(받은것[0])).toContain("image/png");
  });

  /**
   * **통로가 있으면 옛 길로 떨어지지 않는다.**
   *
   * 옛 길은 `quality: "low"` 로 보내면서 값은 `max` 기준으로 받았다.
   * 떨어지는 순간 그 어긋남이 되살아나는데, 그림은 나오니 아무도 모른다.
   */
  it("**통로가 있으면 직접 호출을 안 한다**", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    try {
      await editSection(
        입력({
          generateImage: async () => ({ buffer: Buffer.from("AAA"), mimeType: "image/png" }),
        }) as never,
      );

      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  /**
   * **통로가 없을 때만 옛 길이다.** 키 하나 때문에 고치기가 통째로 멎으면
   * 안 되므로 그 길 자체는 남겨 둔다.
   */
  it("**통로가 없으면 옛 길로 떨어진다**", async () => {
    const 부른주소: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      부른주소.push(String(url));
      // `readJsonResponse` 는 본문을 글로 읽은 뒤 판다. 흉내도 같은 모양이어야 한다.
      const body = JSON.stringify({ data: [{ b64_json: Buffer.from("AAA").toString("base64") }] });
      return { ok: true, status: 200, headers: new Headers(), text: async () => body };
    });

    try {
      await editSection(입력() as never);

      expect(부른주소.some((url) => url.includes("openai.com"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("고칠 것이 없으면 부르지 않는다", () => {
  it("**빈 그림이면 막는다** — 값이 나가기 전이다", async () => {
    const generateImage = vi.fn();

    await expect(
      editSection(입력({ generateImage, imageUrl: "" }) as never),
    ).rejects.toThrow();
    expect(generateImage).not.toHaveBeenCalled();
  });

  it("**열쇠도 통로도 없으면 막는다**", async () => {
    await expect(
      editSection(입력({ openaiKey: "", googleKey: "" }) as never),
    ).rejects.toThrow();
  });
});
