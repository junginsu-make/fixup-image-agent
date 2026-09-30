import { describe, expect, it } from "vitest";
import { validateAttachments } from "@fixup/sns-core";
import { ProjectInputSchema } from "../../api/sns/projects/schema";
import { cardAttachmentsFrom, readChosenSlots, slotsFromWords, styleSlots } from "../cardnews-attachments";

const 나 = "u1";
const 사진 = (id: string, owner = 나) => ({ id, storagePath: `${owner}/references/${id}.png`, url: `https://x.test/${id}.png` });

describe("레퍼런스 자리 (2단계 설계 §5-2)", () => {
  it("한 장이면 세 자리 모두", () => {
    expect(styleSlots(["a"])).toEqual([{ id: "a", role: "cover" }, { id: "a", role: "body" }, { id: "a", role: "ending" }]);
  });

  it("두 장이면 첫 장 표지, 둘째 장 속지와 끝", () => {
    expect(styleSlots(["a", "b"])).toEqual([{ id: "a", role: "cover" }, { id: "b", role: "body" }, { id: "b", role: "ending" }]);
  });

  it("세 장 이상이면 첫 장 표지, 마지막 장 끝, 나머지 속지", () => {
    expect(styleSlots(["a", "b", "c", "d"])).toEqual([
      { id: "a", role: "cover" }, { id: "b", role: "body" }, { id: "c", role: "body" }, { id: "d", role: "ending" },
    ]);
  });

  it("정해 준 자리가 있으면 그대로, 없는 그림은 속지", () => {
    expect(styleSlots(["a", "b"], { b: "cover" })).toEqual([{ id: "a", role: "body" }, { id: "b", role: "cover" }]);
  });

  it("말로 정한 자리를 읽는다", () => {
    expect(slotsFromWords("2번이 표지고 3번은 마지막 장", ["a", "b", "c"])).toEqual({ b: "cover", c: "ending" });
    expect(slotsFromWords("표지는 알아서", ["a"])).toEqual({});
  });

  it("고른 자리는 목록 안 · 세 자리만 받는다", () => {
    expect(readChosenSlots([{ id: "a", role: "cover" }, { id: "z", role: "body" }, { id: "b", role: "top" }], ["a", "b"]))
      .toEqual({ a: "cover" });
  });
});

describe("역할 → 첨부", () => {
  it("분위기 한 장이 세 자리로 가고, 카드뉴스 검사와 입력 검사를 통과한다", () => {
    const result = cardAttachmentsFrom({ userId: 나, photos: [사진("a")], rows: [{ id: "a", role: "style" }] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachments.map((one) => one.role)).toEqual(["cover", "body", "ending"]);
    expect(validateAttachments(result.attachments, 16, 8)).toEqual([]);
    expect(ProjectInputSchema.safeParse({
      title: "t", source: { kind: "question", question: "q" }, attachments: result.attachments,
      ratio: "4:5", language: "ko",
    }).success).toBe(true);
  });

  it("역할마다 제 종류로 간다", () => {
    const result = cardAttachmentsFrom({
      userId: 나,
      photos: ["s", "p", "q", "r", "t", "e"].map((id) => 사진(id)),
      rows: [
        { id: "s", role: "style" }, { id: "p", role: "preserve_product" }, { id: "q", role: "preserve_person" },
        { id: "r", role: "preserve_person_restyled" }, { id: "t", role: "place_as_is" }, { id: "e", role: "ending" },
      ],
    });
    expect(result.ok && result.attachments.filter((one) => one.id !== "s")).toEqual([
      { id: "p", kind: "keep_identity", subject: "object", assetPath: "u1/references/p.png", url: "https://x.test/p.png" },
      { id: "q", kind: "keep_identity", subject: "person", assetPath: "u1/references/q.png", url: "https://x.test/q.png" },
      { id: "r", kind: "keep_identity", subject: "person", restyle: true, assetPath: "u1/references/r.png", url: "https://x.test/r.png" },
      { id: "t", kind: "place_as_is", assetPath: "u1/references/t.png", url: "https://x.test/t.png" },
      { id: "e", kind: "ending", assetPath: "u1/references/e.png", url: "https://x.test/e.png" },
    ]);
  });

  it("분위기 참고가 없으면 레퍼런스를 요청한다", () => {
    expect(cardAttachmentsFrom({ userId: 나, photos: [사진("p")], rows: [{ id: "p", role: "preserve_product" }] }))
      .toEqual({ ok: false, reason: "no_reference" });
  });

  it("남의 폴더 그림이면 멈춘다", () => {
    expect(cardAttachmentsFrom({ userId: 나, photos: [사진("a", "u2")], rows: [{ id: "a", role: "style" }] }))
      .toEqual({ ok: false, reason: "not_mine" });
  });

  it("주소가 없으면 멈춘다", () => {
    expect(cardAttachmentsFrom({ userId: 나, photos: [{ id: "a", storagePath: "u1/references/a.png", url: null }], rows: [{ id: "a", role: "style" }] }))
      .toEqual({ ok: false, reason: "no_url" });
  });
});
