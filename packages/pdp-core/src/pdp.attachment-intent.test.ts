import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import type { SectionBlueprint } from "./types";

/**
 * 「이 그림을 어떻게 쓸까요」에 적은 말이 **최종 프롬프트까지 실제로 실리는가.**
 *
 * 이 기능은 배선이 둘이다.
 *
 *   1. 스위치   지시가 있으면 그 자리의 고정 문구를 뺀다
 *   2. 원문     그 지시를 프롬프트에 싣는다
 *
 * 2026-09-08 카드뉴스에서 1만 옮기고 2를 빠뜨렸다. 타입검사 0건, 시험 전부
 * 통과였는데 실제 프롬프트에는 「USER INSTRUCTION 을 읽고 따르라」고 써 놓고
 * 그 블록이 아예 없었다. **보호 문구만 사라지고 대신 들어오는 말이 없었다.**
 *
 * 그래서 여기서는 fal 로 나가는 진짜 프롬프트를 붙잡아 본다.
 */

const section = (): SectionBlueprint =>
  ({
    section_id: "s1",
    section_name: "히어로",
    headline: "제목",
    subheadline: "부제",
    prompt_en: "a clean product photo on a table",
    layout_notes: "",
    bullets: [],
    copy_blocks: [],
  }) as unknown as SectionBlueprint;

/** fal 로 나가는 프롬프트를 붙잡는다. 네트워크는 타지 않는다. */
async function promptFor(options: Record<string, unknown>) {
  const service = new PdpService();
  const captured: string[] = [];

  await (service as never as {
    generateSectionImageInternal(input: unknown): Promise<unknown>;
  }).generateSectionImageInternal({
    originalImageBase64: "iVBORw0KGgo=",
    section: section(),
    aspectRatio: "3:4",
    options,
    client: { llm: { generate: async () => ({ text: "{}" }) }, models: { generateContent: async () => ({ text: "{}" }) } },
    generateImage: async (_model: unknown, input: { prompt: string; systemPrompt: string }) => {
      captured.push(`${input.systemPrompt}\n${input.prompt}`);
      return { base64: "IMG", mimeType: "image/jpeg" };
    },
  });

  return captured.join("\n");
}

const 레퍼런스 = { base64: "REF", mimeType: "image/png" };
const 인물 = { base64: "PERSON", mimeType: "image/png" };

describe("적은 말이 프롬프트에 실린다", () => {
  it("레퍼런스에 적은 말이 그대로 간다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      styleReferenceImages: [레퍼런스],
      attachmentIntents: { style: "색만 가져오고 배치는 무시해 주세요" },
    });

    expect(prompt).toContain("색만 가져오고 배치는 무시해 주세요");
  });

  it("제품에 적은 말이 그대로 간다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      attachmentIntents: { anchor: "라벨 글씨는 한 글자도 바꾸지 마세요" },
    });

    expect(prompt).toContain("라벨 글씨는 한 글자도 바꾸지 마세요");
  });

  it("인물에 적은 말이 그대로 간다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: true,
      outputMode: "editable",
      referenceModelImageBase64: 인물.base64,
      referenceModelImageMimeType: 인물.mimeType,
      referenceModelProfile: null,
      attachmentIntents: { person: "안경을 꼭 씌워 주세요" },
    });

    expect(prompt).toContain("안경을 꼭 씌워 주세요");
  });
});

describe("적은 자리의 고정 문구만 빠진다", () => {
  it("레퍼런스에 적으면 레퍼런스 규칙이 빠진다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      styleReferenceImages: [레퍼런스],
      attachmentIntents: { style: "색만 가져와" },
    });

    expect(prompt).not.toContain("Imitate its design language only:");
  });

  it("**레퍼런스에 적어도 제품 지키기는 안 풀린다**", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      preserveProductImage: true,
      styleReferenceImages: [레퍼런스],
      attachmentIntents: { style: "색만 가져와" },
    });

    expect(prompt).toContain("Never redesign, restyle or substitute the product");
  });

  it("아무 데도 안 적으면 규칙이 전부 그대로다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      styleReferenceImages: [레퍼런스],
    });

    expect(prompt).toContain("Imitate its design language only:");
    expect(prompt).toContain("Never redesign, restyle or substitute the product");
  });
});

/**
 * 화면에서 고른 인물 조건이 **fal 로 나가는 진짜 프롬프트**까지 가는가.
 *
 * 2026-09-09 확인: 성별·나이대·국가를 고를 수 있는데 엔진이 안 읽고 있었다.
 * 옵션에 실어 보내는 것과 프롬프트에 실리는 것은 다르다.
 */
describe("인물 조건이 프롬프트까지 간다", () => {
  it("고른 나라와 성별이 실린다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      modelCountry: "japan",
      modelGender: "male",
      modelAgeRange: "40s",
    });

    expect(prompt).toMatch(/Japanese/);
    expect(prompt).toMatch(/man/);
    expect(prompt).toMatch(/40s/);
  });

  it("안 고르면 지금까지처럼 한국이다", async () => {
    const prompt = await promptFor({ style: "studio", withModel: false, outputMode: "editable" });
    expect(prompt).toMatch(/Korean/);
  });

  it("가이드 우선 모드가 실린다", async () => {
    const guide = await promptFor({ style: "studio", withModel: false, outputMode: "editable" });
    const shot = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      guidePriorityMode: "style-first",
    });
    expect(guide).toMatch(/guide_priority/);
    expect(shot).toMatch(/shot type wins/);
  });
});

/** 「그 밖에」(채널·시즌)가 fal 로 나가는 프롬프트까지 가는가. */
describe("페이지 배경 설명이 프롬프트까지 간다", () => {
  it("적은 말이 실린다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      pageContext: "여름 시즌, 프리미엄 보습 이미지 강조",
    });
    expect(prompt).toContain("여름 시즌, 프리미엄 보습 이미지 강조");
  });

  it("안 적으면 그 말이 없다", async () => {
    const prompt = await promptFor({ style: "studio", withModel: false, outputMode: "editable" });
    expect(prompt).not.toMatch(/Page context/i);
  });
});

/**
 * 기획이 섹션마다 적어 둔 것이 **fal 로 나가는 프롬프트**까지 가는가.
 *
 * 옵션에 실리는 것과 프롬프트에 실리는 것은 다르다. 이 저장소는 그 차이로
 * 이미 여러 번 데였다.
 */
describe("섹션 기획이 프롬프트까지 간다", () => {
  it("메시지·제품 참고 기준·규제 주의가 실린다", async () => {
    const service = new PdpService();
    const captured: string[] = [];

    await (service as never as {
      generateSectionImageInternal(input: unknown): Promise<unknown>;
    }).generateSectionImageInternal({
      originalImageBase64: "iVBORw0KGgo=",
      section: {
        ...section(),
        purpose: "착유 직후의 신선함",
        reference_usage: "라벨 글씨와 병 곡선을 그대로",
        compliance_notes: "의약품 효능 표현 금지",
      },
      aspectRatio: "3:4",
      options: { style: "studio", withModel: false, outputMode: "editable" },
      client: {
        llm: { generate: async () => ({ text: "{}" }) },
        models: { generateContent: async () => ({ text: "{}" }) },
      },
      generateImage: async (_model: unknown, input: { prompt: string }) => {
        captured.push(input.prompt);
        return { base64: "IMG", mimeType: "image/jpeg" };
      },
    });

    const prompt = captured.join("\n");
    expect(prompt).toContain("착유 직후의 신선함");
    expect(prompt).toContain("라벨 글씨와 병 곡선을 그대로");
    expect(prompt).toContain("의약품 효능 표현 금지");
  });
});

/**
 * 조각을 **전부** 싣는지 프롬프트로 확인한다.
 *
 * 변이로 재 보니 첫 조각만 써도 565건이 전부 통과했다 — 옵션에 실리는 것과
 * 실제로 첨부되는 것은 다르다. 사용자가 지적한 그 문제(긴 페이지는 중간에
 * 디자인이 바뀐다)가 조용히 되돌아갈 자리였다.
 */
describe("레퍼런스 조각이 전부 첨부된다", () => {
  const slices = [
    { base64: "TOP", mimeType: "image/jpeg", description: "짙은 올리브" },
    { base64: "MID", mimeType: "image/jpeg" },
    { base64: "BOTTOM", mimeType: "image/jpeg" },
  ];

  it("조각 수만큼 번호가 매겨진다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      styleReferenceImages: slices,
    });

    expect(prompt).toMatch(/part 1 of 3/i);
    expect(prompt).toMatch(/part 2 of 3/i);
    expect(prompt).toMatch(/part 3 of 3/i);
  });

  it("한 페이지를 나눈 것이라고 말한다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      styleReferenceImages: slices,
    });
    expect(prompt).toMatch(/slices of ONE long detail page/i);
    expect(prompt).toMatch(/use the part that matches the section/i);
  });

  it("한 장이면 조각 이야기를 안 한다", async () => {
    const prompt = await promptFor({
      style: "studio",
      withModel: false,
      outputMode: "editable",
      styleReferenceImages: [slices[0]!],
    });
    expect(prompt).not.toMatch(/part 1 of/i);
  });
});
