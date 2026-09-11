import { expect, it } from "vitest";
import { boundedJson } from "../request-body";
it("rejects oversized JSON without trusting Content-Length", async () => {
  await expect(boundedJson(new Request("https://example.invalid", { method: "POST", body: JSON.stringify({ text: "x".repeat(20) }) }), 10)).rejects.toThrow("request_too_large");
});
it("reads valid JSON and rejects invalid syntax", async () => {
  await expect(boundedJson(new Request("https://example.invalid", { method: "POST", body: '{"ok":true}' }))).resolves.toEqual({ ok: true });
  await expect(boundedJson(new Request("https://example.invalid", { method: "POST", body: '{broken' }))).rejects.toThrow("invalid_json");
});
