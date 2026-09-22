import { describe, expect, it, vi } from "vitest";
import { buildSections, generateSections } from "./generate";

/**
 * **모델에게 구성을 짜라고 시켜 놓고 버렸다**(F-7-0).
 *
 * 설계 §14.6: 「PDF/원본/전사 범위 절단, **고정 S1~S10 구성** | 절단 범위
 * 확인·**자료별 구성으로 개선** | W7/W8 / **T-PLAN**, T-LIMIT」.
 * 설계 T-PLAN: 「실물 사진/실물 글/서비스 글/홍보, 원본 부족, **목적에 맞는
 * 구성**, 새 섹션과 신뢰문구 수정」.
 *
 * 분석 프롬프트는 `page_blueprint` 를 만들라고 시킨다. 그런데 `buildSections`
 * 는 그것을 **한 번도 안 읽고** 박아 둔 열 장(S1 히어로 … S10 최종 CTA)을
 * 그대로 쓴다.
 *
 * 그래서 **무엇을 올리든 같은 페이지 구성**이 나온다. 후기가 없는 신제품에도
 * 「S7 후기 카드」가, 비교할 것이 없는 단일 상품에도 「S9 비교/보증」이
 * 만들어진다. 근거가 없으니 모델은 그 자리를 **지어내거나 비워** 둔다.
 *
 * ── 무엇을 지켜야 하나 ──────────────────────────────────────
 *
 * **섹션 id 는 바뀌면 안 된다.** 화면이 `S3` 같은 번호로 섹션을 잇고, 「나머지
 * 섹션 생성」이 빠진 번호를 고른다. 구성만 자료를 따라가고 자리는 그대로다.
 */

const payload = {
  request: "밝게",
  rolloutRequest: "",
  knowledgeText: "",
  options: { channel: "smartstore", ratio: "3:4", count: 3 },
};
const modelInfo = { provider: "openai", label: "정밀형", id: "test-model" } as never;

const 구성 = (analysis: unknown, count = 3, start = 1) =>
  buildSections(count, start, payload, analysis, modelInfo);

const 청사진 = {
  page_blueprint: [
    { section_id: "S1", name: "원목 캡 히어로", purpose: "원목 캡을 첫 화면에 크게 보여 준다", source: "제품컷" },
    { section_id: "S2", name: "저온 압착 공정", purpose: "왜 저온인지 한 장으로 설명한다", source: "공정 사진" },
    { section_id: "S3", name: "성분표", purpose: "라벨의 수치를 읽기 쉽게 옮긴다", source: "라벨" },
  ],
};

describe("자료가 정한 구성을 쓴다", () => {
  it("**청사진의 이름이 섹션 이름이 된다**", () => {
    const 결과 = 구성(청사진);

    expect(결과.map((section) => section.name)).toEqual([
      "S1 원목 캡 히어로", "S2 저온 압착 공정", "S3 성분표",
    ]);
  });

  it("**목적도 청사진에서 온다**", () => {
    expect(구성(청사진)[1]!.purpose).toContain("왜 저온인지");
  });

  it("**프롬프트에 그 목적이 실린다** — 안 실리면 이름만 바뀐 것이다", () => {
    expect(구성(청사진)[1]!.promptText).toContain("왜 저온인지");
  });

  /**
   * **자리는 그대로다.** 화면이 번호로 섹션을 잇고 「나머지 섹션 생성」이 빠진
   * 번호를 고른다. 여기가 흔들리면 만든 그림이 엉뚱한 자리에 붙는다.
   */
  it("**섹션 id 는 여전히 S1·S2·S3 이다**", () => {
    expect(구성(청사진).map((section) => section.section_id)).toEqual(["S1", "S2", "S3"]);
  });

  /**
   * **모델이 제 번호를 붙여 와도 안 따라간다.**
   *
   * 처음 시험은 청사진의 `section_id` 를 `S1`·`S2`·`S3` 으로 적어 두었다.
   * 우리 번호와 우연히 같아서, **모델 번호를 그대로 쓰도록 바꿔도 초록**이었다
   * (2026-09-21 변이에서 드러남). 다른 번호로 잰다.
   */
  it("**모델이 붙인 번호를 쓰지 않는다**", () => {
    const 딴번호 = {
      page_blueprint: [
        { section_id: "B7", name: "원목 캡 히어로" },
        { section_id: "hero-2", name: "저온 압착 공정" },
        { section_id: "brand-x", name: "성분표" },
      ],
    };

    const 결과 = 구성(딴번호);

    expect(결과.map((section) => section.section_id)).toEqual(["S1", "S2", "S3"]);
    expect(결과.map((section) => section.image_id)).toEqual(["IMG_S1", "IMG_S2", "IMG_S3"]);
    // 이름은 청사진에서 온다. 번호만 우리 것이다.
    expect(결과[0]!.name).toBe("S1 원목 캡 히어로");
  });

  it("**이어 만들기도 제 번호를 쓴다**", () => {
    const 결과 = 구성(청사진, 2, 2);

    expect(결과.map((section) => section.section_id)).toEqual(["S2", "S3"]);
    expect(결과[0]!.name).toBe("S2 저온 압착 공정");
  });
});

describe("청사진이 없거나 못 쓰면 전과 같다", () => {
  it.each([
    ["분석이 없음", undefined],
    ["청사진이 없음", { strategy: "좋다" }],
    ["청사진이 빈 배열", { page_blueprint: [] }],
    ["청사진이 배열이 아님", { page_blueprint: "S1, S2" }],
    ["칸이 비어 있음", { page_blueprint: [{}, {}, {}] }],
    ["이름이 빈 글자", { page_blueprint: [{ name: "  " }] }],
  ])("**%s 이면 박아 둔 구성을 쓴다**", (_label, analysis) => {
    expect(구성(analysis)[0]!.name).toBe("S1 히어로");
  });

  /**
   * **모자라면 그 자리만 메운다.** 청사진이 두 장인데 세 장을 만들면 셋째는
   * 박아 둔 것으로 간다.
   */
  it("**청사진이 모자라면 남은 자리만 박아 둔 것을 쓴다**", () => {
    const 결과 = 구성({ page_blueprint: 청사진.page_blueprint.slice(0, 2) });

    expect(결과.map((section) => section.name)).toEqual([
      "S1 원목 캡 히어로", "S2 저온 압착 공정", "S3 베네핏 3개",
    ]);
  });
});

/**
 * **「8장」을 실제 count 로 바꾼 것이 회귀였다**(2026-09-21 리뷰).
 *
 * 리디자인은 **장마다 따로 요청한다.** 화면이 `generate(1, …)` 로 부르므로
 * 라우트가 받는 `count` 는 **언제나 1**이다. 그래서 「전체 연결 규칙:
 * ${count}장을 이어 붙였을 때」가 모든 실제 요청에서 **「1장」**이 됐다 —
 * 「한 페이지로 이어져야 한다」는 요구가 유료 이미지마다 무의미해졌다.
 * 고치기 전(박아 둔 8장)보다 나쁘다.
 *
 * 이 요청이 만드는 장수(`count`)와 **페이지가 몇 장짜리인가**(`pageTotal`)는
 * 다른 수다. 뒤엣것을 따로 받는다. 모르면 숫자를 안 쓴다 — 틀린 수를 대는
 * 것보다 안 대는 쪽이 낫다.
 */
describe("페이지가 몇 장짜리인지 사실대로 말한다", () => {
  const 규칙 = (count: number, pageTotal?: number) =>
    buildSections(
      count, 1,
      { ...payload, options: { ...payload.options, count } },
      청사진, modelInfo, undefined,
      pageTotal === undefined ? undefined : { pageTotal },
    )[0]!.promptText;

  it.each([[3], [8], [10]])("**페이지가 %s장이면 그렇게 적는다**", (pageTotal) => {
    // 한 번에 한 장씩 부르는 실제 경로다.
    expect(규칙(1, pageTotal)).toContain(`${pageTotal}장을 이어 붙였`);
  });

  it("**한 장씩 부른다고 「1장」이라고 하지 않는다**", () => {
    expect(규칙(1, 8)).not.toContain("1장을 이어 붙였");
  });

  it("**페이지 장수를 모르면 숫자를 안 쓴다**", () => {
    const 말 = 규칙(1);

    expect(말).toContain("이어 붙였을 때");
    expect(말).not.toMatch(/\d+장을 이어 붙였/);
  });

  it("**한 번에 다 만들면 그 수가 페이지 장수다**", () => {
    expect(규칙(8)).toContain("8장을 이어 붙였");
  });
});

/**
 * **모델이 준 번호를 자리 맞추는 데 쓴다**(리뷰 MEDIUM).
 *
 * 전에는 **위치로만** 얹었다. 청사진 첫 칸이 「브랜드 스토리」면 S1 이 히어로
 * 레이아웃(「가장 강한 비주얼」)을 단 채 브랜드 스토리가 된다.
 *
 * 번호를 **쓰되 따르지는 않는다** — 자리를 찾는 데만 쓰고, 우리 번호는 그대로다.
 */
describe("청사진의 번호로 자리를 맞춘다", () => {
  const 뒤섞인청사진 = {
    page_blueprint: [
      { section_id: "S3", name: "성분표" },
      { section_id: "S1", name: "원목 캡 히어로" },
      { section_id: "S2", name: "저온 압착 공정" },
    ],
  };

  it("**순서가 뒤섞여 와도 제자리에 얹는다**", () => {
    const 결과 = 구성(뒤섞인청사진);

    expect(결과.map((section) => section.name)).toEqual([
      "S1 원목 캡 히어로", "S2 저온 압착 공정", "S3 성분표",
    ]);
  });

  it("**이어 만들기도 번호로 찾는다**", () => {
    const 결과 = 구성(뒤섞인청사진, 1, 3);

    expect(결과[0]!.name).toBe("S3 성분표");
  });

  /**
   * **반만 번호를 달고 왔으면 나머지는 안 얹는다.**
   *
   * 번호를 단 칸이 하나라도 있으면 모델이 자리를 말한 것이다. 그런데 번호
   * 없는 칸을 **자리로** 얹으면, 번호 단 칸과 겹치거나 엉뚱한 자리에 간다.
   * 안 얹으면 박아 둔 구성이 그 자리를 지킨다.
   */
  it("**번호가 섞여 오면 번호 단 것만 얹는다**", () => {
    const 섞임 = {
      page_blueprint: [
        { section_id: "S2", name: "저온 압착 공정" },
        { name: "이름만 있는 칸" },
      ],
    };

    const 결과 = 구성(섞임);

    expect(결과.map((section) => section.name)).toEqual([
      "S1 히어로", "S2 저온 압착 공정", "S3 베네핏 3개",
    ]);
  });

  it("**번호가 없으면 전처럼 자리로 얹는다**", () => {
    const 번호없음 = { page_blueprint: [{ name: "첫 장" }, { name: "둘째 장" }, { name: "셋째 장" }] };

    expect(구성(번호없음).map((section) => section.name)).toEqual([
      "S1 첫 장", "S2 둘째 장", "S3 셋째 장",
    ]);
  });
});

/**
 * **한 페이지 안에서 이름 규격이 갈렸다**(리뷰 MEDIUM).
 *
 * 청사진이 두 칸인데 여덟 장을 만들면 앞은 맨 이름, 뒤는 `S#` 접두가 되어
 * 프롬프트의 `섹션:` 줄과 화면 제목이 섞인다. 또 결과 화면이 이름만 찍는데
 * 「나머지 섹션 생성」은 번호로 말해서, 사용자가 카드와 번호를 못 잇는다.
 */
describe("이름 규격이 한 페이지 안에서 같다", () => {
  it("**얹은 이름에도 번호가 붙는다**", () => {
    expect(구성(청사진)[0]!.name).toBe("S1 원목 캡 히어로");
  });

  it("**모자라서 박아 둔 것을 써도 규격이 같다**", () => {
    const 결과 = buildSections(4, 1, payload, { page_blueprint: 청사진.page_blueprint.slice(0, 2) }, modelInfo);

    for (const [index, section] of 결과.entries()) {
      expect(section.name.startsWith(`S${index + 1} `), section.name).toBe(true);
    }
  });

  it("**모델이 번호를 이름에 이미 붙여 왔으면 두 번 안 붙인다**", () => {
    const 결과 = 구성({ page_blueprint: [{ section_id: "S1", name: "S1 히어로컷" }] });

    expect(결과[0]!.name).toBe("S1 히어로컷");
  });

  /** **문단을 이름으로 주면 자른다.** 프롬프트 줄과 화면 제목이 통째로 받는다. */
  it("**이름이 너무 길면 자른다**", () => {
    const 결과 = 구성({ page_blueprint: [{ name: "가".repeat(300) }] });

    expect(결과[0]!.name.length).toBeLessThanOrEqual(60);
  });
});

/**
 * **검증된 사실이 엉뚱한 장에 붙었다**(리뷰 MEDIUM).
 *
 * 인증·수치 블록은 `S4`·`S5` 라는 **자리**에 붙는데, 구성은 이제 자료를
 * 따라간다. 청사진이 「근거/시험성적」을 7번째에 두면 그 장에는 안 붙고
 * 엉뚱한 장(예: 사용법)에 붙는다.
 */
describe("검증된 사실은 근거를 말하는 장에 붙는다", () => {
  const 사실있음 = (blueprint: unknown) => ({
    page_blueprint: blueprint,
    verified_facts: ["인증번호 제2024-1234호", "총 용량 50ml"],
  });

  it("**근거를 말하는 장에 붙는다**", () => {
    const 결과 = buildSections(3, 1, payload, 사실있음([
      { section_id: "S1", name: "히어로" },
      { section_id: "S2", name: "사용법" },
      { section_id: "S3", name: "시험성적서와 인증" },
    ]), modelInfo);

    // 사실 문자열 자체는 `분석 요약:` 에도 실린다. **블록이 붙었는지**를 본다.
    expect(결과[2]!.promptText).toContain("검증된 원본 사실");
    expect(결과[1]!.promptText).not.toContain("검증된 원본 사실");
  });

  it("**청사진이 없으면 전처럼 S4·S5 에 붙는다**", () => {
    const 결과 = buildSections(5, 1, payload, { verified_facts: ["총 용량 50ml"] }, modelInfo);

    expect(결과[3]!.promptText).toContain("검증된 원본 사실");
    expect(결과[4]!.promptText).toContain("검증된 원본 사실");
    expect(결과[0]!.promptText).not.toContain("검증된 원본 사실");
  });
});

/**
 * **코어 입구에서도 페이지 장수가 닿아야 한다.**
 *
 * `buildSections` 만 재면 `generateSections` 가 그 값을 안 넘겨도 안 잡힌다
 * (2026-09-21 변이에서 드러남).
 */
describe("생성 입구가 페이지 장수를 내려보낸다", () => {
  const 이미지 = { name: "원본.png", type: "image/png", buffer: Buffer.from("AAA") };

  const 돌린다 = async (pageTotal?: number) => {
    const 프롬프트: string[] = [];
    vi.stubGlobal("fetch", async () => ({
      ok: true, status: 200, headers: new Headers(),
      text: async () => JSON.stringify({ output_text: JSON.stringify({ strategy: "좋다" }) }),
    }));
    try {
      await generateSections({
        model: "openai", openaiKey: "sk-test", files: [이미지] as never,
        request: "밝게", channel: "smartstore", ratio: "3:4",
        count: 1, startSection: 1, pageTotal,
        generateImage: async (request: { prompt: string }) => {
          프롬프트.push(request.prompt);
          return { buffer: Buffer.from("IMG"), mimeType: "image/png" };
        },
      } as never);
    } finally {
      vi.unstubAllGlobals();
    }
    return 프롬프트[0] ?? "";
  };

  it("**여덟 장짜리 페이지라고 알려 주면 그렇게 적는다**", async () => {
    expect(await 돌린다(8)).toContain("8장을 이어 붙였");
  });

  it("**안 알려 주면 숫자를 안 쓴다**", async () => {
    const 말 = await 돌린다();

    expect(말).toContain("이어 붙였을 때");
    expect(말).not.toMatch(/\d+장을 이어 붙였/);
  });
});
