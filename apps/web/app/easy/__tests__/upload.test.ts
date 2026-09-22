import { describe, expect, it } from "vitest";
import { ReferencePurposeSchema } from "../../api/reference-sets/schema";
import { attachmentFromUpload, easyUploadForm } from "../upload";

/**
 * 「직접 첨부」가 처음 만들 때부터 막혀 있었다 (2026-09-22 사용자 신고).
 *
 * 화면이 `purpose=style` 을 보냈는데 서버는 `cardnews·poster·both` 만 받는다.
 * 올리자마자 zod 오류가 그대로 떴다. 목록도 같은 이름으로 읽으므로 **서버의
 * 스키마로 직접** 확인한다 — 값을 여기 베껴 적으면 또 갈린다.
 */
describe("쉬운 모드 직접 첨부", () => {
  const file = new File([new Uint8Array([1, 2, 3])], "상품.png", { type: "image/png" });

  it("서버가 받는 용도로 보낸다", () => {
    const form = easyUploadForm(file, "abc-123");
    expect(() => ReferencePurposeSchema.parse(form.get("purpose"))).not.toThrow();
    expect(form.get("purpose")).toBe("both"); // 카드뉴스·포스터 어디에도 쓴다
    expect(form.get("id")).toBe("abc-123");
    expect(form.get("title")).toBe("상품.png");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("미리보기 주소는 서버가 실제로 주는 칸에서 읽는다 — `url` 칸은 없다", () => {
    const local = attachmentFromUpload({ id: "abc-123", title: "상품", signedUrl: "/api/reference-images/abc-123/file" }, file, () => "blob:x");
    expect(local).toEqual({ id: "abc-123", url: "/api/reference-images/abc-123/file", title: "상품" });
  });

  it("운영은 올린 직후 서명 주소가 비어 온다 — 고른 파일로 미리보기를 만든다", () => {
    const prod = attachmentFromUpload({ id: "abc-123", title: null, signedUrl: null }, file, () => "blob:preview");
    expect(prod).toEqual({ id: "abc-123", url: "blob:preview", title: "상품.png" });
  });
});
