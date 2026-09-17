import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recoverableSections, jobRequestFields } from "../job-recovery";

/**
 * **돌아온 사용자가 무엇을 되찾는가.**
 *
 * 탭을 닫았다 다시 들어오면, 서버에 적힌 작업에서 **아직 화면에 없는 그림만**
 * 가져온다. 이미 있는 것을 덮으면 사용자가 그 뒤에 한 편집이 날아간다.
 */
const 작업 = (items: Array<{ sectionId: string; url: string | null; errorCode?: string | null }>) => ({
  id: "job-1",
  outcome: "done" as const,
  items: items.map((item) => ({ attempt: 1, errorCode: null, ...item })),
});

describe("되찾을 것 고르기", () => {
  it("화면에 없는 섹션의 그림을 가져온다", () => {
    const 되찾을것 = recoverableSections(작업([{ sectionId: "s1", url: "https://x/s1" }]), [
      { section_id: "s1", generatedImage: undefined },
    ] as never);

    expect(되찾을것).toEqual([{ sectionId: "s1", url: "https://x/s1" }]);
  });

  it("**이미 있는 그림을 덮지 않는다** — 그 뒤에 한 편집이 날아간다", () => {
    const 되찾을것 = recoverableSections(작업([{ sectionId: "s1", url: "https://x/s1" }]), [
      { section_id: "s1", generatedImage: "data:image/png;base64,AAA" },
    ] as never);

    expect(되찾을것).toEqual([]);
  });

  it("저장 못 한 섹션은 가져올 것이 없다", () => {
    const 되찾을것 = recoverableSections(
      작업([{ sectionId: "s1", url: null, errorCode: "artifact_upload_failed" }]),
      [{ section_id: "s1", generatedImage: undefined }] as never,
    );

    expect(되찾을것).toEqual([]);
  });

  it("**화면에 없는 섹션은 건너뛴다** — 구성안을 바꿨을 수 있다", () => {
    const 되찾을것 = recoverableSections(작업([{ sectionId: "지운섹션", url: "https://x/s9" }]), [
      { section_id: "s1", generatedImage: undefined },
    ] as never);

    expect(되찾을것).toEqual([]);
  });

  it("여러 장 중 되찾을 것만 고른다", () => {
    const 되찾을것 = recoverableSections(
      작업([
        { sectionId: "s1", url: "https://x/s1" },
        { sectionId: "s2", url: "https://x/s2" },
        { sectionId: "s3", url: null },
      ]),
      [
        { section_id: "s1", generatedImage: "data:image/png;base64,AAA" },
        { section_id: "s2", generatedImage: undefined },
        { section_id: "s3", generatedImage: undefined },
      ] as never,
    );

    expect(되찾을것).toEqual([{ sectionId: "s2", url: "https://x/s2" }]);
  });
});

describe("요청에 싣는 문서 표시", () => {
  it("초안 id 가 있으면 그것으로 묶는다", () => {
    expect(jobRequestFields("draft-1", 3)).toEqual({ documentId: "draft-1", revision: 3 });
  });

  it("**아직 저장 안 한 작업은 아무것도 안 싣는다** — 서버가 알아서 대신한다", () => {
    expect(jobRequestFields(null, 0)).toEqual({});
  });
});

/**
 * **배선이 실제로 닿았는가.**
 *
 * `jobRequestFields` 가 맞아도 화면이 그 값을 안 실으면 아무 일도 안 일어난다.
 * 그 한 줄은 지워도 위 시험이 전부 통과한다 — 이 저장소가 겪은 그 구멍이다
 * (`page-wire.ts` 머리말). 그래서 실제 파일에서 배선을 확인한다.
 */
describe("화면이 실제로 싣는가", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../PdpMakerClient.tsx", import.meta.url), "utf8");

  it("일괄 생성 요청에 문서 표시를 싣는다", () => {
    expect(editor).toContain("...jobRequestFields(draftId, 0)");
  });

  it("부모가 초안 id 를 넘긴다", () => {
    expect(client).toContain("draftId={activeDraftId}");
  });
});
