import { describe, expect, it } from "vitest";
import { SnsProviderConfigurationError, requireSnsProviderKeys } from "../sns/providers";

describe("제공자 설정", () => {
  it("기획 키가 없으면 빠진 환경변수 이름을 사람이 읽는 문구로 알린다", () => {
    expect(() => requireSnsProviderKeys("planning", {})).toThrowError(SnsProviderConfigurationError);
    expect(() => requireSnsProviderKeys("planning", {})).toThrow(/ANTHROPIC_API_KEY.*OPENAI_API_KEY/);
  });

  it("생성 키가 없으면 FAL_KEY를 따로 알린다", () => {
    expect(() => requireSnsProviderKeys("generation", {
      ANTHROPIC_API_KEY: "a",
      OPENAI_API_KEY: "o",
    })).toThrow(/FAL_KEY/);
  });
});
