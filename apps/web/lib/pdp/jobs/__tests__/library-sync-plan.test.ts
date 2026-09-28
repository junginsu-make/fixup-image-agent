import { describe, expect, it } from "vitest";
import {
  artifactTag,
  libraryFileKey,
  parseLibraryFileKey,
  planItemSync,
  sectionKey,
} from "../library-sync-plan";

/**
 * **상세페이지 결과를 서버가 라이브러리 작업 하나에 맞춘다**(2026-09-28 사용자 결정).
 *
 * 두 번의 독립 리뷰가 정한 규칙:
 *   - **서버는 라이브러리에서 아무것도 지우지 않는다**(1차 HIGH-1 — 구성을 다시 짜면
 *     끝낸 페이지가 지워졌다)
 *   - **작업 하나 = 페이지 한 판**(2차 MEDIUM-1). 작업에 지금 페이지에 없는 섹션이
 *     있으면(섹션을 지웠다) 그 작업에는 손대지 않고 **새 작업**을 만든다
 *   - 순서를 바꾸면 **자리만 옮긴다**(파일은 안 지운다)
 *   - 되살려 넣은 옛 작업(표시 없음)은 장수가 같을 때만 자리대로 이어 쓴다. 다르면
 *     새 작업(2차 HIGH-B — 영원히 못 맞추고 멈췄다)
 */
describe("파일 이름에 섹션과 그림을 새긴다", () => {
  it("이름에서 섹션·그림 표시를 도로 읽는다 — 끝의 무작위 조각은 무시한다", () => {
    const key = libraryFileKey(sectionKey("sec-1"), artifactTag(Buffer.from("art")));
    expect(parseLibraryFileKey(`u/item/3-${key}-x7k2.webp`)).toEqual({ section: sectionKey("sec-1"), artifact: artifactTag(Buffer.from("art")) });
    expect(parseLibraryFileKey(`u/item/3-${key}.thumb.webp`)).toBeNull();
  });

  it("**지문은 바이트로 짓는다** — 화면(sha1 앞 8자리)과 같은 규칙", () => {
    expect(artifactTag(Buffer.from("abc"))).toBe("a9993e36");
  });

  it("옛 이름은 모른다", () => {
    expect(parseLibraryFileKey("u/item/3.webp")).toBeNull();
    expect(parseLibraryFileKey("u/item/3-1a2b3c4d.webp")).toBeNull();
    expect(parseLibraryFileKey("u/item/3-1a2b3c4d-5e6f7a8b.webp")).toBeNull();
  });
});

describe("작업 하나를 어떻게 맞출까", () => {
  const want = (...sections: string[]) => sections.map((section) => ({ section, artifact: `${section}-art` as string | null }));
  const rows = (...pairs: Array<[number, string | null, string?]>) =>
    pairs.map(([position, section, artifact]) => ({ position, key: section ? { section, artifact: artifact ?? `${section}-art` } : null }));

  it("빈 작업이면 전부 붙인다", () => {
    expect(planItemSync([], want("a", "b"))).toEqual({ compatible: true, replace: [], append: [0, 1], reorder: false });
  });

  it("**다시 만든 섹션의 자리만 바꾼다**", () => {
    expect(planItemSync(rows([0, "a"], [1, "b", "old"], [2, "c"]), want("a", "b", "c"))).toEqual({
      compatible: true, replace: [{ position: 1, index: 1 }], append: [], reorder: false,
    });
  });

  it("**섹션을 지웠으면 이 작업은 맞지 않는다** — 새 작업을 만든다, 이 작업은 그대로", () => {
    expect(planItemSync(rows([0, "a"], [1, "b"], [2, "c"]), want("a", "c")).compatible).toBe(false);
  });

  it("**구성을 다시 짜면 맞지 않는다** — 새 작업", () => {
    expect(planItemSync(rows([0, "a"], [1, "b"]), want("n1")).compatible).toBe(false);
  });

  it("새 섹션을 더했으면 붙이고, 가운데에 넣었으면 자리를 옮긴다", () => {
    expect(planItemSync(rows([0, "a"], [1, "c"]), want("a", "b", "c"))).toEqual({ compatible: true, replace: [], append: [1], reorder: true });
    expect(planItemSync(rows([0, "a"], [1, "b"]), want("a", "b", "c"))).toEqual({ compatible: true, replace: [], append: [2], reorder: false });
  });

  it("**순서를 바꾸면 자리만 옮긴다** — 지우지도 새로 만들지도 않는다", () => {
    expect(planItemSync(rows([0, "a"], [1, "b"]), want("b", "a"))).toEqual({ compatible: true, replace: [], append: [], reorder: true });
  });

  it("같으면 아무것도 안 한다", () => {
    expect(planItemSync(rows([0, "a"], [1, "b"]), want("a", "b"))).toEqual({ compatible: true, replace: [], append: [], reorder: false });
  });

  it("되살려 넣은 옛 작업(표시 없음)은 장수가 같으면 자리대로 바꿔 표시를 붙인다", () => {
    expect(planItemSync(rows([0, null], [1, null]), want("a", "b"))).toEqual({
      compatible: true, replace: [{ position: 0, index: 0 }, { position: 1, index: 1 }], append: [], reorder: false,
    });
  });

  it("**옛 작업인데 장수가 다르면 맞지 않는다** — 새 작업(리뷰 HIGH-B: 영원히 멈췄다)", () => {
    expect(planItemSync(rows([0, null], [1, null]), want("a", "b", "c")).compatible).toBe(false);
  });

  it("옛 작업을 바꾸다 일부만 된 작업도 자리대로 이어서 바꾼다(리뷰 MEDIUM-3)", () => {
    expect(planItemSync(rows([0, "a"], [1, null], [2, "c"]), want("a", "b", "c"))).toEqual({
      compatible: true, replace: [{ position: 1, index: 1 }], append: [], reorder: false,
    });
  });

  it("섞인 작업인데 자리가 안 맞으면 맞지 않는다", () => {
    expect(planItemSync(rows([0, "b"], [1, null]), want("a", "b")).compatible).toBe(false);
  });

  it("**그림을 모르는 섹션(화면이 올렸던 것)은 작업에 있으면 그대로 둔다** — 새 작업을 만들지 않는다", () => {
    const page = [{ section: "a", artifact: "a-art" }, { section: "b", artifact: null }];
    expect(planItemSync(rows([0, "a"], [1, "b", "screen"]), page)).toEqual({ compatible: true, replace: [], append: [], reorder: false });
  });

  it("그림을 모르는 섹션은 붙이지 않고, 차례는 있는 것끼리 맞춘다", () => {
    const page = [{ section: "a", artifact: null }, { section: "b", artifact: "b-art" }, { section: "c", artifact: "c-art" }];
    expect(planItemSync(rows([0, "c"]), page)).toEqual({ compatible: true, replace: [], append: [1], reorder: true });
  });
});
