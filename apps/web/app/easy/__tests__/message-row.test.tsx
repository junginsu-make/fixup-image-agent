import { readFileSync } from "node:fs";
import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({ default: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => <a {...props}>{children}</a> }));
vi.mock("../_components/cardnews-card", () => ({ EasyCardnewsCard: () => null }));
vi.mock("../../_components/elapsed-time", () => ({ ElapsedTime: () => null }));

import { EasyMessageRow } from "../_components/message";
import { AD_CHOICE_IMAGE, AD_CHOICE_SPECS, AD_QUESTION, adGuideBody } from "../ad-ask";
import { askBody, sayBody, withPick } from "../row-marks";

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

  it("마지막 줄이고 보내는 중이 아닐 때만 단추를 넘기고, 누르면 그 글을 새 말로 보낸다", () => {
    expect(화면).toContain(
      "onAdChoice={message.id === shown[shown.length - 1]?.id && !turn.busy ? (answer) => void send(undefined, answer) : undefined}",
    );
    expect(화면).toContain("const prompt = 다시?.prompt ?? 말답?.prompt ?? 친말 ?? draft.trim();");
  });

  it("단추로 보낸 턴이 실패해도 단추 글을 입력창에 넣지 않는다", () => {
    expect(화면).toContain("if (!친말 && (cause as Error)?.message !== STILL_MAKING) setDraft(prompt);");
    expect(화면).not.toMatch(/\n\s*setDraft\(prompt\);/);
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
