import { describe, expect, it } from "vitest";
import { groupAttachments, validateAttachments } from "../attachments";
import type { Attachment, AttachmentKind } from "../attachments";

const item = (kind: AttachmentKind, patch: Partial<Attachment> = {}): Attachment => ({
  id: Math.random().toString(36).slice(2),
  kind, assetPath: "p", url: "u", ...patch,
});

describe("첨부 분류", () => {
  it("네 종류로 나눈다", () => {
    const grouped = groupAttachments([
      item("keep_identity"),
      item("place_as_is"),
      item("style_reference", { role: "cover" }),
      item("ending"),
    ]);
    expect(grouped.keepIdentity).toHaveLength(1);
    expect(grouped.placeAsIs).toHaveLength(1);
    expect(grouped.styleReferences).toHaveLength(1);
    expect(grouped.ending).toBeDefined();
  });

  it("따라 만들 카드뉴스만 역할을 갖는다", () => {
    const grouped = groupAttachments([
      item("style_reference", { role: "cover" }),
      item("style_reference", { role: "body" }),
      item("style_reference", { role: "body" }),
    ]);
    expect(grouped.styleByRole.cover).toHaveLength(1);
    expect(grouped.styleByRole.body).toHaveLength(2);
    expect(grouped.styleByRole.ending).toHaveLength(0);
  });

  it("원본 그대로 쓸 장은 사람 지정 자리와 입력 순서를 보존한다", () => {
    const grouped = groupAttachments([
      item("place_as_is", { id: "p1", bodySlot: 4 }),
      item("style_reference", { role: "cover" }),
      item("place_as_is", { id: "p2" }),
    ]);
    expect(grouped.placeAsIs.map((entry) => entry.id)).toEqual(["p1", "p2"]);
    expect(grouped.placeAsIs[0]!.bodySlot).toBe(4);
    expect(grouped.placeAsIs[1]!.bodySlot).toBeUndefined();
  });
});

describe("첨부 검증", () => {
  it("여덟 장을 넘으면 막는다", () => {
    const nine = Array.from({ length: 9 }, () => item("style_reference", { role: "body" }));
    expect(validateAttachments(nine, 8).join("\n")).toContain("첨부 이미지는 8장까지");
  });

  it("따라 만들 카드뉴스가 하나도 없으면 막는다", () => {
    // 이 시스템의 본체다. 없으면 무엇을 닮게 만들지가 없다.
    expect(validateAttachments([item("keep_identity")], 8).join("\n")).toContain("따라 만들 카드뉴스");
  });

  it("표지 역할이 둘이면 막는다", () => {
    const two = [
      item("style_reference", { role: "cover" }),
      item("style_reference", { role: "cover" }),
    ];
    expect(validateAttachments(two, 8).join("\n")).toContain("표지");
  });

  it("마지막 장이 둘이면 막는다", () => {
    expect(validateAttachments([item("ending"), item("ending"), item("style_reference", { role: "cover" })], 8).join("\n"))
      .toContain("마지막 장");
  });

  it("인물을 그대로 넣을 것이 둘이면 막는다", () => {
    // 얼굴이 둘이면 모델이 절충해 제3의 인물을 만든다. 2026-07-30 결정.
    const two = [
      item("keep_identity", { subject: "person" }),
      item("keep_identity", { subject: "person" }),
      item("style_reference", { role: "cover" }),
    ];
    expect(validateAttachments(two, 8).join("\n")).toContain("인물");
  });

  it("원본 그대로 쓸 장의 지정 자리가 겹치면 알린다", () => {
    const list = [
      item("place_as_is", { bodySlot: 2 }),
      item("place_as_is", { bodySlot: 2 }),
      item("style_reference", { role: "cover" }),
    ];
    expect(validateAttachments(list, 8, 6).join("\n")).toContain("겹칩니다");
  });

  it("원본 그대로 쓸 장이 속지 구간을 벗어나면 알린다", () => {
    const list = [
      item("place_as_is", { bodySlot: 6 }),
      item("style_reference", { role: "cover" }),
    ];
    expect(validateAttachments(list, 8, 6).join("\n")).toContain("2~5");
  });

  it("원본 그대로 쓸 장이 속지 자리보다 많으면 장수와 자리 수를 알린다", () => {
    const list = [
      ...Array.from({ length: 6 }, () => item("place_as_is")),
      item("style_reference", { role: "cover" }),
    ];
    const message = validateAttachments(list, 8, 4).join("\n");
    expect(message).toContain("6장");
    expect(message).toContain("2자리");
  });

  it("문제가 없으면 빈 배열", () => {
    expect(validateAttachments([item("style_reference", { role: "cover" })], 8)).toEqual([]);
  });
});

/**
 * 캐릭터는 **한 벌**이다.
 *
 * 각도를 쓰려고 넷을 만들어 놓고, 붙이는 순간 「인물이 넷」으로 막히면 캐릭터를
 * 만든 뜻이 사라진다(2026-09-15 사용자 보고). 장이 아니라 사람을 센다.
 */
describe("캐릭터 여러 각도", () => {
  const 따라만들그림 = item("style_reference", { role: "cover" });
  const 각도 = (characterId: string) =>
    item("keep_identity", { subject: "person", characterId });

  it("같은 캐릭터 네 각도는 막지 않는다", () => {
    const issues = validateAttachments(
      [따라만들그림, 각도("tiger"), 각도("tiger"), 각도("tiger"), 각도("tiger")],
      10,
    );
    expect(issues).not.toContain("그대로 넣을 인물은 한 명만 지정해 주세요. 둘이면 얼굴이 섞입니다.");
  });

  it("다른 캐릭터가 섞이면 막는다 — 얼굴이 둘이다", () => {
    const issues = validateAttachments([따라만들그림, 각도("tiger"), 각도("dog")], 10);
    expect(issues).toContain("그대로 넣을 인물은 한 명만 지정해 주세요. 둘이면 얼굴이 섞입니다.");
  });

  /** 캐릭터에서 오지 않은 낱장 사진은 지금까지처럼 각각 한 사람이다. */
  it("캐릭터가 아닌 인물 사진 둘은 여전히 막는다", () => {
    const issues = validateAttachments(
      [따라만들그림, item("keep_identity", { subject: "person" }), item("keep_identity", { subject: "person" })],
      10,
    );
    expect(issues).toContain("그대로 넣을 인물은 한 명만 지정해 주세요. 둘이면 얼굴이 섞입니다.");
  });

  it("캐릭터 한 벌에 낱장 사진이 끼면 막는다", () => {
    const issues = validateAttachments(
      [따라만들그림, 각도("tiger"), 각도("tiger"), item("keep_identity", { subject: "person" })],
      10,
    );
    expect(issues).toContain("그대로 넣을 인물은 한 명만 지정해 주세요. 둘이면 얼굴이 섞입니다.");
  });

  it("물건은 캐릭터가 붙어도 세지 않는다", () => {
    const issues = validateAttachments(
      [따라만들그림, item("keep_identity", { subject: "object", characterId: "tiger" }), 각도("dog")],
      10,
    );
    expect(issues).not.toContain("그대로 넣을 인물은 한 명만 지정해 주세요. 둘이면 얼굴이 섞입니다.");
  });
});
