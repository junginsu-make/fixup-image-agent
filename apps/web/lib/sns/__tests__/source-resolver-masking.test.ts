import { describe, expect, it, vi } from "vitest";
import { TranscriptUnavailableError, YoutubeUrlError } from "@fixup/ingest-core/src/adapters/youtube";
import { WebSourceBlockedError, WebUrlError } from "@fixup/ingest-core/src/adapters/web";
import { TopicResearchNotConfiguredError } from "@fixup/ingest-core/src/adapters/topic";
import { SourceInsufficientContentError } from "@fixup/ingest-core/src/types";
import { resolveSourceText } from "../source-resolver";

/**
 * **내용을 못 가져온 까닭에 업체 원문을 싣지 않는다**(2026-10-07 오류 원문 가리기 Task 3).
 *
 * 그 까닭은 작업의 `planningIssues` 로 저장되고 카드뉴스 화면 · 쉽게 모드 대화에 뜬다. 수집 패키지가 사용자에게
 * 하려고 쓴 문장(주소가 틀림 · 막힌 사이트 · 내용 부족)은 그대로, 자막 실패는 앞 문장만(단계별 원문은 뺀다),
 * 그 밖(네트워크 · Apify · 설정의 환경변수 이름)은 일반 문장이다. 원문은 서버 기록에만 남는다.
 */
const 날것 = "fetch failed: getaddrinfo ENOTFOUND api.apify.com token=SECRET";

const deps = (error: unknown) => ({
  ingestYoutube: vi.fn(async () => { throw error; }),
  ingestWeb: vi.fn(async () => { throw error; }),
  research: vi.fn(async () => { throw error; }),
}) as never;

const youtube = { kind: "youtube" as const, url: "https://youtu.be/abc12345678" };
const question = { kind: "question" as const, question: "요즘 AI 동향은?" };

async function issueFor(error: unknown, source: typeof youtube | typeof question = youtube) {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const result = await resolveSourceText(source, deps(error));
    expect(result.text).toBe("");
    return { issues: result.issues, logged: errors.mock.calls.flat().map(String).join(" ") };
  } finally {
    errors.mockRestore();
  }
}

describe("내용 가져오기 실패의 까닭", () => {
  it("예상 못 한 원문은 일반 문장으로 — 원문은 기록에만", async () => {
    const { issues, logged } = await issueFor(new Error(날것));
    expect(issues).toEqual(["내용을 가져오지 못했습니다. 잠시 뒤 다시 하거나 내용을 직접 적어 주세요."]);
    expect(logged).toContain("ENOTFOUND");
  });

  it("설정 오류의 환경변수 이름도 싣지 않는다", async () => {
    const { issues } = await issueFor(new TopicResearchNotConfiguredError(), question);
    expect(issues.join(" ")).not.toContain("OPENAI_API_KEY");
    expect(issues).toEqual(["내용을 가져오지 못했습니다. 잠시 뒤 다시 하거나 내용을 직접 적어 주세요."]);
  });

  it("자막 실패는 앞 문장만 — 단계별 원문은 뺀다", async () => {
    const { issues } = await issueFor(new TranscriptUnavailableError("abc12345678", [`apify: ${날것}`, "audio: 403"]));
    expect(issues).toEqual(["내용을 가져오지 못했습니다: YouTube 자막과 음성 내용을 가져오지 못했습니다."]);
  });

  it("수집 패키지가 사용자에게 쓴 문장은 그대로다", async () => {
    for (const error of [
      new YoutubeUrlError(),
      new WebUrlError("페이지가 너무 커서 글을 가져오지 못했습니다."),
      new WebSourceBlockedError(),
      new SourceInsufficientContentError(),
    ]) {
      const { issues } = await issueFor(error);
      expect(issues).toEqual([`내용을 가져오지 못했습니다: ${error.message}`]);
    }
  });
});
