import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  base64Bytes,
  planUploadBatches,
} from "./pdp.upload-budget";

describe("base64 크기 계산", () => {
  it("문자 수에서 실제 바이트를 추정한다", () => {
    // base64 는 3바이트를 4글자로 담는다.
    expect(base64Bytes("A".repeat(4))).toBe(3);
    expect(base64Bytes("A".repeat(400))).toBe(300);
  });

  it("빈 문자열은 0", () => {
    expect(base64Bytes("")).toBe(0);
  });
});

describe("업로드 묶음 나누기", () => {
  const img = (mb: number) => ({ base64: "A".repeat(Math.round((mb * 1024 * 1024 * 4) / 3)) });

  // 서버 여유 메모리가 445MB다. 한 요청이 100MB를 넘으면 JSON 파싱만으로
  // 프로세스가 죽을 수 있다. 죽으면 사용자는 원인을 알 수 없다.
  it("예산 안이면 한 묶음", () => {
    expect(planUploadBatches([img(3), img(3)])).toHaveLength(1);
  });

  it("예산을 넘으면 나눈다", () => {
    const batches = planUploadBatches([img(8), img(8), img(8), img(8)]);
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      const total = batch.reduce((sum, item) => sum + base64Bytes(item.base64), 0);
      expect(total).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    }
  });

  // 한 장이 예산보다 커도 버리면 안 된다. 혼자 한 묶음으로 보낸다.
  it("한 장이 예산을 넘어도 버리지 않는다", () => {
    const batches = planUploadBatches([img(30)]);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(1);
  });

  it("장수와 순서를 잃지 않는다", () => {
    const items = [img(8), img(8), img(8), img(8), img(8)];
    expect(planUploadBatches(items).flat()).toHaveLength(items.length);
  });

  it("빈 목록은 묶음도 없다", () => {
    expect(planUploadBatches([])).toEqual([]);
  });

  it("예산은 서버 여유 메모리보다 훨씬 작다", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(50 * 1024 * 1024);
  });
});
