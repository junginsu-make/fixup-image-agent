import { describe, expect, it } from "vitest";
import {
  ASK_CARD_NUMBER, NOT_MADE_YET, STILL_GENERATING, archiveTitle, captionText, cardAt, cardEditPrompt, downloadList, hasOwnImage,
  isGenerating, isMade, readCardEdit,
} from "../cardnews-after";

/**
 * **만든 카드뉴스 손보기의 판단**(3단계 설계 §3 · §6). 화면과 서버가 같은 값을 쓴다.
 */

const 장 = (index: number, over: Record<string, unknown> = {}) =>
  ({ index, role: "body", kind: "generated", copy: { headline: `h${index}`, body: `b${index}` }, status: "pending", ...over });
const 작업 = (cards: unknown[], status = "ready") => ({ title: "거북목", status, language: "ko", data: { flow: { cards } } }) as never;

describe("만든 작업 (3단계 §3)", () => {
  /** Review Focus 1: 글을 고치면 상태가 copy_ready 로 돌아와도 만든 작업이다. */
  it("그림이 한 장이라도 있으면 상태와 상관없이 만든 작업", () => {
    expect(isMade(작업([장(1, { status: "done" }), 장(2)], "copy_ready"))).toBe(true);
    expect(isMade(작업([장(1, { assetPath: "u/sns/p/1.png" })], "copy_ready"))).toBe(true);
    expect(isMade(작업([장(1, { status: "failed" })]))).toBe(true);
    expect(isMade(작업([장(1), 장(2)], "copy_ready"))).toBe(false);
  });

  it("장 번호로 찾는다, 없는 번호는 없다", () => {
    expect(cardAt(작업([장(1), 장(2)]), 2)?.index).toBe(2);
    expect(cardAt(작업([장(1)]), 9)).toBeUndefined();
    expect(cardAt(작업([장(1)]), 0)).toBeUndefined();
  });
});

describe("보관 이름", () => {
  it("작업 제목 · 번호 · 이전 그림", () => {
    expect(archiveTitle("거북목", 3)).toBe("거북목 · 3번 장 이전 그림");
    expect(archiveTitle("", 1)).toBe("카드뉴스 · 1번 장 이전 그림");
  });
});

describe("한 장 글 고치기 (3단계 §6-2)", () => {
  it("그 장 글과 말을 주고, 앞 글에 없는 사실을 넣지 말라고 한다", () => {
    const prompt = cardEditPrompt(작업([장(1), 장(3, { copy: { headline: "뒷면", body: "본문", accent: "강조" } })]), 3, "제목을 더 짧게");
    expect(prompt).toContain("뒷면");
    expect(prompt).toContain("강조");
    expect(prompt).toContain("제목을 더 짧게");
    expect(prompt).toContain("없는 사실");
  });

  it("받은 글은 다듬고, 빈 칸은 안 바꾼 것으로 본다", () => {
    expect(readCardEdit({ headline: " 새 제목 ", body: "", accent: "", footnote: "" })).toEqual({ headline: "새 제목" });
    expect(readCardEdit({ headline: "", body: "", accent: "", footnote: "" })).toBeUndefined();
    expect(readCardEdit(null)).toBeUndefined();
  });
});

describe("받기 · 게시글", () => {
  it("그림이 있는 장만 받는다", () => {
    const view = { cards: [{ index: 1, url: "a" }, { index: 2 }, { index: 3, url: "c" }] } as never;
    expect(downloadList(view)).toEqual([{ index: 1, url: "a" }, { index: 3, url: "c" }]);
  });

  it("게시글은 첫 문장 · 본문 · 해시태그 · 첫 댓글 차례로 이어 복사한다", () => {
    expect(captionText({ hook: "훅", body: "본문", hashtags: ["#a", "b"], firstComment: "댓글" }))
      .toBe("훅\n\n본문\n\n#a #b\n\n첫 댓글: 댓글");
  });

  it("안내 말", () => {
    expect(NOT_MADE_YET).toContain("이대로 만들기");
    expect(ASK_CARD_NUMBER).toContain("몇 번");
  });
});

describe("붙인 사진 칸은 만든 그림이 아니다 (독립 리뷰 Critical)", () => {
  /** 기획이 원본 그대로 · 마지막 장 사진 칸에 원고 단계부터 사진 경로를 넣는다(`lib/sns/actual-flow.ts:101-105`). */
  it("원본 그대로 · 마지막 장 사진이 있는 원고는 만든 작업이 아니다", () => {
    const 원고 = 작업([
      장(1, { role: "cover" }),
      장(2, { kind: "place_as_is", assetPath: "u/references/a.png" }),
      장(3, { role: "ending", kind: "ending_image", assetPath: "u/references/b.png" }),
    ], "copy_ready");
    expect(isMade(원고)).toBe(false);
  });

  it("AI 가 그린 장의 그림만 제 그림이다", () => {
    expect(hasOwnImage(장(1, { status: "done", assetPath: "u/sns/p/1.png" }))).toBe(true);
    expect(hasOwnImage(장(2, { kind: "place_as_is", assetPath: "u/references/a.png" }))).toBe(false);
    expect(hasOwnImage(장(3))).toBe(false);
  });
});

describe("만드는 중 (독립 리뷰 Important 3 · 4)", () => {
  it("작업이나 어느 장이 만드는 중이면 만드는 중", () => {
    expect(isGenerating(작업([장(1, { status: "done" })], "generating"))).toBe(true);
    expect(isGenerating(작업([장(1, { status: "done" }), 장(2, { status: "generating" })], "ready"))).toBe(true);
    expect(isGenerating(작업([장(1, { status: "done" })], "ready"))).toBe(false);
  });

  it("안내 말", () => { expect(STILL_GENERATING).toContain("만드는 중"); });
});
