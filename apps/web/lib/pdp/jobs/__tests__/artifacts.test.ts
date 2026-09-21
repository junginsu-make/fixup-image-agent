import { describe, expect, it } from "vitest";
import { jobArtifactPath, isOwnedPath } from "../artifacts";

/**
 * **그림을 어디에 두는가.**
 *
 * 기존 `library` 버킷을 그대로 쓴다. 그 버킷의 정책은 **경로 첫 칸이 소유자**이고
 * (`202607280001_server_library.sql`), 그래서 표를 조인하다 실수하는 경로 자체가
 * 없다. 새 버킷을 만들면 정책을 한 벌 더 쓰고 SQL 을 또 적용해야 한다.
 *
 * 라이브러리 목록은 `library_items` 표만 읽으므로 같은 버킷을 써도 섞이지 않는다.
 */
describe("작업 결과 경로", () => {
  it("**첫 칸이 소유자다** — 경로만 보고 남의 것인지 가린다", () => {
    const path = jobArtifactPath({
      userId: "u1", jobId: "job-1", sectionId: "s1", attempt: 1, mimeType: "image/png",
    });

    expect(path.startsWith("u1/")).toBe(true);
  });

  it("작업·섹션·시도가 경로에 들어간다 — 다시 만든 것이 앞 것을 덮지 않는다", () => {
    const 처음 = jobArtifactPath({ userId: "u1", jobId: "j1", sectionId: "s1", attempt: 1, mimeType: "image/png" });
    const 다시 = jobArtifactPath({ userId: "u1", jobId: "j1", sectionId: "s1", attempt: 2, mimeType: "image/png" });

    expect(다시).not.toBe(처음);
  });

  it("다른 작업은 다른 자리다", () => {
    const a = jobArtifactPath({ userId: "u1", jobId: "j1", sectionId: "s1", attempt: 1, mimeType: "image/png" });
    const b = jobArtifactPath({ userId: "u1", jobId: "j2", sectionId: "s1", attempt: 1, mimeType: "image/png" });

    expect(a).not.toBe(b);
  });

  it("형식에 맞는 확장자를 붙인다", () => {
    expect(jobArtifactPath({ userId: "u", jobId: "j", sectionId: "s", attempt: 1, mimeType: "image/jpeg" })).toMatch(/\.jpg$/);
    expect(jobArtifactPath({ userId: "u", jobId: "j", sectionId: "s", attempt: 1, mimeType: "image/webp" })).toMatch(/\.webp$/);
    // 모르는 형식은 png 로 둔다. 확장자가 없는 것보다 낫다.
    expect(jobArtifactPath({ userId: "u", jobId: "j", sectionId: "s", attempt: 1, mimeType: "image/heic" })).toMatch(/\.png$/);
  });

  it("**AI 가 지은 섹션 이름이 경로를 벗어나지 못한다**", () => {
    // `section_id` 는 AI 응답값이다. 거기에 `../` 가 들어오면 남의 자리에 쓴다.
    const path = jobArtifactPath({
      userId: "u1", jobId: "j1", sectionId: "../../other", attempt: 1, mimeType: "image/png",
    });

    expect(path).not.toContain("..");
    expect(path.startsWith("u1/")).toBe(true);
  });

  it("공백이나 한글이 섞여도 안전한 이름이 된다", () => {
    const path = jobArtifactPath({
      userId: "u1", jobId: "j1", sectionId: "첫 장면 S1", attempt: 1, mimeType: "image/png",
    });

    expect(path).toMatch(/^u1\/[A-Za-z0-9/_.-]+$/);
  });
});

describe("남의 그림을 내주지 않는다", () => {
  it("내 칸으로 시작하는 경로만 내 것이다", () => {
    expect(isOwnedPath("u1/pdp-jobs/j1/s1.png", "u1")).toBe(true);
    expect(isOwnedPath("u2/pdp-jobs/j1/s1.png", "u1")).toBe(false);
  });

  it("**앞부분만 같은 남을 내 것으로 보지 않는다**", () => {
    // `u1` 과 `u10` 은 남남이다. `startsWith("u1")` 로만 재면 뚫린다.
    expect(isOwnedPath("u10/pdp-jobs/j1/s1.png", "u1")).toBe(false);
  });

  it("경로를 거슬러 올라가는 것을 막는다", () => {
    expect(isOwnedPath("u1/../u2/s1.png", "u1")).toBe(false);
  });
});
