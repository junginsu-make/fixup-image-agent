import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveEndpoint, type ImageModelId } from "@fixup/pdp-core";

/**
 * 첨부한 그림의 **역할 두 가지가 실제로 다르게 나가는가.**
 *
 * 화면에서 「이 캐릭터 뽑아내기」와 「결만 따라 만들기」를 고르면, 그 값이
 * 라우트를 지나 fal 요청까지 가야 뜻이 있다. 중간 어디서 떨어뜨려도 화면은
 * 똑같이 동작하는 것처럼 보인다 — 결과 그림이 조금 다를 뿐이라 아무도 모른다.
 *
 * **소스 문자열을 대조하지 않는다.** 진짜 `generateCandidates` 를 불러
 * fal 로 나가는 입력을 그대로 받아 값으로 잰다. 그림은 만들지 않는다 —
 * 통로만 가짜로 바꾼다.
 */

const sent: Array<{ model: string; input: { prompt: string; references: Array<{ kind: string }> } }> = [];

// `characters.ts` 가 딸려 부르는 Supabase 통로가 `server-only` 를 찾는다.
// 시험 환경에는 그 꾸러미가 없다 — 다른 시험들도 같은 자리에서 같이 막는다.
vi.mock("server-only", () => ({}));

vi.mock("../pdp/fal", () => ({
  createPdpImageGenerator: () => async (model: string, input: never) => {
    sent.push({ model, input } as never);
    return { base64: "AAAA", mimeType: "image/png" };
  },
}));

const { generateCandidates } = await import("../characters");

const 그림 = { base64: "Zm9v", mimeType: "image/png" };
const 기본 = {
  description: "노란 모자를 쓴 3등신 마스코트",
  aspectRatio: "3:4" as const,
  kind: "character" as const,
  look: "illustration" as const,
  candidates: 1,
};

async function 보낸것(role: "style" | "extract") {
  sent.length = 0;
  await generateCandidates({ ...기본, reference: { role, ...그림 } });
  return sent[0]!;
}

beforeEach(() => { sent.length = 0; });

describe("첨부 그림의 역할", () => {
  it("뽑아내기는 정체성 경로(person)로 보낸다", async () => {
    const { input } = await 보낸것("extract");
    expect(input.references).toHaveLength(1);
    expect(input.references[0]!.kind).toBe("person");
  });

  it("결만 따라 만들기는 스타일 경로(style)로 보낸다", async () => {
    const { input } = await 보낸것("style");
    expect(input.references[0]!.kind).toBe("style");
  });

  it("프롬프트도 정반대로 갈린다", async () => {
    const extract = (await 보낸것("extract")).input.prompt;
    const style = (await 보낸것("style")).input.prompt;

    // 뽑아내기: 그 대상을 그대로 살리고 배경은 버린다.
    expect(extract).toMatch(/Reproduce the same character/i);
    expect(extract).toMatch(/Remove the original background/i);

    // 결: 그 대상을 베끼지 말라고 못 박는다. 안 박으면 따라 나온다.
    expect(style).toMatch(/STYLE reference/i);
    expect(style).toMatch(/Do not copy the character in it/i);

    // 서로의 문장이 섞여 들어가지 않는다.
    expect(extract).not.toMatch(/STYLE reference/i);
    expect(style).not.toMatch(/Reproduce the same character/i);
  });

  it("뽑아내기가 그리는 방식까지 베끼라고 하지는 않는다", async () => {
    // 「이 캐릭터 뽑아내기 + 결: 실사」가 부딪히던 자리다(2026-09-08 실측).
    const extract = (await 보낸것("extract")).input.prompt;
    expect(extract).toMatch(/rendering style is NOT part of what you copy/i);
  });

  it("안 붙이면 첨부 이야기를 아예 하지 않는다", async () => {
    sent.length = 0;
    await generateCandidates(기본);
    const { input } = sent[0]!;
    expect(input.references).toHaveLength(0);
    expect(input.prompt).not.toMatch(/reference image/i);
  });
});

/**
 * **참고 그림은 없어도 된다.**
 *
 * 이름과 묘사, 그리고 위에서 고른 종류·결만으로 캐릭터가 나와야 한다.
 * 붙인 그림이 없으면 fal 의 **text-to-image** 길로 가고, 붙이면 edit 길로 간다 —
 * 같은 모델이라도 부르는 자리가 다르다. 여기가 갈리지 않으면 참조 없이
 * edit 를 불러 요청이 죽는다.
 */
describe("참고 그림 없이 만들기", () => {
  it("안 붙이면 text-to-image 로 나간다", async () => {
    sent.length = 0;
    await generateCandidates(기본);
    const { model, input } = sent[0]!;
    expect(input.references).toHaveLength(0);
    expect(resolveEndpoint(model as ImageModelId, [])).toMatch(/text-to-image/);
  });

  it("붙이면 edit 로 나간다", async () => {
    const { model, input } = await 보낸것("extract");
    expect(input.references).toHaveLength(1);
    expect(resolveEndpoint(model as ImageModelId, input.references as never)).toMatch(/edit/);
  });

  it("묘사는 그대로 실린다 — 고른 종류·결도 함께", async () => {
    sent.length = 0;
    await generateCandidates(기본);
    const prompt = sent[0]!.input.prompt;
    // 사용자가 친 말이 맨 앞에 그대로 있어야 한다.
    expect(prompt).toContain(기본.description);
    // 종류(캐릭터)는 사람 등신을 강제하지 않는다.
    expect(prompt).toMatch(/stylised proportions/i);
    // 결(그림)은 손그림 질감으로 간다.
    expect(prompt.length).toBeGreaterThan(400);
  });
});
