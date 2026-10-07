import "fake-indexeddb/auto";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SectionBlueprint } from "@fixup/pdp-core";
import { createEmptySection } from "../scenario-sections";
import { WorkingStatus } from "../../_components/working-status";
import { ItemStatusBadge, ItemWorkingOverlay, type ItemState } from "../../_components/item-status";

/**
 * **상세페이지에서 시간이 걸리는 단계가 모두 같은 띠·같은 칸 표시를 쓰는가**(2026-10-08 사용자).
 *
 * 띠는 `WorkingStatus` 하나, 섹션마다는 `ItemStatusBadge`·`ItemWorkingOverlay`.
 * 눌러 보고 잰다 — 소스 문자열로는 배선을 끊어도 초록이 된다(duplicate-recovery-live 의 교훈).
 *
 * 요청은 손대지 않는다 — 묶음 크기·순서가 그대로인지도 함께 본다.
 */

type Pending = { path: string; body: string; resolve: (value: unknown) => void };
const captured = vi.hoisted(() => ({ pending: [] as Pending[] }));

vi.mock("../pdp-utils", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    // **끝나지 않는다.** 시험이 하나씩 풀어 준다.
    apiJson: (path: string, init?: RequestInit) =>
      new Promise((resolve) => { captured.pending.push({ path, body: String(init?.body ?? ""), resolve }); }),
  };
});

// 라이브러리에서 넘어온 글을 읽는 자리다. 시험 환경에는 sessionStorage 가 없다.
vi.mock("../../../lib/handoff", () => ({ peekHandoff: () => null, takeHandoff: () => null }));

import { PdpEditor } from "../PdpEditor";
import { KeyVisualGate } from "../KeyVisualGate";
import { TextBriefInput } from "../TextBriefInput";
import { TextModeFlow } from "../TextModeFlow";

const 그림 = "data:image/png;base64,AAAA";
const 섹션들 = (장수: number, 만든장수 = 0): SectionBlueprint[] =>
  Array.from({ length: 장수 }, (_, index) => ({
    ...createEmptySection(index),
    section_name: `섹션 ${index + 1}`,
    headline: `${index + 1}번 제목`,
    ...(index < 만든장수 ? { generatedImage: 그림 } : {}),
  }));

let renderer: ReactTestRenderer;

/** 부모처럼 섹션을 쥐고 있어야 돌아온 그림이 붙는다. */
function 편집기({ start, extra }: { start: SectionBlueprint[]; extra?: Record<string, unknown> }) {
  const [sections, setSections] = React.useState(start);
  return (
    <PdpEditor
      initialResult={{ originalImage: "AAAA", blueprint: { executiveSummary: "", scorecard: [], blueprintList: [], sections } } as never}
      characterAngles={[]}
      aspectRatio="3:4"
      desiredTone=""
      imageModel="gpt-image-2"
      onReset={() => {}}
      onSectionsChange={setSections}
      {...extra}
    />
  );
}

const 글자 = (node: { children: unknown[] }) =>
  node.children.filter((child): child is string => typeof child === "string").join("");
const 단추 = (말: string) =>
  renderer.root.findAll((node) => node.type === "button" && 글자(node as never).includes(말));
const 그려진글 = () => JSON.stringify(renderer.toJSON());
const 가라앉힌다 = async () => {
  for (let i = 0; i < 4; i += 1) {
    await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
  }
};
const 누른다 = async (말: string) => {
  const 것 = 단추(말)[0];
  expect(것, `「${말}」 단추를 못 찾았다`).toBeTruthy();
  await act(async () => { 것!.props.onClick(); });
  await 가라앉힌다();
};
const 띠 = () => renderer.root.findAllByType(WorkingStatus);
const 칸말 = () => renderer.root.findAllByType(ItemStatusBadge).map((node) => node.props.state as ItemState);
const 덮개 = () => renderer.root.findAllByType(ItemWorkingOverlay).map((node) => node.props.state as ItemState);
const 성공묶음 = (장수: number) => ({
  ok: true, requested: 장수, succeeded: 장수,
  results: Array.from({ length: 장수 }, (_, i) => ({ sectionId: `s${i}`, ok: true, imageBase64: "BBBB", mimeType: "image/png" })),
});

beforeEach(() => {
  captured.pending.length = 0;
  vi.stubGlobal("window", {
    addEventListener: vi.fn(), removeEventListener: vi.fn(), confirm: () => true,
    scrollTo: vi.fn(), setInterval: vi.fn(() => 1), clearInterval: vi.fn(),
  });
});

afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  vi.unstubAllGlobals();
});

describe("일괄 생성 — 띠와 섹션마다 상태", () => {
  const 시작한다 = async () => {
    await act(async () => { renderer = create(<편집기 start={섹션들(4)} />); });
    await 누른다("이미지 4장 만들기");
  };

  it("**띠 하나가 몇 장째인지·남은 시간을 말한다**", async () => {
    await 시작한다();
    const [하나, ...더] = 띠();
    expect(더, "띠가 둘 이상이다").toHaveLength(0);
    expect(하나.props.label).toBe("4장 만드는 중입니다");
    expect(하나.props.progress).toEqual({ done: 0, total: 4 });
    expect(String(하나.props.remaining)).toMatch(/^약 \d+분 남음$/);
    expect(typeof 하나.props.startedAt).toBe("number");
    // 크레딧 안내는 띠 안에 남는다.
    expect(그려진글()).toContain("성공한 이미지만 차감되며");
  });

  it("**보낸 묶음만 만드는 중, 나머지는 차례 대기**", async () => {
    await 시작한다();
    // gpt-image-2 는 세 장씩 묶는다 — 요청은 그대로다.
    const 첫요청 = captured.pending.filter((call) => call.path === "/pdp/images/batch");
    expect(첫요청).toHaveLength(1);
    expect(JSON.parse(첫요청[0].body).sections).toHaveLength(3);

    expect(칸말()).toEqual(["working", "working", "working", "queued"]);
    expect(덮개()).toEqual(["working", "working", "working", "queued"]);
  });

  it("**한 묶음이 돌아오면 그 섹션은 완료, 다음 묶음이 만드는 중**", async () => {
    await 시작한다();
    await act(async () => { captured.pending[0].resolve(성공묶음(3)); });
    await 가라앉힌다();

    const 둘째 = captured.pending.filter((call) => call.path === "/pdp/images/batch");
    expect(둘째).toHaveLength(2);
    expect(JSON.parse(둘째[1].body).sections).toHaveLength(1);
    expect(칸말()).toEqual(["done", "done", "done", "working"]);
    expect(띠()[0].props.progress).toEqual({ done: 3, total: 4 });
  });

  it("**돌아왔는데 그림이 없는 섹션은 실패로 보인다**", async () => {
    await 시작한다();
    const 일부실패 = { ...성공묶음(3), succeeded: 2 };
    일부실패.results[1] = { sectionId: "s1", ok: false } as never;
    await act(async () => { captured.pending[0].resolve(일부실패); });
    await 가라앉힌다();

    expect(칸말()).toEqual(["done", "failed", "done", "working"]);
  });

  it("**끝나면 띠는 사라지고 결과 요약이 남는다**", async () => {
    await 시작한다();
    await act(async () => { captured.pending[0].resolve(성공묶음(3)); });
    await 가라앉힌다();
    await act(async () => { captured.pending.find((call, i) => i > 0 && call.path === "/pdp/images/batch")!.resolve(성공묶음(1)); });
    await 가라앉힌다();

    expect(띠().filter((node) => String(node.props.label).includes("만드는 중"))).toHaveLength(0);
    expect(그려진글()).toContain("이미지 생성 완료");
    expect(그려진글()).toContain("성공한 이미지만 차감되며");
    expect(칸말()).toEqual(["done", "done", "done", "done"]);
  });

  it("**이어보기에도 섹션마다 덮는다** — 빈 자리까지", async () => {
    await 시작한다();
    const 이어보기 = renderer.root.findAll((node) => node.type === "button" && 글자(node as never) === "이어보기")[0];
    await act(async () => { 이어보기!.props.onClick(); });
    expect(덮개()).toEqual(["working", "working", "working", "queued"]);
  });
});

describe("한 장 다시 만들기 — 편집 화면", () => {
  it("**섹션 목록과 큰 그림 자리가 만드는 중을 보인다**", async () => {
    await act(async () => { renderer = create(<편집기 start={섹션들(2, 2)} />); });
    await 누른다("편집으로");
    await 누른다("이미지 다시 만들기");

    expect(captured.pending.map((call) => call.path)).toContain("/pdp/images");
    expect(띠()).toHaveLength(1);
    expect(띠()[0].props.label).toBe("섹션 1 만드는 중입니다");
    // 섹션 목록 — 도는 섹션만 표시한다. 완료는 동그라미의 체크가 이미 말한다.
    expect(칸말()).toEqual(["working"]);
    // 큰 그림 자리에도 덮는다.
    expect(덮개()).toEqual(["working"]);
  });
});

describe("라이브러리 저장", () => {
  it("**저장하는 동안 단추는 「저장 중…」, 띠가 저장 중이라고 말한다**", async () => {
    let 끝낸다: (ok: boolean) => void = () => {};
    const 저장 = () => new Promise<boolean>((resolve) => { 끝낸다 = resolve; });
    await act(async () => { renderer = create(<편집기 start={섹션들(1, 1)} extra={{ onSaveServerDocument: 저장 }} />); });
    await 누른다("라이브러리에 저장");

    expect(단추("저장 중…")).toHaveLength(1);
    expect(띠().map((node) => node.props.label)).toEqual(["라이브러리에 저장 중입니다"]);

    await act(async () => { 끝낸다(true); });
    await 가라앉힌다();
    expect(띠()).toHaveLength(0);
  });
});

describe("글로 시작 — 구성 시나리오와 대표 이미지", () => {
  it("**구성 시나리오를 기다리는 동안 띠가 뜨고 단추는 「기획 중…」**", async () => {
    await act(async () => {
      renderer = create(
        <TextModeFlow
          attachmentIntents={{} as never}
          onIntentChange={() => {}}
          aspectRatio="3:4"
          outputMode={"image" as never}
          desiredTone=""
          stage="input"
          onStageChange={() => {}}
          onComplete={() => {}}
        />,
      );
    });
    const 입력 = renderer.root.findByType(TextBriefInput);
    await act(async () => { 입력.props.onChange("우리 가게 수제 잼"); });
    await act(async () => { renderer.root.findByType(TextBriefInput).props.onSubmit(); });

    expect(captured.pending.map((call) => call.path)).toContain("/pdp/plan-from-text");
    expect(띠().map((node) => node.props.label)).toEqual(["구성 시나리오 기획 중입니다"]);
    expect(typeof 띠()[0].props.startedAt).toBe("number");
    expect(단추("기획 중…")).toHaveLength(1);
  });

  it("**대표 이미지를 만드는 동안 옛 상자 대신 띠가 말한다**", async () => {
    await act(async () => {
      renderer = create(<KeyVisualGate previewUrl={null} isBusy onApprove={() => {}} onRegenerate={() => {}} onBack={() => {}} />);
    });
    expect(띠().map((node) => node.props.label)).toEqual(["대표 이미지 만드는 중입니다"]);
    expect(그려진글()).not.toContain("대표 이미지를 만드는 중입니다.");

    act(() => renderer.update(<KeyVisualGate previewUrl={null} isBusy={false} onApprove={() => {}} onRegenerate={() => {}} onBack={() => {}} />));
    expect(띠()).toHaveLength(0);
  });
});
