import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { hasDuplicateSections, libraryConfirmFromBody, librarySyncFromBody } from "../library-sync-request";

/**
 * 요청에서 **라이브러리 맞추기에 쓸 값**만 골라낸다.
 *
 * 화면이 보낸 것을 그대로 믿지 않는다 — 문서 id 는 uuid 여야 하고(`source_id`
 * 칸이 uuid 다, [[mocked-db-hid-uuid-column-type]]), 차례·이름은 길이를 묶고,
 * 과정은 `workProcessOf` 를 거치고, 그림은 바이트를 본다.
 */
const DOC = "40c82a0c-97d0-4aae-868d-f667883edb10";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest")]).toString("base64");

describe("라이브러리 맞추기에 쓸 값", () => {
  it("**문서 id 가 없으면 맞추지 않는다** — 묶을 열쇠가 없다", () => {
    expect(librarySyncFromBody("u", { pageSectionIds: ["a"] })).toBeNull();
  });

  it("**문서 id 가 uuid 가 아니면 맞추지 않는다** — 칸이 uuid 라 등록이 실패한다", () => {
    expect(librarySyncFromBody("u", { documentId: "draft-1", pageSectionIds: ["a"] })).toBeNull();
  });

  it("**페이지 차례가 없으면 맞추지 않는다** — 지운 섹션까지 섞였다(3차 리뷰 MEDIUM)", () => {
    expect(librarySyncFromBody("u", { documentId: DOC })).toBeNull();
    expect(librarySyncFromBody("u", { documentId: DOC, pageSectionIds: [] })).toBeNull();
    expect(librarySyncFromBody("u", { documentId: DOC, pageSectionIds: ["a", 3] })).toBeNull();
  });

  it("차례·이름을 싣는다", () => {
    expect(librarySyncFromBody("u", { documentId: DOC, pageSectionIds: ["a", "b"], libraryTitle: "물 단백질" })).toMatchObject({
      userId: "u",
      documentId: DOC,
      pageSectionIds: ["a", "b"],
      title: "물 단백질",
    });
  });

  it("**같은 섹션 id 가 두 번 오면 맞추지 않는다** — 두 섹션이 한 자리를 나눠 써 한 장이 빠졌다(4차 리뷰 LOW)", () => {
    expect(librarySyncFromBody("u", { documentId: DOC, pageSectionIds: ["a", "a", "b"] })).toBeNull();
    expect(hasDuplicateSections({ pageSectionIds: ["a", "a"] })).toBe(true);
    expect(hasDuplicateSections({ pageSectionIds: ["a", "b"] })).toBe(false);
  });

  it("이름은 200자에서 자른다", () => {
    expect(librarySyncFromBody("u", { documentId: DOC, pageSectionIds: ["a"], libraryTitle: "가".repeat(500) })?.title).toHaveLength(200);
  });

  it("과정은 **걸러진 것만** 싣는다 — 이미지 같은 큰 값이 끼어들지 않는다", () => {
    const sync = librarySyncFromBody("u", {
      documentId: DOC,
      pageSectionIds: ["a"],
      libraryProcess: { blueprint: { executiveSummary: "요약", sections: [{ title: "히어로" }], huge: "x".repeat(10) }, aspectRatio: "3:4" },
    });
    expect(JSON.stringify(sync?.process)).not.toContain("huge");
    expect(JSON.stringify(sync?.process)).toContain("히어로");
  });
});

describe("확인 문 — 지문과 화면이 보낸 한 장", () => {
  const base = { documentId: DOC, pageSectionIds: ["a", "b"], pageSectionHashes: ["1a2b3c4d", null] };
  const supplied = { sectionId: "b", mimeType: "image/png", base64: PNG };

  it("**화면의 지문을 싣는다**", () => {
    expect(libraryConfirmFromBody("u", base)?.pageHashes).toEqual(["1a2b3c4d", null]);
  });

  it("**보낸 그림이 화면이 말한 지문과 다르면 거절한다** — 옛 그림으로 되돌리지 않는다(4차 리뷰 MEDIUM)", () => {
    const claimed = createHash("sha1").update(Buffer.from(PNG, "base64")).digest("hex").slice(0, 8);
    const body = (hash: string) => ({ documentId: DOC, pageSectionIds: ["a", "b"], pageSectionHashes: [null, hash], supplied });
    expect(libraryConfirmFromBody("u", body(claimed))?.images).toHaveLength(1);
    expect(libraryConfirmFromBody("u", body("00000000"))).toBeNull();
  });

  it.each([
    ["지문이 없음", undefined],
    ["지문 수가 다름", ["1a2b3c4d"]],
    ["지문 형식이 틀림", ["xyz", null]],
  ])("**%s이면 거절한다** — 무엇이 화면과 같은지 모른다", (_label, hashes) => {
    expect(libraryConfirmFromBody("u", { ...base, pageSectionHashes: hashes })).toBeNull();
  });

  it("**페이지에 있는 섹션의 그림을 싣는다** — 형식은 바이트로 정한다", () => {
    expect(libraryConfirmFromBody("u", { ...base, supplied: { ...supplied, mimeType: "image/webp" } })?.images).toEqual([
      { sectionId: "b", image: { base64: PNG, mimeType: "image/png" } },
    ]);
  });

  it.each([
    ["페이지에 없는 섹션", { ...supplied, sectionId: "x" }],
    ["base64 가 아닌 값", { ...supplied, base64: "<script>" }],
    ["그림이 아닌 바이트", { ...supplied, base64: Buffer.from("<html>hello</html>").toString("base64") }],
    ["너무 큰 그림", { ...supplied, base64: "A".repeat(12_000_004) }],
    ["빈 그림", { ...supplied, base64: "" }],
  ])("**%s는 거절한다** — 조용히 버리면 화면이 넣은 줄 안다", (_label, bad) => {
    expect(libraryConfirmFromBody("u", { ...base, supplied: bad })).toBeNull();
  });
});
