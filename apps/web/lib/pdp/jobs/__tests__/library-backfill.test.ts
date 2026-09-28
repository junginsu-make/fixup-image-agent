import { describe, expect, it } from "vitest";
import { storedPagesByDocument } from "../library-backfill";

/**
 * **서버에 남은 상세페이지 결과를 라이브러리로 옮길 때의 차례**(2026-09-28).
 *
 * 2026-09-23 이전에 만든 상세페이지는 결과가 서버(`pdp_generation_items`)에
 * 저장됐는데 라이브러리 작업으로는 한 번도 등록되지 않았다 — 그때는 저장 단추가
 * 10MB 한도에 걸려 실패했고, 자동 저장은 그 뒤에 생겼다. 서버에 남은 기록에는
 * 페이지 순서가 따로 없어, **요청 순서 → 요청 안의 섹션 순서**로 되살린다.
 * 일괄 생성은 묶음을 앞에서부터 차례로 보내므로 이것이 페이지 순서다.
 */
const job = (id: string, documentId: string, sectionIds: string[], createdAt: string, userId = "u1") =>
  ({ id, user_id: userId, document_id: documentId, section_ids: sectionIds, created_at: createdAt, persistence: "stored" });
const item = (jobId: string, sectionId: string, attempt: number, path: string | null, createdAt = "2026-09-23T00:00:00Z") =>
  ({ job_id: jobId, section_id: sectionId, attempt, output_path: path, created_at: createdAt });

describe("문서별 페이지 차례", () => {
  it("**요청 순서 → 요청 안의 섹션 순서**로 놓는다", () => {
    const pages = storedPagesByDocument(
      [job("j2", "d1", ["s4", "s5"], "2026-09-23T01:11:00Z"), job("j1", "d1", ["s1", "s2", "s3"], "2026-09-23T01:10:00Z")],
      [item("j1", "s1", 1, "p1"), item("j1", "s2", 1, "p2"), item("j1", "s3", 1, "p3"), item("j2", "s4", 1, "p4"), item("j2", "s5", 1, "p5")],
    );
    expect(pages).toEqual([{ documentId: "d1", userId: "u1", paths: ["p1", "p2", "p3", "p4", "p5"], firstCreatedAt: "2026-09-23T01:10:00Z" }]);
  });

  it("같은 섹션을 다시 만들었으면 **마지막 것**을 쓰되 자리는 처음 자리다", () => {
    const pages = storedPagesByDocument(
      [job("j1", "d1", ["s1", "s2"], "2026-09-23T01:10:00Z"), job("j2", "d1", ["s1"], "2026-09-23T02:00:00Z")],
      [item("j1", "s1", 1, "old"), item("j1", "s2", 1, "p2"), item("j2", "s1", 1, "new")],
    );
    expect(pages[0]!.paths).toEqual(["new", "p2"]);
  });

  it("한 요청 안에서 여러 번 시도했으면 마지막 시도를 쓴다", () => {
    const pages = storedPagesByDocument(
      [job("j1", "d1", ["s1"], "2026-09-23T01:10:00Z")],
      [item("j1", "s1", 1, "first"), item("j1", "s1", 2, "second")],
    );
    expect(pages[0]!.paths).toEqual(["second"]);
  });

  it("**저장된 그림이 없는 섹션은 건너뛴다** — 가리킬 파일이 없다", () => {
    const pages = storedPagesByDocument(
      [job("j1", "d1", ["s1", "s2"], "2026-09-23T01:10:00Z")],
      [item("j1", "s1", 1, "p1"), item("j1", "s2", 1, null)],
    );
    expect(pages[0]!.paths).toEqual(["p1"]);
  });

  it("문서마다 따로 묶고, 그림이 하나도 없는 문서는 뺀다", () => {
    const pages = storedPagesByDocument(
      [job("a", "d1", ["s1"], "2026-09-23T01:00:00Z"), job("b", "d2", ["s2"], "2026-09-24T01:00:00Z"), job("c", "d3", ["s3"], "2026-09-25T01:00:00Z")],
      [item("a", "s1", 1, "p1"), item("b", "s2", 1, "p2"), item("c", "s3", 1, null)],
    );
    expect(pages.map((page) => page.documentId)).toEqual(["d1", "d2"]);
  });

  it("문서 id 가 없는 요청(저장 전 작업)은 묶을 열쇠가 없어 뺀다", () => {
    const pages = storedPagesByDocument(
      [{ ...job("a", "d1", ["s1"], "2026-09-23T01:00:00Z"), document_id: null }],
      [item("a", "s1", 1, "p1")],
    );
    expect(pages).toEqual([]);
  });
});
