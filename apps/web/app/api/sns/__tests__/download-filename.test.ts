import { describe, expect, it } from "vitest";
import { snsCardFilename } from "../../../sns/download-filename";

describe("카드뉴스 다운로드 파일명", () => {
  it("로컬 PNG 결과의 실제 확장자를 유지한다", () => {
    expect(snsCardFilename("실제 검증", 4, "user/sns/project/4.png")).toBe("실제 검증-04.png");
  });

  it("경로가 없으면 기존 JPG 기본값을 쓴다", () => {
    expect(snsCardFilename("실제 검증", 1)).toBe("실제 검증-01.jpg");
  });
});
