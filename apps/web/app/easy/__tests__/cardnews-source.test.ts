import { describe, expect, it } from "vitest";
import { LONG_TEXT, WEB_OFF, cardSourceLabel, pickCardSource } from "../cardnews-source";

const 켜짐 = { webEnabled: true };

describe("내용 고르기 (2단계 설계 §6)", () => {
  it("유튜브 주소면 자막", () => {
    expect(pickCardSource("이 영상으로 카드뉴스 https://youtu.be/abc123.", 켜짐))
      .toEqual({ ok: true, source: { kind: "youtube", url: "https://youtu.be/abc123" }, label: cardSourceLabel("youtube") });
    expect(pickCardSource("https://www.youtube.com/watch?v=x 정리해줘", 켜짐))
      .toMatchObject({ ok: true, source: { kind: "youtube" } });
  });

  it("다른 주소면 기사", () => {
    expect(pickCardSource("https://news.example.com/a 카드뉴스로", 켜짐))
      .toMatchObject({ ok: true, source: { kind: "web", url: "https://news.example.com/a" } });
  });

  it("기사 주소가 꺼져 있으면 붙여 넣으라고 멈춘다", () => {
    expect(pickCardSource("https://news.example.com/a", { webEnabled: false })).toEqual({ ok: false, message: WEB_OFF });
  });

  it("주소가 없고 길면 그 글로", () => {
    const 긴글 = "가".repeat(LONG_TEXT);
    expect(pickCardSource(긴글, 켜짐)).toMatchObject({ ok: true, source: { kind: "text", text: 긴글 } });
  });

  it("짧으면 인터넷 검색", () => {
    expect(pickCardSource("건강기능식품 고르는 법 카드뉴스", 켜짐))
      .toMatchObject({ ok: true, source: { kind: "question", question: "건강기능식품 고르는 법 카드뉴스" } });
  });

  it("무엇으로 썼는지 한 줄로 알린다", () => {
    expect(cardSourceLabel("question")).toContain("인터넷");
    expect(cardSourceLabel("text")).toContain("글");
  });
});
