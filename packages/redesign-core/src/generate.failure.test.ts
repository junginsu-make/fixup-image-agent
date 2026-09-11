import { describe, expect, it, vi, afterEach } from "vitest";
import { generateSections } from "./generate.js";

/**
 * **중간에 실패하면 남은 섹션은 어디로 가는가.**
 *
 * 여덟 장 중 셋째가 실패하면 넷째부터 여덟째는 시도도 기록도 안 된 채
 * 사라졌다. 화면은 「2장 만듦, 1장 실패」로 보여 주고, 사용자는 사라진
 * 다섯 장을 다시 만들 방법이 없었다.
 *
 * 이 파일이 이 꾸러미의 **첫 흐름 시험**이다. 그동안 시험은 프롬프트 조립만
 * 다뤘고, 정작 지휘하는 함수는 비어 있었다.
 */

const PNG = Buffer.from("89504e470d0a1a0a", "hex");

/** 분석 응답(JSON) 한 번, 그다음부터 그림 응답. */
function 응답(kind: "analysis" | "image" | "error") {
  if (kind === "error") {
    return Promise.resolve(
      new Response(JSON.stringify({ error: { message: "rate limit" } }), { status: 429 }),
    );
  }
  if (kind === "analysis") {
    return Promise.resolve(
      new Response(
        JSON.stringify({
          output: [{ content: [{ text: JSON.stringify({ product_inferred: { name: "시험 제품" } }) }] }],
        }),
        { status: 200 },
      ),
    );
  }
  return Promise.resolve(
    new Response(JSON.stringify({ data: [{ b64_json: PNG.toString("base64") }] }), { status: 200 }),
  );
}

function 입력(count: number) {
  return {
    files: [{ name: "원본.png", type: "image/png", buffer: PNG }],
    model: "openai",
    openaiKey: "시험용-키",
    count,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("중간에 실패했을 때", () => {
  it("시도조차 못 한 섹션도 남긴다", async () => {
    // 분석 1회 → 그림 2장 성공 → 3장째 실패. 남은 5장은 시도되지 않는다.
    const 차례 = ["analysis", "image", "image", "error"] as const;
    let 번째 = 0;
    vi.stubGlobal("fetch", vi.fn(() => 응답(차례[Math.min(번째++, 차례.length - 1)]!)));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { project } = await generateSections(입력(8));

    expect(project.sections).toHaveLength(2);
    // 실패 1 + 시도 못 한 5 = 6. 전에는 1 만 남고 다섯이 사라졌다.
    expect(project.failedSections).toHaveLength(6);
    expect(project.status).toBe("부분완료");
  });

  it("남은 섹션에는 왜 안 만들어졌는지 적는다", async () => {
    const 차례 = ["analysis", "image", "error"] as const;
    let 번째 = 0;
    vi.stubGlobal("fetch", vi.fn(() => 응답(차례[Math.min(번째++, 차례.length - 1)]!)));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { project } = await generateSections(입력(4));
    const 안만든것 = project.failedSections.slice(1);

    expect(안만든것.length).toBeGreaterThan(0);
    for (const section of 안만든것) {
      expect(section.error).toContain("시도하지 않았습니다");
    }
  });

  /** 한 장도 못 만들었으면 예약을 풀어야 하므로 던지는 쪽이 맞다. */
  it("첫 장부터 실패하면 던진다", async () => {
    const 차례 = ["analysis", "error"] as const;
    let 번째 = 0;
    vi.stubGlobal("fetch", vi.fn(() => 응답(차례[Math.min(번째++, 차례.length - 1)]!)));
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(generateSections(입력(3))).rejects.toThrow(/생성 실패/);
  });

  it("다 만들어지면 실패 목록이 비어 있다", async () => {
    vi.stubGlobal("fetch", vi.fn(() => (번째++ === 0 ? 응답("analysis") : 응답("image"))));
    let 번째 = 0;
    vi.spyOn(console, "info").mockImplementation(() => {});

    const { project } = await generateSections(입력(3));

    expect(project.sections).toHaveLength(3);
    expect(project.failedSections).toHaveLength(0);
    expect(project.status).toBe("완료");
  });
});
