import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **새로 예약을 붙인 주소는 화면이 요청 식별자를 붙여 불러야 한다**(설계 2026-09-30 §3.1).
 *
 * `billable-key-wiring.test.ts` 는 `[id]` 가 든 주소를 원문으로 못 짝지어 건너뛴다.
 * 그 주소들을 여기서 **부르는 자리째** 본다. 안 붙이면 운영에서 400 「요청 식별자가
 * 올바르지 않습니다」다 — 로컬은 인증 우회가 먼저 지나가 안 드러난다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("카드뉴스", () => {
  const created = read("../../app/sns/new-client.tsx");
  const project = read("../../app/sns/[id]/project-client.tsx");

  it("만들기 직후의 기획 요청이 식별자를 붙인다", () => {
    expect(created).toMatch(/billableFetch\(`\/api\/sns\/projects\/\$\{payload\.project\.id\}\/plan`\)/);
  });

  it("「기획·원고 만들기」가 식별자를 붙인다", () => {
    expect(project).toMatch(
      /request\(`\/api\/sns\/projects\/\$\{projectId\}\/plan`, \{[^}]*method: "POST"[^}]*headers: billableHeaders\(\)/,
    );
  });

  it("「게시글 문구」가 식별자를 붙인다", () => {
    expect(project).toMatch(
      /request\(`\/api\/sns\/projects\/\$\{projectId\}\/caption`, \{[^}]*method: "POST"[^}]*headers: billableHeaders\(\)/,
    );
  });
});

describe("포스터", () => {
  const poster = read("../../app/poster/[id]/poster-client.tsx");

  it("검수 요청이 식별자 길목(`billableRequest`)을 지난다", () => {
    expect(poster).toMatch(/billableRequest\(`\/api\/poster\/projects\/\$\{project\.id\}\/review`\)/);
  });
});
