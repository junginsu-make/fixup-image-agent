import { describe, expect, it } from "vitest";
import { attachmentsForUploaded } from "../uploaded-attachments";

function row(id: string, extra: { signedUrl?: string | null } = {}) {
  return {
    id,
    userId: "u1",
    storagePath: `u1/references/${id}.png`,
    title: id,
    purpose: "cardnews" as const,
    width: null,
    height: null,
    createdAt: "2026-09-03T05:36:51.027Z",
    // ?? 를 쓰면 일부러 넘긴 null 이 기본값으로 되살아난다.
    signedUrl: "signedUrl" in extra ? extra.signedUrl! : `https://example.test/${id}`,
  };
}

describe("올린 그림을 이 작업에 붙인다", () => {
  it("방금 올린 그림이 붙을 줄로 나온다", () => {
    // 이게 없어서 올리기가 안 되는 것처럼 보였다. 라이브러리에는 들어갔는데
    // 화면에는 붙인 그림만 나오니 아무 변화가 없었다.
    const added = attachmentsForUploaded(["a"], [row("a")], []);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id: "a",
      kind: "style_reference",
      role: "body",
      assetPath: "u1/references/a.png",
      url: "https://example.test/a",
    });
  });

  it("여러 장을 한 번에 올려도 다 붙는다", () => {
    expect(attachmentsForUploaded(["a", "b"], [row("a"), row("b")], [])).toHaveLength(2);
  });

  it("이미 붙어 있으면 두 번 붙이지 않는다", () => {
    const already = attachmentsForUploaded(["a"], [row("a")], []);
    expect(attachmentsForUploaded(["a"], [row("a")], already)).toEqual([]);
  });

  it("목록에 없는 것은 건너뛴다", () => {
    // 다시 읽기가 실패했으면 붙일 경로가 없다. 빈 경로로 붙이면 미리보기가
    // 깨진 채 남는다.
    expect(attachmentsForUploaded(["a"], [], [])).toEqual([]);
  });

  it("서명 주소가 없으면 빈 문자열로 둔다", () => {
    // 로컬 모드는 서명 주소가 없다. 목록을 다시 부를 때 채워진다.
    expect(attachmentsForUploaded(["a"], [row("a", { signedUrl: null })], [])[0]?.url).toBe("");
  });
});
