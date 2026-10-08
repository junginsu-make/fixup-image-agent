import { describe, expect, it } from "vitest";
import { assetPath, validateDocument, type ServerDocument } from "../model";

/** 제품 원본(설계 2026-10-08 §4.6)은 참조 안의 `originalAssetId` 로 이어진다. 없는 그림을 가리키면 저장을 거절한다. */
const user = "11111111-1111-4111-8111-111111111111", id = "33333333-3333-4333-8333-333333333333";
const hash = (c: string) => c.repeat(64);
const asset = (c: string) => ({ path: assetPath(user, id, hash(c), "image/png"), sha256: hash(c), bytes: 10, mimeType: "image/png" as const });
const doc = (references: unknown[], assets: ServerDocument["assets"]): ServerDocument => ({
  schemaVersion: 3, id, title: "작업", stage: "input", sourceMode: "image", assets,
  body: { sections: [], inputs: { additionalInfo: "" }, settings: {}, references, blueprint: {}, editor: null },
} as ServerDocument);

describe("참조의 originalAssetId", () => {
  it("있는 그림을 가리키면 저장된다", () => {
    const d = doc([{ role: "product", assetId: "a", originalAssetId: "o", enabled: true }], { a: asset("a"), o: asset("b") });
    expect(() => validateDocument(d, user, id)).not.toThrow();
  });
  it("없는 그림을 가리키면 거절한다", () => {
    const d = doc([{ role: "product", assetId: "a", originalAssetId: "missing", enabled: true }], { a: asset("a") });
    expect(() => validateDocument(d, user, id)).toThrow("첨부 그림이 누락됐습니다.");
  });
});
