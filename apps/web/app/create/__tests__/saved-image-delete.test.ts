import { describe, expect, it } from "vitest";
import { deleteTargetFor } from "../saved-image-delete";

/**
 * 지우는 곳을 헷갈리면 **남의 것을 지우거나 아무것도 안 지운다.**
 * 목록이 세 통에서 오고 접두사까지 붙어 있어서 값으로 재 둔다.
 */

/**
 * 화면에는 둘 다 「레퍼런스」로 보인다. `referenceId` 가 유일한 구분이다.
 * 헷갈리면 지운다고 눌러도 아무 일이 안 일어난다.
 */
describe("디자인 레퍼런스 (referenceId 가 있는 것)", () => {
  it("전용 통으로 간다", () => {
    expect(deleteTargetFor({ id: "r1", origin: "reference", referenceId: "ref-9" })).toEqual({
      url: "/api/pdp/style-references",
      body: { id: "ref-9" },
    });
  });

  it("참고 이미지 통으로 안 간다", () => {
    expect(
      deleteTargetFor({ id: "r1", origin: "reference", referenceId: "ref-9" }).url,
    ).not.toContain("reference-images");
  });
});

describe("참고 이미지 (referenceId 가 없는 것)", () => {
  it("접두사를 떼고 경로에 싣는다", () => {
    expect(deleteTargetFor({ id: "lib-abc", origin: "reference" })).toEqual({
      url: "/api/reference-images/abc",
    });
  });

  it("경로에 싣는 곳은 몸통이 없다", () => {
    expect(deleteTargetFor({ id: "r1", origin: "reference" }).body).toBeUndefined();
  });
});

describe("작업물", () => {
  it("접두사를 떼고 몸통에 담는다", () => {
    expect(deleteTargetFor({ id: "lib-w7", origin: "library" })).toEqual({
      url: "/api/library",
      body: { id: "w7" },
    });
  });

  /** 접두사가 없는 것도 그대로 통한다. 목록이 어디서 오든 안 깨지게. */
  it("접두사가 없으면 그대로 쓴다", () => {
    expect(deleteTargetFor({ id: "w7", origin: "library" }).body).toEqual({ id: "w7" });
  });

  /** 작업물인데 참고 이미지 통으로 보내면 아무것도 안 지워진다. */
  it("작업물은 참고 이미지 통으로 안 간다", () => {
    expect(deleteTargetFor({ id: "lib-w7", origin: "library" }).url).not.toContain("reference-images");
  });
});

