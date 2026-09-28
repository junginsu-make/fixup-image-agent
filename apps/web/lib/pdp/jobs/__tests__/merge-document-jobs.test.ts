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

/**
 * **같은 밀리초에 만들어진 둘**(2026-09-28 CI 가 잡았다).
 *
 * `createdAt` 은 밀리초까지라 빠른 기계에서는 두 작업이 같은 시각을 갖는다.
 * 그때 `sort` 는 안정 정렬이라 **들어온 차례를 그대로 둔다** — 그래서 넘겨주는
 * 쪽이 최근 것을 먼저 놓아 줘야 한다.
 *
 * 계약 시험은 이것을 **시계 운으로만** 잡는다. 여기서 못 박는다.
 */
describe("같은 시각에 만들어진 작업", () => {
  it("**넘겨준 차례의 앞엣것을 최근으로 본다**", () => {
    const 같은시각 = "2026-09-28T01:00:00.000Z";
    const merged = mergeDocumentJobs([
      job("나중에-만든-것", 같은시각, [{ sectionId: "s1", attempt: 1, outputPath: "새것" }]),
      job("먼저-만든-것", 같은시각, [{ sectionId: "s1", attempt: 1, outputPath: "옛것" }]),
    ]);

    expect(merged?.id, "같은 시각이면 앞엣것이 최근이다").toBe("나중에-만든-것");
    expect(merged?.items[0]?.outputPath).toBe("새것");
  });
});

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
