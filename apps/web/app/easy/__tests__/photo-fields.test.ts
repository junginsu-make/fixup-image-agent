import { describe, expect, it } from "vitest";
import { restoreAttachments } from "@fixup/shared";
import { EMPTY_SLOTS, PosterProjectInputSchema, buildPosterJob } from "@fixup/poster-core";
import { IMAGE_MODELS } from "@fixup/sns-core";
import { easyAttachmentIntent, posterFieldsFrom } from "../photo-fields";
import type { EasyPhotoRole, RoleJudgment } from "../photo-roles";

const 사진 = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, C, D] = [사진(1), 사진(2), 사진(3), 사진(4)];
const 기본모델 = IMAGE_MODELS.find((model) => model.isDefault)!.id;

describe("역할 → 칸 (설계 §2-6)", () => {
  const fields = posterFieldsFrom([
    { id: A, role: "style" },
    { id: B, role: "preserve_product" },
    { id: C, role: "preserve_person" },
    { id: D, role: "preserve_person_restyled" },
  ]);

  it("역할마다 제 칸으로 간다", () => {
    expect(fields).toEqual({
      referenceIds: [A],
      preservedIds: [B, C, D],
      personIds: [C, D],
      restyledIds: [D],
      attachmentOrder: [A, B, C, D],
    });
  });

  /** 주소는 두 목록에서만 찾는다 — personIds 에만 있으면 첨부가 통째로 빠진다. */
  it("restyledIds ⊆ personIds ⊆ preservedIds", () => {
    expect(fields.restyledIds.every((id) => fields.personIds.includes(id))).toBe(true);
    expect(fields.personIds.every((id) => fields.preservedIds.includes(id))).toBe(true);
  });

  it("차례는 붙인 순서 그대로다 — 따라 만들기를 앞으로 당기지 않는다", () => {
    expect(posterFieldsFrom([{ id: B, role: "preserve_product" }, { id: A, role: "style" }]).attachmentOrder)
      .toEqual([B, A]);
  });

  /** 차례 검사(`schemas.ts:218`)를 통과해야 만들기가 400 으로 안 막힌다. */
  it("이미지 만들기의 입력 검사를 통과한다", () => {
    const parsed = PosterProjectInputSchema.safeParse({
      title: "쉽게", ratio: "1:1", modelId: 기본모델, variants: 1, instruction: "카페 포스터", ...fields,
    });
    expect(parsed.success).toBe(true);
  });
});

const 판단 = (photos: Array<[EasyPhotoRole | "unclear", boolean]>, conflicting = false): RoleJudgment => ({
  photos: photos.map(([role, said]) => ({ role, said })),
  conflicting,
});

describe("말을 보낼까 (설계 §2-6 보내는 조건 셋)", () => {
  const 말 = "1번 제품은 그대로 두고 카페 포스터";

  it("말이 쓰임을 말했고 최종 역할과 맞으면 말 전체를 보낸다", () => {
    expect(easyAttachmentIntent({ words: `  ${말} `, judged: 판단([["preserve_product", true]]), final: ["preserve_product"] }))
      .toBe(말);
  });

  it("사진 이야기가 없는 말은 안 보낸다", () => {
    expect(easyAttachmentIntent({ words: "카페 포스터 만들어줘", judged: 판단([["style", false]]), final: ["style"] }))
      .toBe("");
  });

  it("고른 것이 말을 뒤집으면 안 보낸다", () => {
    expect(easyAttachmentIntent({ words: 말, judged: 판단([["preserve_product", true]]), final: ["style"] }))
      .toBe("");
  });

  it("말이 안 가리킨 사진을 고른 것은 뒤집기가 아니다", () => {
    expect(easyAttachmentIntent({
      words: 말, judged: 판단([["preserve_product", true], ["unclear", false]]), final: ["preserve_product", "style"],
    })).toBe(말);
  });

  it("말 안에서 엇갈리면 안 보낸다", () => {
    expect(easyAttachmentIntent({ words: 말, judged: 판단([["style", true]], true), final: ["style"] }))
      .toBe("");
  });
});

/**
 * **최종 프롬프트로 잰다**(설계 §2-6). 칸만 맞고 프롬프트에서 말이 역할을
 * 이기면 사고는 그대로다 — 생성 라우트가 하는 것과 같은 조립을 그대로 부른다.
 */
describe("최종 프롬프트", () => {
  const urls = { [A]: "https://x.test/a.png" };

  function 프롬프트(role: EasyPhotoRole, attachmentIntent: string): string {
    const fields = posterFieldsFrom([{ id: A, role }]);
    return buildPosterJob({
      projectId: "p",
      modelId: 기본모델,
      ratioId: "1:1",
      variants: 1,
      slots: EMPTY_SLOTS,
      attachments: restoreAttachments(fields, urls),
      referenceUrls: fields.referenceIds.map((id) => urls[id]!),
      preservedUrls: fields.preservedIds.map((id) => urls[id]!),
      attachmentIntent,
    }).prompt;
  }

  it("단추가 말을 뒤집으면 말이 없고 그 사진은 따라 만들기다", () => {
    const words = "1번 제품은 그대로";
    const intent = easyAttachmentIntent({ words, judged: 판단([["preserve_product", true]]), final: ["style"] });
    const prompt = 프롬프트("style", intent);

    expect(prompt).not.toContain("첨부한 그림에 대해");
    expect(prompt).toContain("Image 1 is a POSTER REFERENCE");
  });

  it("말과 역할이 맞으면 말이 가고 그 사진은 지킨다", () => {
    const words = "1번 제품은 그대로";
    const intent = easyAttachmentIntent({ words, judged: 판단([["preserve_product", true]]), final: ["preserve_product"] });
    const prompt = 프롬프트("preserve_product", intent);

    expect(prompt).toContain("첨부한 그림에 대해: 1번 제품은 그대로");
    expect(prompt).toContain("Image 1 is a PRESERVED SUBJECT");
  });

  it("그림체만 바꾸는 인물은 그림체 바꾸기를 막지 않는 문구로 간다", () => {
    expect(프롬프트("preserve_person_restyled", "")).toContain("Image 1 is a PRESERVED PERSON, REDRAWN");
  });
});
