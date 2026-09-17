import { describe, expect, it } from "vitest";
import { buildReferenceRoleDirective } from "./pdp.reference-policy";
import { buildFalPayload } from "./pdp.image-provider";
import { buildImageSystemPrompt } from "./pdp.image-prompt";
import type { ReferenceImage } from "./types";

describe("T-REF: 첨부 보존 계약", () => {
  it("제품 배치 지시가 정체성 보존 규칙을 제거하지 않는다", () => {
    const prompt = buildReferenceRoleDirective([{ kind: "anchor", base64: "AAAA", mimeType: "image/png", intent: "왼쪽에 배치" }]);
    expect(prompt).toContain("왼쪽에 배치"); expect(prompt).toContain("Never redesign, restyle or substitute the product");
    expect(prompt).toContain("the PRESERVED SUBJECT > the USER INSTRUCTION");
  });
  it("인물 포즈 지시도 얼굴 보존을 해제하지 않는다", () => {
    const prompt = buildReferenceRoleDirective([{ kind: "person", base64: "AAAA", mimeType: "image/png", intent: "팔을 들어 주세요" }]);
    expect(prompt).toContain("팔을 들어 주세요"); expect(prompt).toContain("never blend in another face");
  });
  it("필수 인물은 시스템 프롬프트에서도 필수다", () => {
    const prompt = buildImageSystemPrompt({ style: "studio", outputMode: "full-image", withModel: true });
    expect(prompt).not.toContain("People are optional"); expect(prompt).toContain("must appear");
  });
  it("첨부 한도 초과는 잘라 보내지 않고 실패한다", () => {
    const references: ReferenceImage[] = Array.from({ length: 8 }, (_, index) => ({ kind: index < 7 ? "person" : "style", base64: "AAAA", mimeType: "image/png" }));
    expect(() => buildFalPayload("nano-banana", { prompt: "", systemPrompt: "", aspectRatio: "3:4", references })).toThrow(/참조|reference/i);
  });
});
