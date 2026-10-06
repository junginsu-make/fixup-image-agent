import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => <a {...props}>{children}</a> }));
vi.mock("../_components/cardnews-card", () => ({ EasyCardnewsCard: () => null }));
vi.mock("../../_components/elapsed-time", () => ({ ElapsedTime: () => null }));
vi.mock("../_components/reference-ask", () => ({ EasyReferenceAsk: () => null }));

import { EasyMessageRow } from "../_components/message";
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_QUESTION, adGuideBody } from "../ad-ask";
import { askBody, sayBody, withPick } from "../row-marks";
import { EasyAskControls } from "../_components/ask-row";
import { KIND_REPLY_TEXT } from "../ask-answers";
import { EASY_DEFAULT_RATIO } from "../ask";

const 글자 = (node: unknown): string => typeof node === "string"
  ? node
  : node && typeof node === "object" && "children" in node
    ? ((node as { children: unknown[] }).children ?? []).map(글자).join("")
    : "";

let view: ReactTestRenderer;
const 글 = (): string => JSON.stringify(view.toJSON());
afterEach(() => { act(() => view?.unmount()); });

describe("그림 줄 (B3 · B5)", () => {
  it("못 받은 줄은 「만들고 있습니다」 대신 까닭을 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} failed="내용 검사에 걸렸습니다." />); });
    expect(글()).toContain("내용 검사에 걸렸습니다.");
    expect(글()).not.toContain("이미지를 만들고 있습니다");
  });

  it("실패가 아니면 지금처럼 만드는 중이다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "i1", role: "image", body: "", workId: "p1" }} />); });
    expect(글()).toContain("이미지를 만들고 있습니다");
  });
});

describe("광고 물음 · 안내 줄 (A5)", () => {
  const 물음 = { id: "q", role: "assistant" as const, body: AD_QUESTION };

  it("단추를 넘기면 두 단추를 달고, 누르면 그 글을 보낸다", () => {
    const onAdChoice = vi.fn();
    act(() => { view = create(<EasyMessageRow message={물음} onAdChoice={onAdChoice} />); });
    const 단추 = view.root.findAllByType("button");
    expect(단추.map(글자)).toEqual([AD_CHOICE_IMAGE, AD_CHOICE_SPECS]);
    act(() => { 단추[1]!.props.onClick(); });
    expect(onAdChoice).toHaveBeenCalledWith(AD_CHOICE_SPECS);
  });

  /** Review Focus 1 — 지난 물음 · 보내는 중에는 단추가 없다. */
  it("단추를 안 넘기면 물음 글만 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={물음} />); });
    expect(view.root.findAllByType("button")).toHaveLength(0);
    expect(글()).toContain("규격별로 이미지를 베리에이션하고 싶으세요?");
  });

  it("안내 줄은 표시를 떼고 보이고 「광고소재 열기」를 /ad 로 단다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "g", role: "assistant", body: adGuideBody("「광고소재」에서 합니다.") }} />); });
    expect(글()).toContain("「광고소재」에서 합니다.");
    expect(글()).not.toContain("ad-guide:");
    const 고리 = view.root.findByType("a");
    expect(고리.props.href).toBe("/ad");
    expect(글자(고리)).toBe("광고소재 열기");
  });
});

describe("화면이 마지막 물음에만 단추를 단다 (Review Focus 1)", () => {
  const 화면 = readFileSync(new URL("../easy-client.tsx", import.meta.url), "utf8");

  /**
   * 지금 답할 수 있는 물음 줄(서버가 받아 줄 줄 — `answerableAskId`)이고 보내는 중이 아닐 때만. 단추 답이
   * 실패한 짝 바로 앞의 물음 줄도 다시 단다(2차 최종 리뷰 2) — 실패한 뒤 같은 단추를 다시 누를 수 있다.
   */
  it("지금 답할 수 있는 물음 줄이고 보내는 중이 아닐 때만 단추를 넘긴다 — 광고 단추 · 물음 줄 단추 둘 다", () => {
    expect(화면).toContain("const 답할물음 = answerableAskId(shown);");
    expect(화면).toContain(
      "onAdChoice={message.id === 답할물음 && !turn.busy ? (answer) => void send({ text: answer }) : undefined}",
    );
    expect(화면).toMatch(/askControls=\{message\.id === 답할물음 && !turn\.busy \? \(/);
  });

  it("처음 말을 다시 보내지 않고 물음 줄 id 와 고른 값만 싣는다 (2차 D1)", () => {
    expect(화면).toContain("...(단추 ? { answersRowId: 단추.answersRowId, pick: 단추.pick } : {}),");
    expect(화면).not.toContain("carryChoices");
    expect(화면).not.toContain("kindPicked");
  });

  /** 화면의 사용자 줄도 고른 값을 들어야 그 자리에서 실패했을 때 [물음, 단추 답] 을 알아본다(2차 최종 리뷰 2). */
  it("단추로 보낸 사용자 줄은 고른 값 표시를 붙여 든다 — 보일 때는 뗀다", () => {
    expect(화면).toContain('role: "user", body: 단추 ? withPick(prompt, 단추.pick) : prompt');
  });

  /** 2차 최종 리뷰 8 — 사진 고르기가 열린 채 친 말은 그 물음의 답이다(입력창 안내와 같다). */
  it("사진 고르기가 열린 채 말로 치면 그 물음 줄 id · 고른 쓰임과 함께 답으로 보낸다", () => {
    expect(화면).toContain("!보낼것 && asks.photo ? photoTypedReply(asks.photo.rowId, asks.photo.state, prompt) : undefined");
  });

  it("단추로 보낸 턴이 실패해도 단추 글을 입력창에 넣지 않는다", () => {
    expect(화면).toContain("if (!보낼것 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);");
    expect(화면).not.toMatch(/\n\s*setDraft\(prompt\);/);
  });
});

describe("물음 줄의 단추 · 고르기 (2차 D1)", () => {
  const 고르기 = {
    ratio: "", look: "", photo: null, referenceRowId: null,
    setRatio: vi.fn(), setLook: vi.fn(), open: vi.fn(), close: vi.fn(), pickPhoto: vi.fn(), dropPhoto: vi.fn(),
  };
  const 그린다 = (message: { id: string; role: "assistant"; body: string }, onAnswer: (reply: unknown) => void) => (
    <EasyMessageRow
      message={message}
      askControls={<EasyAskControls message={message} asks={고르기 as never} attachments={[]} library={{} as never} onAttach={vi.fn()} onAnswer={onAnswer} />}
    />
  );

  it("갈래 물음 줄은 문장 밑에 두 단추를 달고, 누르면 줄 id 와 고른 갈래를 보낸다", () => {
    const onAnswer = vi.fn();
    const 물음 = { id: "q1", role: "assistant" as const, body: askBody("kind", "한 장으로 만들까요?", { ids: [] }) };
    act(() => { view = create(그린다(물음, onAnswer)); });
    expect(글()).toContain("한 장으로 만들까요?");
    const 단추 = view.root.findAllByType("button");
    expect(단추.map(글자)).toEqual([KIND_REPLY_TEXT.image, KIND_REPLY_TEXT.cardnews]);
    act(() => { 단추[1]!.props.onClick(); });
    expect(onAnswer).toHaveBeenCalledWith({ text: KIND_REPLY_TEXT.cardnews, answersRowId: "q1", pick: { kind: "cardnews" } });
  });

  it("다시 연 모양 물음 줄은 토글과 「이대로 만들기」가 그대로 나온다", () => {
    const onAnswer = vi.fn();
    const 물음 = { id: "q2", role: "assistant" as const, body: askBody("ratio", "어떤 모양으로 만들까요?", { wants: "image" }) };
    act(() => { view = create(그린다(물음, onAnswer)); });
    const 만들기 = view.root.findAllByType("button").find((one) => 글자(one) === "이대로 만들기")!;
    act(() => { 만들기.props.onClick(); });
    expect(onAnswer).toHaveBeenCalledWith({ text: "이대로 만들기", answersRowId: "q2", pick: { ratio: EASY_DEFAULT_RATIO } });
  });

  it("다시 연 사진 물음 줄은 고르기 없이 문장만 보인다 — 말로 이어 답한다", () => {
    const 물음 = { id: "q3", role: "assistant" as const, body: askBody("photo", "사진을 어떻게 쓸지 알려 주세요.", { ids: ["a"] }) };
    act(() => { view = create(그린다(물음, vi.fn())); });
    expect(글()).toContain("사진을 어떻게 쓸지 알려 주세요.");
    expect(view.root.findAllByType("button")).toHaveLength(0);
  });
});

describe("표시를 뗀 글 (2차 §3-0)", () => {
  it("단추 답 줄은 고른 값 표시 없이 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "u", role: "user", body: withPick("이미지 한 장", { kind: "image" }) }} />); });
    expect(글()).toContain("이미지 한 장");
    expect(글()).not.toContain(";pick=");
  });

  it("머리말 줄 · 물음 줄은 표시 없이 보인다", () => {
    act(() => { view = create(<EasyMessageRow message={{ id: "s", role: "assistant", body: sayBody("만들겠습니다.") }} />); });
    expect(글()).toContain("만들겠습니다.");
    expect(글()).not.toContain("say:");
    act(() => { view.update(<EasyMessageRow message={{ id: "q", role: "assistant", body: askBody("ratio", "어떤 모양으로 만들까요?") }} />); });
    expect(글()).toContain("어떤 모양으로 만들까요?");
    expect(글()).not.toContain("ask:");
  });
});
