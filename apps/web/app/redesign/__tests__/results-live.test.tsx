import React from "react";
import { create } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { Results } from "../redesign-results";
import type { Project } from "../redesign-model";

/**
 * **결과 화면이 실제로 그리는가**(N-9·F-7-8).
 *
 * ── 왜 띄워서 재나 ─────────────────────────────────────────
 *
 * 처음에는 소스 문자열로 쟀다. 그런데 그것으로는 **배선이 끊겨도 통과한다** —
 * `{project.referenceNotice ? (` 를 `{false ? (` 로 바꿔도 그 문자열은 파일에
 * 그대로 남아 있다. 실측으로 확인했다.
 *
 * 그려진 것을 본다.
 */

const 섹션 = (id: string) =>
  ({
    section_id: id,
    section_name: `${id} 장면`,
    image_base64: "AAAA",
    mime_type: "image/png",
  }) as never;

const 작업 = (patch: Partial<Project> = {}): Project =>
  ({
    id: "job-1",
    title: "상세페이지",
    channel: "detail",
    model: "openai",
    count: 1,
    ratio: "3:4",
    status: "완료",
    files: ["원본.pdf"],
    request: "",
    createdAt: "2026-09-21T00:00:00Z",
    sections: [섹션("S1")],
    ...patch,
  }) as Project;

const 그린글 = (project: Project) =>
  JSON.stringify(
    create(
      <Results
        project={project}
        rolloutRequest=""
        setRolloutRequest={() => {}}
        onToast={() => {}}
        onSave={() => {}}
        onSaveToLibrary={() => {}}
        onEditSection={() => {}}
        onGenerateRest={() => {}}
        generating={false}
        editingSectionId={null}
      />,
    ).toJSON(),
  );

/**
 * **안 쓰인 참조를 말한다**(N-9, 설계 §1 불변조건 7).
 *
 * 리디자인은 참조를 상한에서 자른다. 그 자체는 맞다 — 모델이 받을 수 있는
 * 장수가 정해져 있다. **문제는 안 알리는 것이었다.** 각도를 넷 고르고 원본이
 * 세 장이면 각도 하나가 말없이 빠지고, 사용자는 결과가 왜 다른지 모른다.
 */
describe("안 쓰인 참조", () => {
  it("**있으면 그 말을 그린다**", () => {
    const 글 = 그린글(작업({ referenceNotice: "고른 인물 각도 4장 가운데 1장만 썼습니다." }));

    expect(글).toContain("쓰이지 않았습니다");
    expect(글).toContain("4장 가운데 1장만 썼습니다");
  });

  it("**없으면 아무것도 안 그린다** — 늘 뜨는 상자는 사용자가 넘긴다", () => {
    expect(그린글(작업())).not.toContain("쓰이지 않았습니다");
  });

  it("**빈 문자열도 안 그린다**", () => {
    expect(그린글(작업({ referenceNotice: "" }))).not.toContain("쓰이지 않았습니다");
  });
});

/**
 * **어느 장이 왜 안 만들어졌는지 그린다**(F-7-8).
 *
 * 같은 파일의 배선이라 함께 잰다. 소스 문자열로만 재던 것을 띄워서 옮긴다.
 */
describe("만들어지지 않은 섹션", () => {
  it("**까닭과 함께 그린다**", () => {
    const 글 = 그린글(
      작업({
        failedSections: [{ section_id: "S2", name: "S2 베네핏", error: "요청 한도를 넘었습니다" }],
      }),
    );

    expect(글).toContain("S2 베네핏");
    expect(글).toContain("요청 한도");
  });

  it("**없으면 안 그린다**", () => {
    expect(그린글(작업())).not.toContain("만들어지지 않은 섹션");
  });
});
