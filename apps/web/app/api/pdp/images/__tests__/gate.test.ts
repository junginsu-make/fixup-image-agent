import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionBlueprint } from "@fixup/pdp-core";

const membership = vi.hoisted(() => ({
  authenticateApiMember: async () => ({ ok: true, member: { userId: "u1" } }),
  settleAiUsage: vi.fn(async () => ({})),
  reserveAiUsage: vi.fn(),
  finalizeAiUsage: vi.fn(),
}));

// 이 길이 이제 팀을 묻는다. 「server-only」는 시험 환경에 없는 꾸러미라
// 다른 시험들과 같은 방식으로 비워 둔다.
vi.mock("server-only", () => ({}));
vi.mock("../../../../../lib/teams/store", () => ({ teamIdOf: async () => null }));

vi.mock("../../../../../lib/membership/api", () => membership);
vi.mock("@fixup/pdp-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@fixup/pdp-core")>()),
  generateSectionImage: vi.fn(async () => ({
    imageBase64: "AAAA",
    mimeType: "image/jpeg",
    generatedImages: 1,
  })),
}));
vi.mock("../../../../../lib/pdp/providers", () => ({
  createPdpProviders: () => ({
    llm: { generate: async () => ({ text: "{}" }) },
    generateImage: async () => ({ base64: "IMG", mimeType: "image/jpeg" }),
  }),
}));
vi.mock("../../../../../lib/characters", () => ({ loadCharacterView: vi.fn(async () => null) }));

import { rejectIfUnverified } from "../../../../../lib/evidence-gate";
import { POST as postSingle } from "../route";
import { POST as postBatch } from "../batch/route";

function section(overrides: Partial<SectionBlueprint> = {}): SectionBlueprint {
  return {
    section_id: "S1",
    section_name: "첫 장면",
    goal: "관심",
    headline: "오늘 시작하세요",
    headline_en: "Start today",
    subheadline: "",
    subheadline_en: "",
    bullets: [],
    bullets_en: [],
    trust_or_objection_line: "",
    trust_or_objection_line_en: "",
    CTA: "",
    CTA_en: "",
    layout_notes: "",
    compliance_notes: "",
    image_id: "IMG_S1",
    purpose: "",
    prompt_ko: "밝은 방",
    prompt_en: "a bright room",
    negative_prompt: "",
    style_guide: "",
    reference_usage: "",
    evidenceVersion: 1,
    evidence: [
      { target: { slot: "headline" }, value: "오늘 시작하세요", kind: "rhetoric" },
      { target: { slot: "prompt_ko" }, value: "밝은 방", kind: "rhetoric" },
    ],
    ...overrides,
  };
}

function request(body: unknown) {
  return new Request("http://localhost/api/pdp/images", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("이미지 생성 근거 게이트", () => {
  beforeEach(() => {
    membership.reserveAiUsage.mockReset();
    membership.finalizeAiUsage.mockReset();
    membership.reserveAiUsage.mockResolvedValue({ ok: true, userId: "u1" });
  });

  it("미확인 sample이 있으면 400", async () => {
    const response = rejectIfUnverified([
      section({
        evidence: [
          { target: { slot: "headline" }, value: "오늘 시작하세요", kind: "sample", note: "확인" },
        ],
      }),
    ]);
    expect(response?.status).toBe(400);
  });

  // 근거를 지우고 보내는 우회를 막는다. 다만 '배열이 비었는가'가 아니라
  // '수치를 말하는 자리에 근거가 있는가'로 본다 — 그래야 숫자 없는 카피와
  // 사용자가 방금 추가한 빈 섹션이 억울하게 막히지 않는다.
  it("수치를 말하는데 근거를 지우고 보내면 400", () => {
    const stripped = section({ subheadline: "수강생 3,000명이 선택했습니다", evidence: [] });
    expect(rejectIfUnverified([stripped])?.status).toBe(400);
  });

  it("수치가 없으면 근거가 비어도 통과한다", () => {
    expect(rejectIfUnverified([section({ evidence: [] })])).toBeNull();
    expect(rejectIfUnverified([section({ evidence: undefined })])).toBeNull();
  });

  it("evidenceVersion이 없는 구버전 섹션은 통과", () => {
    expect(rejectIfUnverified([section({ evidenceVersion: undefined, evidence: undefined })])).toBeNull();
  });

  it("prompt_en에 금지 문구가 있으면 400", () => {
    expect(rejectIfUnverified([section({ prompt_en: "guaranteed cure in seven days" })])?.status).toBe(400);
  });

  it("단건 라우트는 크레딧 예약 전에 거절한다", async () => {
    const unsafe = section({
      evidence: [
        { target: { slot: "headline" }, value: "오늘 시작하세요", kind: "sample", note: "확인" },
      ],
    });
    const response = await postSingle(request({
      originalImageBase64: "AAAA",
      section: unsafe,
      aspectRatio: "9:16",
    }));
    expect(response.status).toBe(400);
    expect(membership.reserveAiUsage).not.toHaveBeenCalled();
  });

  it("배치 라우트도 크레딧 예약 전에 거절한다", async () => {
    const unsafe = section({
      evidence: [
        { target: { slot: "headline" }, value: "오늘 시작하세요", kind: "sample", note: "확인" },
      ],
    });
    const response = await postBatch(request({
      originalImageBase64: "AAAA",
      sections: [unsafe],
      aspectRatio: "9:16",
    }));
    expect(response.status).toBe(400);
    expect(membership.reserveAiUsage).not.toHaveBeenCalled();
  });
});

/**
 * **사용자가 직접 친 금지 주장도 막는다**(N-1, 설계 §9.2).
 *
 * 설계: 「`sample`: … **금지된 허위 주장은 확인 버튼만으로 허용하지 않는다**」.
 *
 * ── 무엇이 새고 있었나 ─────────────────────────────────────
 *
 * 게이트는 `scanBannedClaims(section.prompt_en)` **하나만** 봤다. 그런데
 * 상세페이지는 출력 모드가 `full-image` 라 **글자가 이미지 안에 그려진다** —
 * `pdp.image-prompt.ts` 가 제목·부제·불릿·신뢰문구를 프롬프트에 싣는다.
 *
 * 그래서 사용자가 제목에 「식약처 인증」을 직접 치면
 *
 *   `applyUserEdit` → `kind: "user"` → 코어의 banned 검사는 `sample` 만 본다
 *   → 서버 게이트는 `prompt_en` 만 본다
 *   → **그대로 이미지에 그려져 나간다**
 *
 * 금지어 갈래가 guarantee·medical·credential 셋이라 전부 법적 위험이다.
 *
 * ── 재는 것을 갈라 둔다 ────────────────────────────────────
 *
 * 게이트에는 검사가 셋이다(근거 없는 수치 · 미확인 예시 · 금지 주장). 근거를
 * 안 달면 **앞 둘에 먼저 걸려** 금지 주장 검사가 도는지 알 수 없다. 그래서
 * 아래는 전부 `kind: "user"` 근거를 달아 **금지 주장만 남긴다** — 사용자가
 * 직접 써서 확인까지 누른 상태다.
 */
describe("금지된 주장은 어느 칸에 있어도 막는다", () => {
  /**
   * 그 칸을 사용자가 직접 쓰고 확인까지 누른 상태.
   *
   * **같은 칸의 근거가 둘이면 안 된다.** 기본 근거를 남겨 두면 값이 안 맞아
   * `stale` 이 되고, 그러면 「미확인 예시」 검사에 먼저 걸려 금지 주장 검사가
   * 도는지 알 수 없다.
   */
  const 사용자가친것 = (slot: string, value: string) =>
    section({
      [slot]: value,
      evidence: [
        ...(slot === "headline" ? [] : [{ target: { slot: "headline" }, value: "오늘 시작하세요", kind: "rhetoric" }]),
        { target: { slot: "prompt_ko" }, value: "밝은 방", kind: "rhetoric" },
        { target: { slot }, value, kind: "user" },
      ],
    } as never);

  it.each([
    ["headline", "식약처 인증을 받은 제품입니다"],
    ["subheadline", "국내 1위 제품입니다"],
  ])("**%s 에 있어도 막는다** — 이미지에 그려지는 칸이다", (slot, value) => {
    const 막힘 = rejectIfUnverified([사용자가친것(slot, value)]);

    expect(막힘, `${slot} 이 안 막혔다`).toBeTruthy();
  });

  it("**불릿에 있어도 막는다**", () => {
    const 막힘 = rejectIfUnverified([
      section({
        bullets: ["평범한 줄", "국내 1위 제품"],
        evidence: [
          { target: { slot: "headline" }, value: "오늘 시작하세요", kind: "rhetoric" },
          { target: { slot: "prompt_ko" }, value: "밝은 방", kind: "rhetoric" },
          { target: { slot: "bullet", index: 0 }, value: "평범한 줄", kind: "rhetoric" },
          { target: { slot: "bullet", index: 1 }, value: "국내 1위 제품", kind: "user" },
        ],
      } as never),
    ]);

    expect(막힘).toBeTruthy();
  });

  /**
   * **이미지에 안 실리는 칸은 안 막는다.** CTA 는 싣지 않기로 한 결정이 있다
   * (`pdp.image-prompt.ts`, 2026-07-30). 안 그려지는 글자로 생성을 막으면
   * 사용자는 왜 막혔는지 알 수 없다.
   */
  it("**이미지에 안 실리는 CTA 는 안 막는다**", () => {
    expect(rejectIfUnverified([사용자가친것("CTA", "국내 1위 제품 보러 가기")])).toBeNull();
  });

  /**
   * **신뢰 문장도 이제 안 막는다**(2026-09-23 사용자 결정).
   *
   * 이미지 밑에 설명 한 줄로 박혀 나와 그리지 않기로 했다. 그림에 없는
   * 문장 때문에 만들기가 막히면 사용자는 이유를 알 수 없다 — CTA 와 같은 이유다.
   */
  it("**이미지에 안 실리는 신뢰 문장은 안 막는다**", () => {
    expect(rejectIfUnverified([사용자가친것("trust_or_objection_line", "특허 등록된 기술입니다")])).toBeNull();
  });

  /**
   * **무엇을 고쳐야 하는지 말한다.**
   *
   * 「사용할 수 없는 주장이 있습니다」만 말하면 사용자는 여덟 칸을 뒤진다.
   * 사용자가 직접 쓴 문구를 우리가 말없이 지우지 않기로 했으므로
   * (그것이야말로 배신이다), **어디를 고쳐야 하는지는 반드시 말해야 한다.**
   */
  it("**어느 칸의 무슨 말이 걸렸는지 알려 준다**", async () => {
    const 막힘 = rejectIfUnverified([사용자가친것("headline", "식약처 인증을 받은 제품입니다")]);

    const body = await 막힘!.json();
    expect(body.message).toContain("제목");
    expect(body.message).toContain("식약처 인증");
  });

  it("**섹션 이름도 알려 준다** — 여러 장 중 어느 장인지", async () => {
    const 막힘 = rejectIfUnverified([사용자가친것("subheadline", "국내 1위 제품입니다")]);

    const body = await 막힘!.json();
    expect(body.message).toContain("첫 장면");
  });

  it("**사용자에게 보이는 말에 줄표를 안 쓴다**", async () => {
    const 막힘 = rejectIfUnverified([사용자가친것("headline", "식약처 인증을 받은 제품입니다")]);

    expect((await 막힘!.json()).message).not.toContain("—");
  });

  it("**멀쩡한 문구는 그대로 지나간다** — 막는 것이 과하면 못 쓴다", () => {
    expect(rejectIfUnverified([사용자가친것("headline", "30일 환불 보장")])).toBeNull();
    expect(rejectIfUnverified([사용자가친것("subheadline", "부담 없이 써 보세요")])).toBeNull();
  });
});
