import React from "react";
import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Results, SectionResultCard } from "../redesign-results";
import type { Project, SectionResult } from "../redesign-model";

/**
 * **리디자인도 공통 띠 하나로 「돌고 있다」를 말한다**(2026-10-08 사용자 승인).
 *
 * 전체 화면 창(`GenerationProgressPanel`)을 위쪽 띠로 바꿨다. 화면(`redesign-wizard.tsx`)은
 * 브라우저 코드를 들여와 띄울 수 없어 배선은 소스로 재고, 결과 칸·단추는 띄워서 잰다.
 */

const 읽기 = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("화면 배선", () => {
  const wizard = 읽기("redesign-wizard.tsx");

  it("**전체 화면 창을 더 쓰지 않는다**", () => {
    expect(wizard).not.toContain("GenerationProgressPanel");
    expect(읽기("redesign-results.tsx")).not.toContain("GenerationProgressPanel");
  });

  it("**띠는 화면 맨 위, 단계 표시줄보다 먼저다**", () => {
    const 띠 = wizard.indexOf("<RedesignWorkingStatus");
    expect(띠).toBeGreaterThan(-1);
    expect(띠).toBeLessThan(wizard.indexOf("<StepBar"));
  });

  it("**중지는 전과 같은 손잡이이고, 그 손잡이가 요청을 끊는다**", () => {
    expect(wizard).toMatch(/<RedesignWorkingStatus[\s\S]{0,400}onStop=\{cancelGeneration\}/);
    expect(wizard).toMatch(/function cancelGeneration\(\) \{\s*generationAbortRef\.current\?\.abort\(\);/);
  });

  /* **만드는 동안 단계를 옮기지 못한다**(2026-10-08 리뷰 H1). 전체 화면 창이 유일한 잠금이었다 —
     그 사이 대시보드에서 지운 작업이 생성 끝에 되살아났다. */
  it("**만드는 동안 단계 표시줄로 옮기지 못한다**", () => {
    expect(wizard).toMatch(/onJump=\{\(id\) => \{ if \(!generating\) setView\(id as View\); \}\}/);
  });

  /* **화면을 떠나면 멈춘다**(2026-10-08 리뷰 M1). 창이 막던 사이드바 이동이 열려, 떠난 뒤에도
     남은 섹션 요청이 보이지 않게 나갔다. 떠나면 요청을 끊는다. */
  it("**화면을 떠나면 진행 중 요청을 끊는다**", () => {
    expect(wizard).toContain("React.useEffect(() => () => generationAbortRef.current?.abort(), []);");
  });

  it("**걸린 시간은 처음 장부터 센다**", () => {
    expect(wizard).toMatch(/<RedesignWorkingStatus[\s\S]{0,400}runStartedAt=\{runStartedAt\}/);
    expect(wizard).toContain("setRunStartedAt((current) => (displayIndex && displayIndex > 1 && current ? current : Date.now()));");
  });

  it("**전사 구간 수와 수정 여부를 띠에 넘긴다**", () => {
    expect(wizard).toMatch(/<RedesignWorkingStatus[\s\S]{0,400}transcribeCount=\{transcribeCount\}/);
    expect(wizard).toMatch(/<RedesignWorkingStatus[\s\S]{0,400}editing=\{editingSectionId !== null\}/);
  });

  it("**「리디자인 생성」 단추는 일하는 동안 공통 낱말을 쓴다**", () => {
    expect(읽기("redesign-panels.tsx")).toMatch(/generating \? workingButton\("make"\) : "리디자인 생성"/);
  });
});

const 섹션 = (id: string): SectionResult => ({
  id,
  name: `${id} 장면`,
  purpose: "목적",
  source: "원본",
  prompt: "프롬프트",
  imageUrl: "data:image/png;base64,AAAA",
});

let renderer: ReactTestRenderer;
const 그린글 = () => JSON.stringify(renderer.toJSON());

beforeEach(() => { vi.stubGlobal("React", React); });
afterEach(() => { if (renderer) act(() => renderer.unmount()); vi.unstubAllGlobals(); });

const 카드 = (editing: boolean) => {
  act(() => {
    renderer = create(
      <SectionResultCard section={섹션("S1")} index={0} projectTitle="작업" onEditSection={() => {}} editing={editing} disabled={editing} />,
    );
  });
};

describe("섹션 칸", () => {
  it("**고치는 칸은 그림 위에 「만드는 중」을 덮는다 — 화살표는 눌린다**", () => {
    카드(true);

    const 덮개 = renderer.root.findAll(
      (node) => typeof node.type === "string" && /(^|\s)pointer-events-none(\s|$)/.test(String(node.props.className)) && node.children.includes("만드는 중"),
    );
    expect(덮개.length).toBeGreaterThan(0);
  });

  it("**수정 단추는 「고치는 중…」**", () => {
    카드(true);

    expect(그린글()).toContain("고치는 중…");
  });

  it("**고치지 않는 칸에는 덮개가 없다**", () => {
    카드(false);

    const 글 = 그린글();
    expect(글).not.toContain("만드는 중");
    expect(글).not.toContain("고치는 중…");
  });
});

const 작업 = (): Project =>
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
    createdAt: "2026-10-08T00:00:00Z",
    sections: [섹션("S1")],
  }) as Project;

const 결과 = (generating: boolean, editingSectionId: string | null) => {
  act(() => {
    renderer = create(
      <Results
        project={작업()}
        rolloutRequest=""
        setRolloutRequest={() => {}}
        onToast={() => {}}
        onSave={() => {}}
        onSaveToLibrary={() => {}}
        onEditSection={() => {}}
        onGenerateRest={() => {}}
        generating={generating}
        editingSectionId={editingSectionId}
      />,
    );
  });
};

describe("나머지 상세페이지 만들기 단추", () => {
  it("**만드는 동안 「만드는 중…」**", () => {
    결과(true, null);

    const 글 = 그린글();
    expect(글).toContain("만드는 중…");
    expect(글).not.toContain("나머지 상세페이지 만들기");
  });

  /* 섹션을 고치는 동안에는 이 단추가 만드는 것이 아니다 — 잠기기만 한다. */
  it("**섹션을 고치는 동안에는 제 이름 그대로 잠긴다**", () => {
    결과(true, "S1");

    expect(그린글()).toContain("나머지 상세페이지 만들기");
  });

  it("**쉬는 동안은 제 이름**", () => {
    결과(false, null);

    expect(그린글()).toContain("나머지 상세페이지 만들기");
  });
});
