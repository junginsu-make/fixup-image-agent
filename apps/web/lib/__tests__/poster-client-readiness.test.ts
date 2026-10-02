import { afterEach, expect, it, vi } from "vitest";
import { createPosterPlanningProviders, createPosterAttachmentReader } from "../poster/providers";
afterEach(() => vi.unstubAllEnvs());
it("an Anthropic planner does not construct an absent optional OpenAI backup", () => {
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_ADMIN_KEY", "");
  expect(() => createPosterPlanningProviders({ ANTHROPIC_API_KEY: "fixture" })).not.toThrow();
  expect(createPosterPlanningProviders({ ANTHROPIC_API_KEY: "fixture" }).backup).toBeUndefined();
});
it("an Anthropic-only attachment reader also works without the unrelated OpenAI key", () => {
  vi.stubEnv("OPENAI_API_KEY", ""); vi.stubEnv("OPENAI_ADMIN_KEY", "");
  expect(() => createPosterAttachmentReader({ ANTHROPIC_API_KEY: "fixture" })).not.toThrow();
});
