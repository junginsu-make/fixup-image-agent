import { describe, expect, it } from "vitest";
import { ingestTopic, stripInlineCitations } from "../adapters/topic";
import { SourceInsufficientContentError } from "../types";

describe("topic research ingestion", () => {
  it("500자 미만의 짧은 조사 결과도 출처가 있으면 보존한다", async () => {
    const document = await ingestTopic({
      id: "short-research",
      topic: "서비스 점검",
      researcher: async () => ({
        text: "공식 점검은 오늘 오후 3시에 종료됩니다.",
        citations: [{ url: "https://example.org/notice", title: "공식 공지" }],
      }),
    });
    expect(document.segments[0]?.text).toContain("오후 3시");
  });

  it("keeps researched text and its source URLs together", async () => {
    // 조사 응답은 인용 위치를 함께 준다(주석의 start_index). 그 위치가 어느 조각에
    // 들어갔는지로 출처를 정한다 — 조각 번호로 돌아가며 붙이지 않는다.
    const first = `보고서 근거 문장입니다. ${"공식 자료를 바탕으로 정리한 내용입니다. ".repeat(50).trim()}`;
    const second = `논문 근거 문장입니다. ${"연구 결과를 바탕으로 정리한 내용입니다. ".repeat(50).trim()}`;
    const text = `${first}\n\n${second}`;
    const document = await ingestTopic({
      id: "research",
      topic: "카드뉴스 접근성",
      researcher: async () => ({
        text,
        citations: [
          { url: "https://example.org/report", title: "공식 보고서", startIndex: 0 },
          { url: "https://example.edu/paper", title: "연구 논문", startIndex: text.indexOf("논문 근거") },
        ],
      }),
    });
    expect(document.kind).toBe("topic");
    expect(document.segments.every((segment) => segment.sourceUrl?.startsWith("https://"))).toBe(true);
    expect(new Set(document.segments.map((segment) => segment.sourceUrl)).size).toBeGreaterThan(1);
  });

  it("마크다운으로 온 조사 결과를 산문으로 바꾸고 문장 한가운데서 끊지 않는다", async () => {
    const section = (index: number) =>
      `## ${index}번 확인 사항\n보증금이 **집값에 비해** 과도하면 위험합니다. ${"실거래가와 공시가격을 함께 비교하는 것이 안전합니다. ".repeat(10).trim()}`;
    const document = await ingestTopic({
      id: "research",
      topic: "월세 계약 전 확인",
      researcher: async () => ({
        text: [1, 2, 3, 4].map(section).join("\n\n---\n\n"),
        citations: [
          { url: "https://example.org/report", title: "공식 보고서" },
          { url: "https://example.edu/paper", title: "연구 논문" },
        ],
      }),
    });

    expect(document.segments.length).toBeGreaterThan(1);
    for (const segment of document.segments) {
      expect(segment.text).not.toContain("#");
      expect(segment.text).not.toContain("**");
      expect(segment.text).not.toContain("---");
      // 조각은 문장 끝에서 닫힌다. 예외는 소제목으로 끝나는 조각뿐이라, 마지막 줄에 문장부호가
      // 아예 없는 경우(=소제목)만 허용한다.
      const lastLine = segment.text.trimEnd().split("\n").at(-1)!;
      expect(/[.!?…]$/.test(lastLine) || !/[.!?…]/.test(lastLine)).toBe(true);
    }
  });
});

describe("stripInlineCitations", () => {
  it("passes ordinary Korean prose with no links through byte-identical", () => {
    const text = "공식 자료를 바탕으로 정리한 충분한 조사 내용입니다. 전세보증금 반환보증(HUG) 가입은 필수입니다.";
    expect(stripInlineCitations(text)).toBe(text);
  });

  it("keeps the number and the sentence, losing only the URL, for an inline citation", () => {
    const text =
      "작년 전세사기 피해 건수는 3,000건입니다 [국토교통부](https://molit.go.kr/Download.do?flSeq=141860969&utm_source=openai) 라고 발표했다.";
    const result = stripInlineCitations(text);
    expect(result).toContain("3,000건");
    expect(result).toContain("작년 전세사기 피해 건수는 3,000건입니다");
    expect(result).toContain("라고 발표했다.");
    expect(result).not.toContain("http");
    expect(result).not.toContain("Download.do");
    expect(result).not.toContain("flSeq");
  });

  it("does not leave stray brackets or double spaces behind", () => {
    const text =
      "1위 지표는 [출처](https://example.com/a) 이며, 2위는 https://example.com/b 참고, ![그래프](https://example.com/c.png) 상승세다.";
    const result = stripInlineCitations(text);
    expect(result).not.toMatch(/[[\]()]/);
    expect(result).not.toMatch(/ {2,}/);
  });

  it("leaves parentheses that are part of real content untouched", () => {
    const text = "전세보증금 반환보증(HUG) 가입 절차를 안내한다.";
    expect(stripInlineCitations(text)).toBe(text);
  });

  it("조각에는 그 조각 안에서 실제로 인용된 출처만 붙는다", async () => {
    // 같은 출처를 두 문단이 연달아 인용하면, 조각 번호로 돌아가며 붙이는 방식은
    // 둘째 문단부터 어긋난다. 실제 인용 위치를 봐야 맞는다.
    const filler = (word: string) => `${word} 관련 사실을 정리한 문장입니다. `.repeat(24).trim();
    const document = await ingestTopic({
      id: "research",
      topic: "출처 짝 맞추기",
      researcher: async () => ({
        text: [
          `보증금 통계는 [주택도시보증공사](https://hug.example/report) 자료다. ${filler("보증금")}`,
          `반환 절차도 [주택도시보증공사](https://hug.example/report) 안내를 따른다. ${filler("반환절차")}`,
          `전세 사기 건수는 [경찰청](https://police.example/stat) 발표다. ${filler("전세사기")}`,
        ].join("\n\n"),
        citations: [
          { url: "https://hug.example/report", title: "주택도시보증공사" },
          { url: "https://police.example/stat", title: "경찰청" },
        ],
      }),
    });

    const 찾기 = (말: string) => document.segments.find((segment) => segment.text.includes(`${말} 관련 사실`))?.sourceUrl;
    expect(찾기("보증금")).toBe("https://hug.example/report");
    expect(찾기("반환절차")).toBe("https://hug.example/report");
    expect(찾기("전세사기")).toBe("https://police.example/stat");
  });

  it("인용이 없는 조각에는 출처를 지어내지 않는다", async () => {
    const document = await ingestTopic({
      id: "research",
      topic: "출처 없는 문단",
      researcher: async () => ({
        // 한 조각에 합쳐지지 않도록 문단을 충분히 길게 둔다(상한 1000자).
        text: [
          `첫 문단만 [공식 발표](https://official.example/notice) 를 인용한다. ${"근거가 있는 문장입니다. ".repeat(50).trim()}`,
          `둘째 문단은 어떤 출처도 인용하지 않는다. ${"출처 없는 문장입니다. ".repeat(50).trim()}`,
        ].join("\n\n"),
        citations: [{ url: "https://official.example/notice", title: "공식 발표" }],
      }),
    });

    const 인용조각 = document.segments.find((segment) => segment.text.includes("근거가 있는 문장"));
    const 무인용조각 = document.segments.find((segment) => segment.text.includes("출처 없는 문장"));
    expect(인용조각?.sourceUrl).toBe("https://official.example/notice");
    expect(무인용조각?.sourceUrl).toBeUndefined();
  });

  it("raises SourceInsufficientContentError when the text is only links", async () => {
    const onlyLinks = "[출처](https://example.com/a?utm_source=openai) ".repeat(5).trim();
    await expect(
      ingestTopic({
        id: "research",
        topic: "카드뉴스 접근성",
        researcher: async () => ({
          text: onlyLinks,
          citations: [{ url: "https://example.com/a?utm_source=openai", title: "출처" }],
        }),
      }),
    ).rejects.toThrow(SourceInsufficientContentError);
  });
});
