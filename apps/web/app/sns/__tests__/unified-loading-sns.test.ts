import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generationProgress } from "../[id]/generation-progress";
import { cardItemState } from "../[id]/result-rules";

/**
 * **카드뉴스도 시간이 걸리는 단계는 공통 띠·칸 표시로 말한다**(2026-10-08 사용자).
 *
 * 화면 파일은 jsdom 없이 못 띄우므로 값은 값으로, 화면은 글로 잰다
 * (`new-client-plan-guard.test.ts` 와 같은 방식).
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const newClient = read("../new-client.tsx");
const project = read("../[id]/project-client.tsx");
const board = read("../[id]/result-board.tsx");
const layout = read("../layout/layout-client.tsx");
const deck = read("../layout/deck-panel.tsx");
const previewPanel = read("../layout/preview-panel.tsx");

describe("값 — 몇 장째인지", () => {
  const card = (kind: string, status: string) => ({ kind, status }) as never;
  it("만들 카드만 세고, 끝난 것(완료·검수 필요)을 done 으로 센다", () => {
    expect(generationProgress([
      card("generated", "done"), card("generated", "review_required"), card("generated", "generating"),
      card("generated", "pending"), card("place_as_is", "done"),
    ])).toEqual({ done: 2, total: 4 });
  });
  it("한 장이면 막대를 안 준다 — 여러 장일 때만 진행률이다", () => {
    expect(generationProgress([card("generated", "generating")])).toBeUndefined();
    expect(generationProgress([])).toBeUndefined();
  });
});

describe("값 — 칸 상태 대응", () => {
  it("생성 중→working, 대기→queued, 완료→done, 실패→failed, 그 밖은 그대로 둔다", () => {
    expect(cardItemState("generating")).toBe("working");
    expect(cardItemState("pending")).toBe("queued");
    expect(cardItemState("done")).toBe("done");
    expect(cardItemState("failed")).toBe("failed");
    expect(cardItemState("review_required")).toBeUndefined();
  });
});

describe("첫 기획 시작", () => {
  it("저장→기획 두 단계를 나누어 띠를 맨 위에 띄운다", () => {
    expect(newClient).toContain('React.useState<"saving" | "planning" | null>');
    expect(newClient).toContain("<WorkingStatus");
    expect(newClient).toContain('"기획 중입니다"');
    expect(newClient).toContain("기획과 원고를 작성하고 있습니다. 1~2분 걸립니다");
    expect(newClient).toContain('"저장 중입니다"');
    expect(newClient).toContain('workingButton("save")');
    expect(newClient).toContain('workingButton("plan")');
  });
  it("멈추는 길이 없으므로 중지 단추를 달지 않는다", () => {
    const at = newClient.indexOf("<WorkingStatus");
    expect(newClient.slice(at, at + 400)).not.toContain("onStop");
  });
  it("요청은 그대로 — 저장 뒤 기획 순서, 식별자 있는 요청", () => {
    expect(newClient.indexOf('fetch("/api/sns/projects"')).toBeLessThan(newClient.indexOf("billableFetch(`/api/sns/projects/${payload.project.id}/plan`)"));
  });
});

describe("작업 화면 띠", () => {
  it("일을 시작한 때를 기록해 걸린 시간을 보인다", () => {
    expect(project).toContain("setWorkStartedAt(Date.now())");
    expect(project).toContain("startedAt={workStartedAt}");
  });
  it("그림 만들기 띠에 몇 장째인지를 준다", () => {
    expect(project).toContain("generationProgress(project.data.flow?.cards ?? [])");
    expect(project).toContain("progress={progress}");
  });
  it("멈추는 자리는 그대로 셋이다", () => {
    expect(project.split("onStop={() => void stopNow()}").length - 1).toBe(3);
  });
  it("카드 다시 만들기·게시글 문구 중에도 띠가 뜨되, 더 큰 띠가 있으면 둘째를 얹지 않는다", () => {
    expect(project).toContain("regeneratingIndex !== undefined || writingCaption");
    expect(project).toContain("!bigBannerShown");
    expect(project).toContain("카드를 다시 만드는 중입니다");
    expect(project).toContain("게시글 문구를 작성 중입니다");
  });
  it("단추 글자는 공통 낱말이다", () => {
    expect(project).toContain('workingButton("plan")');
    expect(project).toContain('workingButton("make")');
  });
});

describe("결과판 칸 표시", () => {
  it("만드는 중·대기·완료·실패 칸은 공통 표시를 쓰고, 검수 상태는 그대로다", () => {
    expect(board).toContain("ItemStatusBadge");
    expect(board).toContain("ItemWorkingOverlay");
    expect(board).toContain("사람의 검수 필요");
    expect(board).toContain("검수 통과");
    expect(board).not.toContain("<Badge variant=\"secondary\">대기 중</Badge>");
  });
  it("다시 만들기·문구 쓰기 단추 글자도 공통 낱말이다", () => {
    expect(board).toContain('workingButton("make")');
    expect(board).toContain('workingButton("write")');
  });
});

describe("레이아웃·세트", () => {
  it("칸 읽어내기는 화면 맨 위에 띠를 띄운다", () => {
    expect(layout).toContain('busy === "analyze" ? (');
    expect(layout).toContain('workingButton("analyze")');
    expect(layout).toContain("<WorkingStatus");
  });
  it("미리보기 패널과 세트 미리보기도 띠와 공통 낱말을 쓴다", () => {
    expect(previewPanel).toContain("<WorkingStatus");
    expect(previewPanel).toContain('workingButton("make")');
    expect(deck).toContain("<WorkingStatus");
    expect(deck).toContain('workingButton("make")');
  });
  it("손잡이·서랍의 도는 표시는 그대로다", () => {
    expect(layout).toContain('busy={busy === "preview"}');
  });
});
