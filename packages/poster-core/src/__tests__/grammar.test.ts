import { describe, expect, it, vi } from "vitest";
import { buildGrammarPrompt, readReferenceGrammar } from "../grammar";

const references = [
  { id: "r1", title: "SAY IT", url: "https://example.com/say-it.png" },
  { id: "r2", title: "SNAP", url: "https://example.com/snap.png" },
];

const good = {
  typeInteraction: "통과",
  dominantColor: "짙은 청록",
  accentColor: "형광 주황",
  note: "굵은 산세리프가 인물을 가로지른다",
};

describe("문법 추출 프롬프트", () => {
  it("어떻게 보이나 칸만 묻는다 — 무엇을 말하나는 사용자 몫이다", () => {
    const prompt = buildGrammarPrompt();
    expect(prompt).toMatch(/typeInteraction/);
    expect(prompt).toMatch(/dominantColor/);
    expect(prompt).not.toMatch(/headline/);
    expect(prompt).not.toMatch(/subline/);
  });

  it("모르면 비워 두라고 못 박는다", () => {
    expect(buildGrammarPrompt()).toMatch(/지어내|비워/);
  });
});

describe("레퍼런스 문법 읽기", () => {
  it("이미지를 그대로 보여준다 — 코드가 대신 묘사하지 않는다", async () => {
    const seen: string[][] = [];
    await readReferenceGrammar(references, {
      read: async (input) => { seen.push(input.imageUrls); return good; },
    });
    expect(seen[0]).toEqual([references[0]!.url]);
    expect(seen[1]).toEqual([references[1]!.url]);
  });

  it("레퍼런스마다 한 번씩 읽는다", async () => {
    const read = vi.fn(async () => good);
    await readReferenceGrammar(references, { read });
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("읽어낸 값을 레퍼런스 id 에 붙여 준다", async () => {
    const result = await readReferenceGrammar(references, { read: async () => good });
    expect(result.grammars.r1?.typeInteraction).toBe("통과");
    expect(result.grammars.r2?.accentColor).toBe("형광 주황");
    expect(result.issues).toEqual([]);
  });

  it("하나가 실패해도 나머지는 읽는다", async () => {
    let call = 0;
    const result = await readReferenceGrammar(references, {
      read: async () => {
        call += 1;
        if (call === 1) throw new Error("비전 실패");
        return good;
      },
    });
    expect(result.grammars.r1).toBeUndefined();
    expect(result.grammars.r2).toBeDefined();
    expect(result.issues.join("\n")).toMatch(/SAY IT/);
  });

  it("전부 실패해도 던지지 않는다 — 슬롯을 비운 채 사람이 채운다", async () => {
    const result = await readReferenceGrammar(references, {
      read: async () => { throw new Error("비전 없음"); },
    });
    expect(result.grammars).toEqual({});
    expect(result.issues).toHaveLength(2);
  });

  it("이상한 값이 오면 버리고 이유를 남긴다", async () => {
    const result = await readReferenceGrammar([references[0]!], {
      read: async () => ({ typeInteraction: "빙글빙글", dominantColor: "청록" }),
    });
    expect(result.grammars.r1).toBeUndefined();
    expect(result.issues.length).toBe(1);
  });

  it("타이포 관계를 모르면 null 로 두고 나머지는 살린다", async () => {
    const result = await readReferenceGrammar([references[0]!], {
      read: async () => ({ typeInteraction: null, dominantColor: "청록", accentColor: "", note: "" }),
    });
    expect(result.grammars.r1?.typeInteraction).toBeNull();
    expect(result.grammars.r1?.dominantColor).toBe("청록");
  });

  it("읽은 것을 한 줄 요약으로도 준다 — 기획 프롬프트에 넣기 위해서다", async () => {
    const result = await readReferenceGrammar([references[0]!], { read: async () => good });
    expect(result.summaries.r1).toContain("통과");
    expect(result.summaries.r1).toContain("짙은 청록");
  });
});

/**
 * **글자를 넣을지는 규칙이 아니라 붙인 그림이 정한다.**
 *
 * 2026-09-17 사용자 판단. VOGUE 표지를 붙였는데 결과에 글자가 하나도 없었다 —
 * 거대한 타이포그래피가 그 포스터의 핵심인데도 그랬다.
 *
 * 까닭은 「사용자가 글자를 안 시켰으면 넣지 않는다」였다. 그 규칙은 2026-09-08
 * 「BEST DAY EVER!」 사고를 막으려고 생겼고, 그때는 **첨부 어디에도 글자가
 * 없었다.** 두 경우는 다른데 같은 규칙을 받고 있었다.
 *
 * **붙인 그림에 글자가 있나**를 읽어서 그것으로 가른다. 우리가 임의로 정하지
 * 않는다 — 있으면 넣고 없으면 안 넣는다.
 */
describe("붙인 그림에 글자가 있나", () => {
  const prompt = buildGrammarPrompt();

  it("글자가 있는지 묻는다", () => {
    expect(prompt).toContain("hasText");
  });

  it("무엇을 글자로 볼지 짚어 준다", () => {
    expect(prompt).toMatch(/제목|헤드라인|타이포/);
  });
});
