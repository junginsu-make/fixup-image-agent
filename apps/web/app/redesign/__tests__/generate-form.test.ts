import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { appendGenerateFields, type GenerateFieldsInput } from "../generate-form";

/**
 * **작업 정보와 이미 한 기획을 실제로 싣는가**(F-7-7).
 *
 * 서버가 아무리 올바로 세도 화면이 자리를 안 말하면 전과 똑같이 장마다
 * 올림하고, 기획을 안 보내면 청크마다 다시 분석한다.
 */

const 기본 = (over: Partial<GenerateFieldsInput> = {}): GenerateFieldsInput => ({
  uploadFiles: [new File(["a"], "원본.png", { type: "image/png" })],
  knowledgeText: "", useKnowledge: false, request: "밝게",
  model: "openai", channel: "smartstore", ratio: "3:4", look: "auto",
  count: 1, startSection: 2, rolloutRequest: "",
  ...over,
});

const 채운다 = (over: Partial<GenerateFieldsInput> = {}) =>
  appendGenerateFields(new FormData(), 기본(over));

describe("쪼개 부르는 자리를 말한다", () => {
  it("**몇 번째인지와 모두 몇 장인지를 보낸다**", () => {
    const form = 채운다({ jobIndex: 3, jobTotal: 8 });

    expect(form.get("jobIndex")).toBe("3");
    expect(form.get("jobTotal")).toBe("8");
  });

  it("**한 번에 부르면 안 보낸다** — 쪼갠 것이 없다", () => {
    const form = 채운다({ jobIndex: 1, jobTotal: 1 });

    expect(form.get("jobIndex")).toBeNull();
  });

  /**
   * **장수는 안 보낸다.** 화면이 금액을 말하면 0 을 보내 공짜로 만들 수 있다.
   */
  it("**금액이나 장수는 안 보낸다**", () => {
    const form = 채운다({ jobIndex: 3, jobTotal: 8 });

    for (const 금지 of ["units", "credits", "creditUnits", "usd", "amount"]) {
      expect(form.get(금지), `${금지} 를 화면이 보내면 안 된다`).toBeNull();
    }
  });
});

/**
 * **페이지 장수는 이 요청의 장수와 다르다**(2026-09-21 리뷰 회귀).
 *
 * 화면은 장마다 따로 부르므로 `count` 는 늘 1이다. 그것으로 프롬프트의
 * 「N장을 이어 붙였을 때」를 적으면 모든 요청이 **「1장」**이 되어, 「한
 * 페이지로 이어져야 한다」는 요구가 유료 이미지마다 무의미해진다.
 */
describe("페이지가 몇 장짜리인지 보낸다", () => {
  it("**이 요청의 장수와 따로 보낸다**", () => {
    const form = 채운다({ count: 1, pageTotal: 8 });

    expect(form.get("count")).toBe("1");
    expect(form.get("pageTotal")).toBe("8");
  });

  it("**한 장짜리 페이지면 안 보낸다** — 이어 붙일 것이 없다", () => {
    expect(채운다({ pageTotal: 1 }).get("pageTotal")).toBeNull();
  });

  it("**모르면 안 보낸다** — 코어가 숫자 없이 말한다", () => {
    expect(채운다().get("pageTotal")).toBeNull();
  });
});

describe("이미 한 기획을 도로 보낸다", () => {
  const 분석 = { strategy: "효능을 앞세운다", product_inferred: { category: "크림" } };

  it("**분석을 글로 실어 보낸다**", () => {
    const form = 채운다({ analysis: 분석, analysisFiles: ["원본.png"] });

    expect(JSON.parse(String(form.get("analysis")))).toEqual(분석);
  });

  /**
   * **그 분석이 나온 원본과 지금 올린 원본이 같아야 한다.**
   *
   * 저장된 작업을 열면 원본 파일은 복원되지 않는다. 그 상태에서 **다른 제품**
   * 이미지를 올리고 「나머지 섹션 생성」을 누르면, 새 제품을 그리면서 옛
   * 제품의 전략과 `verified_facts` 가 프롬프트에 실린다. 조작이 아니라
   * **평범한 오조작**으로 닿는다.
   *
   * 전에는 청크마다 다시 분석했으므로 값은 비쌌어도 내용은 맞았다. 다시 안
   * 하기로 한 이상 여기서 묶어야 한다.
   */
  it("**원본이 바뀌었으면 안 보낸다**", () => {
    const form = 채운다({
      uploadFiles: [new File(["b"], "다른제품.png", { type: "image/png" })],
      analysis: 분석,
      analysisFiles: ["원본.png"],
    });

    expect(form.get("analysis")).toBeNull();
  });

  it("**한 장이 더 붙어도 안 보낸다**", () => {
    const form = 채운다({
      uploadFiles: [
        new File(["a"], "원본.png", { type: "image/png" }),
        new File(["b"], "원본2.png", { type: "image/png" }),
      ],
      analysis: 분석,
      analysisFiles: ["원본.png"],
    });

    expect(form.get("analysis")).toBeNull();
  });

  it("**어느 원본에서 나왔는지 모르면 안 보낸다**", () => {
    expect(채운다({ analysis: 분석 }).get("analysis")).toBeNull();
  });

  it("**없으면 안 보낸다** — 코어가 제가 분석한다", () => {
    expect(채운다().get("analysis")).toBeNull();
  });
});

describe("전에 보내던 것을 잃지 않는다", () => {
  it.each([
    ["request", "밝게"],
    ["model", "openai"],
    ["channel", "smartstore"],
    ["ratio", "3:4"],
    ["look", "auto"],
    ["count", "1"],
    ["startSection", "2"],
    // 아래 셋은 리뷰에서 「어디서도 안 재고 있다」고 잡힌 칸들이다.
    ["knowledgeText", ""],
    ["useKnowledge", "false"],
    ["rolloutRequest", ""],
  ])("**%s 를 보낸다**", (name, value) => {
    expect(채운다().get(name)).toBe(value);
  });

  it("**파일을 보낸다**", () => {
    expect(채운다().getAll("files")).toHaveLength(1);
  });

  it("**전사는 있을 때만 보낸다**", () => {
    expect(채운다().get("transcript")).toBeNull();
    expect(채운다({ transcript: "### 구간 1" }).get("transcript")).toBe("### 구간 1");
  });

  it("**각도는 인물을 골랐을 때만 여러 번 보낸다**", () => {
    expect(채운다({ characterAngles: ["front", "left45"] }).getAll("characterAngles")).toHaveLength(0);

    const form = 채운다({ characterId: "c1", characterAngles: ["front", "left45"] });
    expect(form.get("characterId")).toBe("c1");
    expect(form.getAll("characterAngles")).toEqual(["front", "left45"]);
  });
});

/**
 * **조립기를 만들어 두고 화면이 안 쓰면 아무것도 안 고친 것이다**(X-07 의 교훈).
 */
describe("마법사가 이 조립기를 쓴다", () => {
  const wizard = readFileSync(new URL("../redesign-wizard.tsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("**조립기를 부른다**", () => {
    expect(wizard).toContain("appendGenerateFields(form,");
  });

  it("**칸을 직접 붙이지 않는다** — 두 벌이면 한쪽만 고치는 날 갈린다", () => {
    expect(wizard).not.toMatch(/form\.append\("startSection"/);
    expect(wizard).not.toMatch(/form\.append\("count"/);
  });

  /**
   * **이름만 보면 뒤바뀐 것을 못 잡는다.**
   *
   * 처음에는 「`jobIndex` 라는 글자가 있는가」만 봤다. 그러면
   * `jobIndex: displayCount, jobTotal: displayIndex` 로 **뒤집어도 초록**이다 —
   * 그러면 첫 청크가 `jobIndex=8` 이 되어 덜 받는다(2026-09-21 리뷰).
   */
  it("**자리와 기획을 올바른 인자로 실어 부른다**", () => {
    const 부른자리 = wizard.slice(wizard.indexOf("appendGenerateFields(form,")).slice(0, 700);

    expect(부른자리).toMatch(/jobIndex:\s*displayIndex/);
    expect(부른자리).toMatch(/jobTotal:\s*displayCount/);
    expect(부른자리).toMatch(/analysis:\s*baseProject\?\.analysis/);
    // 분석이 어느 원본에서 나왔는지도 함께 가야 묶을 수 있다.
    expect(부른자리).toMatch(/analysisFiles:\s*baseProject\?\.files/);
  });

  /**
   * **`count` 를 페이지 장수로 넘기면 회귀가 되살아난다.** 한 장씩 부르는
   * 경로에서 그 수는 늘 1이다.
   */
  it("**페이지 장수를 제 이름으로 넘긴다**", () => {
    const 부른자리 = wizard.slice(wizard.indexOf("appendGenerateFields(form,")).slice(0, 700);

    expect(부른자리).toMatch(/pageTotal,/);
  });

  it("**일괄 생성이 실제 페이지 장수를 넘긴다**", () => {
    const 일괄 = wizard.slice(wizard.indexOf("generate-sequence:start")).slice(0, 1200);

    // generate(1, …, outputCount, 자리, outputCount) 의 마지막 인자다.
    expect(일괄).toMatch(/sectionNumber - startSection \+ 1,\s*outputCount\)/);
  });

  it("**나머지 섹션 생성도 완성 페이지 장수를 넘긴다**", () => {
    const 나머지 = wizard.slice(wizard.indexOf("generate-rest:start")).slice(0, 1200);

    expect(나머지).toMatch(/index \+ 1,\s*FULL_PAGE_SECTIONS\)/);
  });
});
