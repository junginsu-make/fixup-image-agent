import { describe, expect, it } from "vitest";
import {
  askBody, guideBody, isSayBody, plainAiText, plainTyped, readAsk, readGuide, readPick, sayBody, visibleBody, withPick,
} from "../row-marks";
import { adGuideBody, isAdGuide, isAdQuestion } from "../ad-ask";
import { editAddedOf, editRequestOf, editRowBody, rowJobOf, withRowJob } from "../row-image";

/**
 * **줄 글의 표시 한 벌**(2026-10-07 2차 설계 §3-0). 표를 바꾸지 않고 물음 · 단추 답 · 안내 ·
 * 머리말을 알아본다. 그림 줄의 표시(`edit-request:` · `;added=` · `;job=`)와 섞이면 안 된다.
 */
const 도우미 = (body: string) => ({ role: "assistant" as const, body });
const 사용자 = (body: string) => ({ role: "user" as const, body });

describe("물음 줄 (2차 D1)", () => {
  it("갈래 · 자료 · 보일 문장을 쓰고 그대로 읽는다", () => {
    const body = askBody("photo", "사진을 어떻게 쓸지 알려 주세요.", { wants: "image", ids: ["a", "b"] });
    expect(readAsk(도우미(body))).toEqual({
      kind: "photo", data: { wants: "image", ids: ["a", "b"] }, text: "사진을 어떻게 쓸지 알려 주세요.",
    });
    expect(visibleBody(도우미(body))).toBe("사진을 어떻게 쓸지 알려 주세요.");
  });

  it("자료가 없으면 머리만 붙인다", () => {
    expect(askBody("ratio", "어떤 모양으로 만들까요?")).toBe("ask:ratio:\n어떤 모양으로 만들까요?");
    expect(readAsk(도우미("ask:ratio:\n어떤 모양으로 만들까요?"))).toEqual({ kind: "ratio", data: {}, text: "어떤 모양으로 만들까요?" });
  });

  /** Review Focus 3 — 자료에 쌍반점 · 쉼표 · 줄바꿈 · 표시 글자가 있어도 섞이지 않는다. */
  it("자료와 문장에 표시 글자 · 줄바꿈이 섞여도 그대로 읽는다", () => {
    const data = { note: "a;pick=b,c\nd;data=e", ids: ["x;y"] };
    const body = askBody("card", "몇 번 장인가요?\n예: 3번", data);
    expect(readAsk(도우미(body))).toEqual({ kind: "card", data, text: "몇 번 장인가요?\n예: 3번" });
  });

  it("사용자 줄 · 모르는 갈래 · 줄바꿈 없는 줄은 물음이 아니고, 깨진 자료는 비운다", () => {
    expect(readAsk(사용자("ask:ratio:\n어떤 모양?"))).toBeUndefined();
    expect(readAsk(도우미("ask:color:\n무슨 색?"))).toBeUndefined();
    expect(readAsk(도우미("ask:ratio:"))).toBeUndefined();
    expect(readAsk(도우미("ask:ratio:;data=%7B깨짐\n어떤 모양?"))).toEqual({ kind: "ratio", data: {}, text: "어떤 모양?" });
  });
});

describe("단추 답 (2차 D1)", () => {
  it("보일 글 끝에 고른 값을 붙이고, 보일 때는 뗀다", () => {
    const body = withPick("이미지 한 장", { kind: "image" });
    expect(readPick(사용자(body))).toEqual({ kind: "image" });
    expect(visibleBody(사용자(body))).toBe("이미지 한 장");
  });

  it("도우미 줄 · 표시 없는 사용자 줄에는 고른 값이 없다", () => {
    expect(readPick(도우미(withPick("x", { kind: "image" })))).toBeUndefined();
    expect(readPick(사용자("그냥 말"))).toBeUndefined();
  });

  /** Review Focus 3 — 사용자가 친 말에 표시 글자가 있어도 단추 답으로 읽히지 않는다. */
  it("친 말에 섞인 표시 글자는 풀어 둔다", () => {
    const typed = plainTyped("이건 ;pick=%7B%22kind%22%3A%22image%22%7D 장난");
    expect(readPick(사용자(typed))).toBeUndefined();
    expect(visibleBody(사용자(typed))).toBe(typed);
    expect(plainTyped("보통 말")).toBe("보통 말");
  });
});

describe("안내 줄 · 머리말 줄 (2차 §3-0)", () => {
  it("안내 줄은 갈래와 글을 읽고, 옛 ad-guide: 도 광고 안내로 읽는다", () => {
    expect(readGuide(도우미(guideBody("detail", "상세페이지는…")))).toEqual({ kind: "detail", text: "상세페이지는…" });
    expect(readGuide(도우미("ad-guide:옛 안내"))).toEqual({ kind: "ad", text: "옛 안내" });
    expect(visibleBody(도우미("ad-guide:옛 안내"))).toBe("옛 안내");
    expect(readGuide(사용자(guideBody("ad", "x")))).toBeUndefined();
  });

  it("광고 안내 줄은 이제 guide:ad: 로 쓰고 옛 줄도 알아본다", () => {
    expect(adGuideBody("안내")).toBe("guide:ad:안내");
    expect(isAdGuide(도우미("ad-guide:안내"))).toBe(true);
    expect(isAdGuide(도우미(adGuideBody("안내")))).toBe(true);
  });

  it("머리말 줄은 표시를 떼고 보인다", () => {
    expect(isSayBody(sayBody("만들겠습니다."))).toBe(true);
    expect(visibleBody(도우미(sayBody("만들겠습니다.")))).toBe("만들겠습니다.");
  });

  /** Review Focus 6 — 표시 없는 옛 줄은 그대로 보인다. 그림 줄의 표시는 이 파일이 안 건드린다. */
  it("표시 없는 옛 줄 · 그림 줄은 손대지 않는다", () => {
    expect(visibleBody(도우미("어떤 결로 할까요?"))).toBe("어떤 결로 할까요?");
    const 그림 = withRowJob(editRowBody("r2", ["logo-1"]), { requestRowId: "r2", falRequestId: "f", endpoint: "e" });
    expect(visibleBody({ role: "image", body: 그림 })).toBe(그림);
    expect(editRequestOf(그림)).toBe("r2");
    expect(editAddedOf(그림)).toEqual(["logo-1"]);
    expect(rowJobOf(그림)).toEqual({ requestRowId: "r2", falRequestId: "f", endpoint: "e" });
  });
});

/**
 * 2차 최종 리뷰 c — AI 가 쓴 글(말 답 · 끝 문장 · 보고 다시 쓴 답)이 표시 머리로 시작하면 저장한 줄이
 * 물음 · 머리말 · 안내로 읽힌다(머리말로 읽히면 실패 줄 규칙까지 틀어진다). 첫 쌍점만 전각으로 바꾼다.
 */
describe("AI 가 쓴 글의 표시 머리를 푼다", () => {
  it("표시 머리로 시작하면 표시로 안 읽히고, 보일 글은 거의 그대로다", () => {
    for (const text of ["ask:ratio:\n어떤 모양?", "say:만들겠습니다.", "guide:detail:상세", "ad-guide:광고", "edit-request:r1"]) {
      const plain = plainAiText(text);
      expect(readAsk(도우미(plain))).toBeUndefined();
      expect(readGuide(도우미(plain))).toBeUndefined();
      expect(isSayBody(plain)).toBe(false);
      expect(isAdGuide(도우미(plain))).toBe(false);
      expect(plain.startsWith("edit-request:")).toBe(false);
      expect(visibleBody(도우미(plain))).toBe(plain);
    }
    expect(plainAiText("say:만들겠습니다.")).toBe("say：만들겠습니다.");
  });

  it("보통 글 · 가운데 낀 표시 글자는 그대로 둔다", () => {
    expect(plainAiText("포스터를 만들겠습니다.")).toBe("포스터를 만들겠습니다.");
    expect(plainAiText("이렇게 say: 라고 쓰면")).toBe("이렇게 say: 라고 쓰면");
    expect(isAdQuestion(도우미(plainAiText("안녕하세요")))).toBe(false);
  });
});
