import { describe, expect, it } from "vitest";
import { mergeDocumentJobs } from "../merge-document-jobs";
import type { JobRecord } from "../repository";

/**
 * **되찾기는 문서의 작업 전부에서 섹션마다 가장 최근 그림을 모은다**(독립 리뷰 HIGH-3).
 *
 * 전에는 **가장 최근 작업 하나**만 봤다. 한 장 다시 만들기가 작업을 남기기 시작하자
 * (2026-09-28), 일괄 생성의 두 번째 묶음 응답을 놓친 뒤 한 장만 다시 만들면 그 한 장짜리
 * 작업이 「가장 최근」이 되어 **나머지 섹션을 되찾지 못했다** — 값을 또 낸다.
 */
const job = (id: string, createdAt: string, items: JobRecord["items"], sectionIds = items.map((item) => item.sectionId)) =>
  ({ id, createdAt, updatedAt: createdAt, items, sectionIds, userId: "u", teamId: null, documentId: "d", revision: 0, operation: "pdp_image", reservationRequestId: id } as unknown as JobRecord);

describe("문서 작업 합치기", () => {
  it("**한 장짜리 최근 작업이 앞선 묶음을 가리지 않는다**", () => {
    const merged = mergeDocumentJobs([
      job("batch2", "2026-09-28T01:05:00Z", [
        { sectionId: "s5", attempt: 1, outputPath: "p5" },
        { sectionId: "s6", attempt: 1, outputPath: "p6" },
      ]),
      job("single", "2026-09-28T01:10:00Z", [{ sectionId: "s5", attempt: 1, outputPath: "p5-new" }]),
    ]);
    expect(merged?.id).toBe("single");
    expect(merged?.items.map((item) => [item.sectionId, item.outputPath])).toEqual([["s5", "p5-new"], ["s6", "p6"]]);
  });

  it("**실패한 최근 작업이 앞선 그림을 가리지 않는다**", () => {
    const merged = mergeDocumentJobs([
      job("batch", "2026-09-28T01:00:00Z", [{ sectionId: "s1", attempt: 1, outputPath: "p1" }]),
      job("failed", "2026-09-28T01:10:00Z", [{ sectionId: "s1", attempt: 1, errorCode: "AI_PROVIDER_UNAVAILABLE" }]),
    ]);
    expect(merged?.items).toEqual([{ sectionId: "s1", attempt: 1, outputPath: "p1" }]);
  });

  it("그림이 한 번도 없던 섹션은 가장 최근의 실패 까닭을 남긴다", () => {
    const merged = mergeDocumentJobs([
      job("a", "2026-09-28T01:00:00Z", [{ sectionId: "s1", attempt: 1, errorCode: "old" }]),
      job("b", "2026-09-28T01:10:00Z", [{ sectionId: "s1", attempt: 1, errorCode: "new" }]),
    ]);
    expect(merged?.items).toEqual([{ sectionId: "s1", attempt: 1, errorCode: "new" }]);
  });

  it("같은 작업 안에서는 마지막 시도를 쓴다", () => {
    const merged = mergeDocumentJobs([
      job("a", "t", [{ sectionId: "s1", attempt: 1, outputPath: "first" }, { sectionId: "s1", attempt: 2, outputPath: "second" }]),
    ]);
    expect(merged?.items).toEqual([{ sectionId: "s1", attempt: 2, outputPath: "second" }]);
  });

  it("작업이 없으면 `null`", () => {
    expect(mergeDocumentJobs([])).toBeNull();
  });
});
