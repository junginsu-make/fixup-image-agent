import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

/**
 * **쓸 수 없는 첨부가 있으면 예약 전에 멈춘다**(2026-09-28 독립 리뷰).
 *
 * 첨부 주소는 작업 주인 폴더 것만 서명된다(`refreshProjectAssetUrls`). 그 밖의
 * 첨부(관리자 복사본에 남은 회원 폴더 첨부)는 주소가 비어 온다. 그대로 만들기를
 * 누르면 크레딧을 예약한 뒤 첨부 올리기에서 영어 원문 「Failed to parse URL」로
 * 넘어졌다. 돈은 안 나가지만 무엇을 해야 하는지 알 수 없다.
 */

vi.mock("server-only", () => ({}));

const { hasUnusableAttachment } = await import("../sns/runtime");

const project = (urls: string[]) => ({
  data: { attachments: urls.map((url, index) => ({ id: `a${index}`, kind: "style_reference", assetPath: `u/references/a${index}.png`, url })) },
}) as never;

describe("hasUnusableAttachment", () => {
  it("주소가 빈 첨부가 하나라도 있으면 참", () => {
    expect(hasUnusableAttachment(project(["signed:x", ""]))).toBe(true);
  });

  it("모두 주소가 있으면 거짓", () => {
    expect(hasUnusableAttachment(project(["signed:x", "signed:y"]))).toBe(false);
  });

  it("첨부가 없으면 거짓", () => {
    expect(hasUnusableAttachment(project([]))).toBe(false);
  });
});

describe("만들기 두 길 모두 예약 전에 확인한다", () => {
  const routes = [
    "../../app/api/sns/projects/[id]/generate/route.ts",
    "../../app/api/sns/projects/[id]/cards/[index]/route.ts",
  ];
  for (const path of routes) {
    it(path.replace("../../app/api/sns/projects/", ""), () => {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      const check = source.indexOf("hasUnusableAttachment(project)");
      const reserve = source.indexOf("reserveAiUsage(request");
      expect(check).toBeGreaterThan(-1);
      expect(reserve).toBeGreaterThan(-1);
      // 예약보다 앞이어야 한다. 뒤면 예약하고 풀어 주는 헛걸음이 남는다.
      expect(check).toBeLessThan(reserve);
    });
  }
});
