import { describe, expect, it } from "vitest";
import { handleCandidatePatch } from "../candidate-handler";
import { CandidatePatchSchema, candidateActions, candidateToDraft } from "../schema";
import { createCandidateService, type CandidateRecord, type CandidateRepository } from "../candidate-service";

describe("후보 수정", () => {
  it("status 만 바꿀 수 있다", () => {
    expect(CandidatePatchSchema.safeParse({ status: "picked" }).success).toBe(true);
    // 본문을 고치면 수집 원본이 아니게 된다.
    expect(CandidatePatchSchema.safeParse({ body: "고친 본문" }).success).toBe(false);
  });

  it("모르는 상태는 거절한다", () => {
    expect(CandidatePatchSchema.safeParse({ status: "삭제됨" }).success).toBe(false);
  });

  it("requested 상태는 사용자가 넣을 수 없다", async () => {
    let updateCalls = 0;
    const response = await handleCandidatePatch(
      new Request("http://localhost/api/candidates/c1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "requested" }),
      }),
      "c1",
      {
        updateStatus: async () => {
          updateCalls += 1;
          throw new Error("호출되면 안 됩니다.");
        },
      },
    );

    expect(response.status).toBe(400);
    expect(updateCalls).toBe(0);
  });

  it("보관한 후보를 다시 꺼낼 수 있다", () => {
    expect(candidateActions("archived")).toContainEqual({ status: "new", label: "다시 꺼내기" });
  });
});

describe("카드뉴스로 넘기기", () => {
  it("제목과 본문만 넘긴다", () => {
    // 참고 이미지·비율·장수·모델은 사람이 고른다. 두 입구의 차이는
    // "내용을 어디서 가져오느냐" 하나뿐이어야 한다.
    const draft = candidateToDraft({
      id: "c1", title: "제목", body: "본문", url: "https://a.com", summary: "요약",
    });
    expect(draft).toEqual({
      title: "제목",
      source: { kind: "collected", title: "제목", text: "본문", url: "https://a.com" },
    });
    expect(Object.keys(draft)).not.toContain("references");
    expect(Object.keys(draft)).not.toContain("ratio");
  });

  it("본문이 없으면 요약을 쓴다", () => {
    const draft = candidateToDraft({ id: "c1", title: "제목", body: null, summary: "요약", url: null });
    expect(draft.source.text).toBe("요약");
  });
});

describe("후보 서비스", () => {
  const candidate: CandidateRecord = {
    id: "c1",
    sourceId: "s1",
    title: "새 글",
    url: "https://example.com/post",
    body: "본문",
    summary: "요약",
    thumbnailUrl: null,
    publishedAt: "2026-08-30T01:00:00Z",
    collectedAt: "2026-08-31T01:00:00Z",
    status: "new",
    source: { id: "s1", name: "OpenAI 공식 소식", kind: "official_ai" },
  };

  it("출처와 수집 시각을 목록에서 보존한다", async () => {
    const repository: CandidateRepository = {
      list: async () => [candidate],
      updateStatus: async () => candidate,
    };
    const [row] = await createCandidateService(repository).list();
    expect(row).toMatchObject({
      source: { name: "OpenAI 공식 소식" },
      collectedAt: "2026-08-31T01:00:00Z",
    });
  });

  it("status 만 저장소에 전달한다", async () => {
    const updates: Array<{ id: string; status: string }> = [];
    const repository: CandidateRepository = {
      list: async () => [],
      updateStatus: async (id, status) => {
        updates.push({ id, status });
        return { ...candidate, id, status };
      },
    };
    await createCandidateService(repository).updateStatus("c1", "archived");
    expect(updates).toEqual([{ id: "c1", status: "archived" }]);
  });
});
