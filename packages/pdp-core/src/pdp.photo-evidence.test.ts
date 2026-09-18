import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PdpService } from "./pdp.service";
import { photoSourceText } from "./pdp.photo-evidence";
import { normalizeSectionEvidence, verifyEvidenceStructure } from "./pdp.evidence";
import type { LandingPageBlueprint } from "./types";

/**
 * **사진 경로에도 근거 검사를 돌린다.**
 *
 * `verifyEvidenceStructure` 는 글 경로(`pdp.text-plan.ts`)에서만 돌았다. 사진
 * 경로는 같은 스키마로 `evidence` 를 받으면서 **아무도 검사하지 않았다** —
 * 지어낸 인용, 금지된 주장, 안 채운 질문이 그대로 통과했다.
 *
 * 설계 §9.2: 「사진 판독 사실·판매자 입력·텍스트 원문을 **같은 근거 목록**에
 * 연결한다.」 K-09 가 「사진 근거 게이트 비대칭」이라 적은 자리다.
 *
 * ── 사진 경로의 「원문」은 무엇인가 ──────────────────────────
 *
 * 글 경로는 사용자가 친 글이 원문이다. 사진 경로에는 그런 것이 없다. 대신
 * **사용자가 직접 적은 것**이 있다 — 판매자 브리프와 추가 정보. 그것이 원문이다.
 * 사진에서 읽은 것은 추정이라 인용의 근거가 될 수 없다(같은 §9.2: 「시각 추정
 * 재질/효능을 확인 사실로 자동 승격하지 않는다」).
 */
describe("사진 경로의 원문", () => {
  it("판매자가 적은 칸을 모두 잇는다", () => {
    const 원문 = photoSourceText({
      sellerBrief: { audience: "출퇴근하는 직장인", features: "3단 높이 조절" },
      additionalInfo: "여름 신상",
    });

    expect(원문).toContain("출퇴근하는 직장인");
    expect(원문).toContain("3단 높이 조절");
    expect(원문).toContain("여름 신상");
  });

  it("빈 칸은 넣지 않는다", () => {
    expect(photoSourceText({ sellerBrief: { audience: "  " } })).toBe("");
  });

  it("아무것도 안 적었으면 빈 원문이다", () => {
    expect(photoSourceText({})).toBe("");
  });
});

const 섹션 = (patch: Record<string, unknown> = {}) => ({
  section_id: "S1",
  headline: "3단 높이 조절",
  subheadline: "",
  bullets: [],
  trust_or_objection_line: "",
  CTA: "",
  prompt_ko: "",
  prompt_en: "a chair",
  layout_notes: "",
  evidenceVersion: 1,
  evidence: [],
  ...patch,
});

const 구성안 = (section: ReturnType<typeof 섹션>) =>
  ({ executiveSummary: "", scorecard: [], blueprintList: [], sections: [section] }) as unknown as LandingPageBlueprint;

describe("사진 경로에서도 인용을 대조한다", () => {
  it("판매자가 적은 말을 인용하면 통과한다", () => {
    const 원문 = photoSourceText({ sellerBrief: { features: "3단 높이 조절" } });
    const 결과 = verifyEvidenceStructure(
      구성안(섹션({ evidence: [{ target: { slot: "headline" }, value: "3단 높이 조절", kind: "quoted", quote: "3단 높이 조절" }] })),
      원문,
    );

    expect(결과).toHaveLength(0);
  });

  it("**지어낸 인용은 잡는다** — 사진 경로에서도", () => {
    const 원문 = photoSourceText({ sellerBrief: { features: "3단 높이 조절" } });
    const 결과 = verifyEvidenceStructure(
      구성안(섹션({ headline: "수강생 만족도 98%", evidence: [{ target: { slot: "headline" }, value: "수강생 만족도 98%", kind: "quoted", quote: "수강생 만족도 98%" }] })),
      원문,
    );

    expect(결과.map((one) => one.reason)).toContain("bad_quote");
  });

  it("**사진에서 읽은 것은 인용 근거가 아니다**", () => {
    // 판매자는 재질을 안 적었다. 사진으로 「가죽으로 보인다」를 인용이라 할 수 없다.
    const 원문 = photoSourceText({ sellerBrief: { audience: "직장인" } });
    const 결과 = verifyEvidenceStructure(
      구성안(섹션({ headline: "천연 가죽", evidence: [{ target: { slot: "headline" }, value: "천연 가죽", kind: "quoted", quote: "천연 가죽" }] })),
      원문,
    );

    expect(결과.map((one) => one.reason)).toContain("bad_quote");
  });
});

/**
 * **배선이 실제로 닿았는가.**
 *
 * 함수가 맞아도 사진 경로가 안 부르면 아무 일도 안 일어난다. 그 줄은 지워도
 * 위 시험이 전부 통과한다 — 이 저장소가 겪은 그 구멍이다.
 */
describe("사진 경로가 실제로 검사하는가", () => {
  const service = readFileSync(new URL("./pdp.service.ts", import.meta.url), "utf8");

  it("구성안이 나온 뒤 근거를 검사한다", () => {
    expect(service).toContain("verifyEvidenceStructure(");
    expect(service).toContain("photoSourceText({");
  });

  it("**같은 원문으로 잰다** — 사진에서 읽은 것을 원문으로 쓰지 않는다", () => {
    const 호출 = /photoSourceText\(\{([^}]*)\}/.exec(service)?.[1] ?? "";

    expect(호출).toContain("sellerBrief");
    expect(호출).toContain("additionalInfo");
    expect(호출).not.toContain("productReading");
  });

  it("실패하면 정책대로 메운다 — 글 경로와 같은 함수다", () => {
    expect(service).toContain("resolveStructureFailures(blueprint, photoEvidenceFailures");
  });
});

/**
 * **소스를 읽는 것으로는 「결과를 쓰는가」를 못 잰다.**
 *
 * 검사를 부르고 그 결과를 버려도 문자열 시험은 통과한다 — 변이로 확인했다.
 * 실제로 돌려서 **결과물이 달라지는지** 본다.
 */
describe("사진 경로를 실제로 돌려 본다", () => {
  const 지어낸인용 = {
    executiveSummary: "요약",
    scorecard: [],
    blueprintList: [],
    sections: [
      {
        section_id: "s1",
        section_name: "히어로",
        goal: "관심",
        headline: "수강생 만족도 98%",
        subheadline: "",
        bullets: [],
        trust_or_objection_line: "",
        CTA: "",
        prompt_ko: "",
        prompt_en: "a product",
        layout_notes: "",
        evidenceVersion: 1,
        evidence: [
          { target: { slot: "headline" }, value: "수강생 만족도 98%", kind: "quoted", quote: "수강생 만족도 98%" },
        ],
      },
    ],
  };

  const 돌리기 = async (gapPolicy: "omit" | "ask" | "sample") => {
    const llm = { generate: async () => ({ text: JSON.stringify(지어낸인용) }) };
    return new PdpService().analyzeProduct(
      {
        imageBase64: "iVBORw0KGgo=",
        mimeType: "image/png",
        aspectRatio: "3:4",
        // 판매자는 이런 말을 한 적이 없다. 그러니 저 인용은 지어낸 것이다.
        sellerBrief: { audience: "직장인" },
        gapPolicy,
      } as never,
      { llm, generateImage: async () => ({ base64: "AAA", mimeType: "image/png" }) } as never,
      { skipFirstImage: true },
    );
  };

  it("**지어낸 인용이 그대로 나가지 않는다**", async () => {
    const 결과 = await 돌리기("omit");
    const headline = 결과.blueprint.sections[0]!.headline;

    // 생략 정책이면 그 문장을 뺀다.
    expect(headline).not.toBe("수강생 만족도 98%");
  });

  it("정책이 「물어보기」면 확인을 남긴다", async () => {
    const 결과 = await 돌리기("ask");
    const section = 결과.blueprint.sections[0]!;

    // 지어낸 그대로 통과하지 않는다.
    expect(section.headline === "수강생 만족도 98%" && !section.evidence?.some((e) => e.kind === "ask")).toBe(false);
  });
});

/**
 * **모르는 종류를 「원문에 있다」로 읽지 않는다.**
 *
 * `kind` 는 모델이 채우는 값이다. 엉뚱한 값이 오거나 아예 빠졌을 때 `quoted` 로
 * 떨어뜨리면 **「원문에 있다」는 주장이 근거 없이 서고**, 그 문장이 사용자 확인
 * 없이 그대로 나간다. `sample` 은 확인을 거친다.
 */
describe("근거 종류 손질", () => {
  it.each([
    ["빈 값", ""],
    ["모르는 값", "지어낸종류"],
    ["없음", undefined],
  ])("%s 은 sample 로 떨어진다 — quoted 가 아니다", (_label, kind) => {
    const [entry] = normalizeSectionEvidence([{ target: { slot: "headline" }, value: "무엇", kind }]);

    expect(entry!.kind).toBe("sample");
  });

  it("아는 종류는 그대로 둔다", () => {
    for (const kind of ["quoted", "rhetoric", "sample", "ask"]) {
      const [entry] = normalizeSectionEvidence([{ target: { slot: "headline" }, value: "무엇", kind }]);
      expect(entry!.kind).toBe(kind);
    }
  });

  it("`user` 는 sample 과 같은 뜻이다 — 옛 이름이다", () => {
    const [entry] = normalizeSectionEvidence([{ target: { slot: "headline" }, value: "무엇", kind: "user" }]);

    expect(entry!.kind).toBe("sample");
  });

  it("모양이 틀린 항목은 버린다", () => {
    expect(normalizeSectionEvidence([{ target: { slot: "없는자리" } }, null, "글자"])).toHaveLength(0);
  });
});
