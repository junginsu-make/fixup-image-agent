import { describe, expect, it } from "vitest";
import { originOf } from "../core";

/**
 * "AI 이미지" 표기를 누구에게 새길지 가르는 자리.
 *
 * 이 판단이 틀리면 두 가지 사고 중 하나가 난다 — AI 가 만든 그림에 표기가
 * 안 붙거나, 사용자가 찍은 사진에 사실이 아닌 표기가 지워지지 않게 새겨진다.
 */
describe("AI 결과인가 직접 올린 파일인가", () => {
  it("본문이 말해 주면 그 말을 따른다", () => {
    expect(originOf("ai", "create")).toBe("ai");
    expect(originOf("upload", "redesign")).toBe("upload");
  });

  it("말이 없으면 리디자인은 AI 결과다", () => {
    expect(originOf(undefined, "redesign")).toBe("ai");
  });

  it("말이 없는 create 는 사람이 고른 파일이다", () => {
    // 지금 이 길로 들어오는 create 는 라이브러리 화면의 직접 올리기뿐이다.
    // 상세페이지 결과를 여기로 저장하게 되면 origin: "ai" 를 적어 보낸다.
    expect(originOf(undefined, "create")).toBe("upload");
  });

  it("엉뚱한 값은 없는 것으로 본다", () => {
    expect(originOf("AI", "create")).toBe("upload");
    expect(originOf(1, "redesign")).toBe("ai");
    expect(originOf(null, "create")).toBe("upload");
  });
});
