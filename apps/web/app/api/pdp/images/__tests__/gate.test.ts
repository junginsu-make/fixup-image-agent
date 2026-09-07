import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionBlueprint } from "@fixup/pdp-core";

const membership = vi.hoisted(() => ({
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
vi.mock("../../../../../lib/server-keys", () => ({ resolveGeminiKey: () => "key" }));
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
