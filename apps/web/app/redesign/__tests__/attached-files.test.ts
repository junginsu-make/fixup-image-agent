import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { attachedFileKey, mergeAttachedFiles, removeAttachedFile } from "../attached-files";

/**
 * **첨부는 쌓인다**(2026-09-23 사용자: 「리디자인 이미지 첨부부터 문제가 많다」).
 *
 * 실제 브라우저로 확인한 것: a·b 두 장을 올린 뒤 c 한 장을 더 올리면 a·b 가
 * 사라지고 c 만 남았다. 긴 상세페이지를 조각으로 나눠 올리는 것이 이 도구의
 * 정상 사용인데, 나눠 고르면 마지막 것만 남았다.
 */
const 파일 = (name: string, type = "image/png", size = 10, lastModified = 1) =>
  new File([new Uint8Array(size)], name, { type, lastModified });

describe("첨부를 더한다", () => {
  it("**더 고르면 뒤에 붙는다** — 앞에 고른 것이 사라지지 않는다", () => {
    const merged = mergeAttachedFiles([파일("a.png"), 파일("b.png")], [파일("c.png")]);
    expect(merged.map((file) => file.name)).toEqual(["a.png", "b.png", "c.png"]);
  });

  it("같은 파일을 또 고르면 한 번만 둔다", () => {
    const merged = mergeAttachedFiles([파일("a.png")], [파일("a.png")]);
    expect(merged).toHaveLength(1);
  });

  it("이름이 같아도 다른 파일이면 둘 다 둔다 — 라이브러리에서 고른 것은 이름이 겹칠 수 있다", () => {
    const merged = mergeAttachedFiles([파일("image.png", "image/png", 10)], [파일("image.png", "image/png", 20)]);
    expect(merged).toHaveLength(2);
    expect(attachedFileKey(merged[0]!)).not.toBe(attachedFileKey(merged[1]!));
  });

  it("그림·PDF 가 아닌 것은 받지 않는다", () => {
    const merged = mergeAttachedFiles([], [파일("memo.txt", "text/plain"), 파일("page.pdf", "application/pdf")]);
    expect(merged.map((file) => file.name)).toEqual(["page.pdf"]);
  });

  /*
    **보낼 수 없는 것은 목록에 넣지 않는다**(독립 리뷰). 종류가 빈 파일은
    보낼 때(`normalizeFilesForUpload`) 빠진다 — 목록에 보이는데 안 쓰이면
    사용자는 반영된 줄 안다.
  */
  it("종류 표시가 빈 그림 파일은 받지 않는다 — 보낼 때 빠지는 파일이다", () => {
    const merged = mergeAttachedFiles([], [파일("scan.heic", ""), 파일("doc.pdf", "")]);
    expect(merged.map((file) => file.name)).toEqual(["doc.pdf"]);
  });
});

describe("한 장씩 뺀다", () => {
  it("고른 것만 빠진다", () => {
    const list = [파일("a.png"), 파일("b.png"), 파일("c.png")];
    expect(removeAttachedFile(list, attachedFileKey(list[1]!)).map((file) => file.name)).toEqual(["a.png", "c.png"]);
  });
});

describe("화면이 이 규칙을 쓴다", () => {
  const panels = readFileSync(new URL("../redesign-panels.tsx", import.meta.url), "utf8");

  it("**끌어 놓기·파일 고르기·라이브러리 고르기 셋 다 더한다** — 갈아 끼우지 않는다", () => {
    expect(panels.match(/setFiles\(mergeAttachedFiles\(files,/g)).toHaveLength(3);
    expect(panels).not.toContain("setFiles(Array.from(");
  });

  it("한 장씩 뺄 수 있는 목록을 그린다", () => {
    expect(panels).toContain("onRemove={(key) => setFiles(removeAttachedFile(files, key))}");
  });
});
