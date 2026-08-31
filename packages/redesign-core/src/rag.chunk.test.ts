import { describe, expect, it } from "vitest";
import { chunkText } from "./rag.js";

const 원칙문서 = [
  "# 판매 원칙",
  "",
  "## 대상이 좁을수록 잘 팔린다",
  "",
  '"누구나 쓸 수 있습니다"는 아무도 자기 얘기로 읽지 않는다.',
  "대상을 좁히면 그 사람에게는 훨씬 강하게 꽂힌다.",
  "나쁜 예: 건강을 생각하는 모든 분께",
  "좋은 예: 아침을 거르고 출근하는 30대 직장인",
  "",
  "## 반론을 피하면 그 자리에서 이탈한다",
  "",
  "사는 쪽으로 거의 왔다가 멈추는 이유는 대개 정해져 있다.",
  "비싸다 / 나한테도 될까 / 실패하면 어쩌지.",
  "",
  "| 반론 | 다루는 방식 |",
  "|---|---|",
  "| 비싸다 | 가격을 감추지 말고 왜 그 값인지 설명한다 |",
].join("\n");

describe("문서 구조에 따른 청크 나누기", () => {
  const chunks = chunkText(원칙문서, "판매 원칙");

  // 1400자로만 자르면 여러 주제가 한 조각에 섞인다. 섞인 조각의 임베딩은
  // 무엇과도 강하게 맞지 않아, "반론"을 물어도 엉뚱한 조각이 나온다.
  it("제목 단위로 나뉜다", () => {
    expect(chunks).toHaveLength(2);
  });

  it("각 조각이 자기 주제만 담는다", () => {
    const 대상 = chunks.find((c) => c.content.includes("좁을수록"))!;
    expect(대상.content).toContain("30대 직장인");
    expect(대상.content).not.toContain("비싸다");
  });

  // 조각만 떼어놓고 임베딩하므로, 제목이 없으면 무엇에 관한 글인지 알 수 없다.
  it("제목을 조각 안에 남긴다", () => {
    expect(chunks[1].content).toContain("반론을 피하면");
  });

  // 표와 목록은 줄바꿈이 사라지면 뜻을 잃는다.
  it("줄바꿈을 뭉개지 않는다", () => {
    expect(chunks[1].content).toContain("\n");
    expect(chunks[1].content).toContain("| 비싸다 |");
  });

  it("번호를 0부터 차례로 매긴다", () => {
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1]);
    expect(chunks.every((c) => c.sourceName === "판매 원칙")).toBe(true);
  });
});

describe("제목이 없는 문서", () => {
  // 리디자인 지식은 상세페이지를 전사한 텍스트라 제목이 없다.
  // 그때는 예전처럼 크기로 자른다.
  it("크기 기준으로 나뉜다", () => {
    const 전사본 = "가".repeat(3000);
    const chunks = chunkText(전사본, "전사본");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].content.length).toBeLessThanOrEqual(1400);
  });

  it("짧은 문서는 한 조각", () => {
    const chunks = chunkText("나".repeat(300), "짧은 글");
    expect(chunks).toHaveLength(1);
  });
});

describe("경계 상황", () => {
  it("빈 문서는 조각이 없다", () => {
    expect(chunkText("", "빈 글")).toEqual([]);
    expect(chunkText("   \n\n  ", "공백")).toEqual([]);
  });

  // 임베딩 한 건당 비용이 든다. 너무 짧은 조각은 검색에도 도움이 안 된다.
  it("너무 짧은 조각은 버린다", () => {
    const 문서 = ["## 가", "짧다", "", "## 나", "다".repeat(200)].join("\n");
    const chunks = chunkText(문서, "혼합");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toContain("나");
  });

  it("아주 긴 절은 더 잘라낸다", () => {
    const 문서 = ["## 긴 절", "라".repeat(4000)].join("\n");
    const chunks = chunkText(문서, "긴 문서");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 1400)).toBe(true);
  });

  it("조각 수에 상한이 있다", () => {
    const 문서 = Array.from({ length: 200 }, (_, i) => `## 절 ${i}\n${"마".repeat(200)}`).join("\n\n");
    expect(chunkText(문서, "아주 긴 문서").length).toBeLessThanOrEqual(80);
  });
});
