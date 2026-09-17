import { describe, expect, it } from "vitest";
import { buildAttachmentReadPrompt, readAttachments } from "../read-attachment";

/**
 * **붙인 그림을 역할과 무관하게 똑같이 읽는다**(설계 §5-1).
 *
 * 전에는 역할이 읽기를 갈랐다 — 「따라 만들기」면 색·글자만, 「인물 지키기」면
 * 사람만, 「제품 지키기」면 아무도 안 읽었다. **그림을 보기도 전에 고른 버튼
 * 하나가 그 그림에서 배울 수 있는 것을 잘라 버렸다.**
 *
 * 2026-09-17 실측(설계 §2-4)에서 그것이 실물로 드러났다. 손 여섯이 핸드폰으로
 * 인물을 둘러싸 찍는 VOGUE 표지를 붙였는데, 기획은 그 연출을 **볼 방법이 없어**
 * 「배경은 거의 무지에 가깝게」라고 쓰고 「다른 인물 추가」를 금지했다.
 */

/** 시키는 대로 돌려주는 가짜 읽기. */
function reader(byUrl: Record<string, unknown>) {
  const seen: string[] = [];
  return {
    seen,
    async read(input: { prompt: string; imageUrls: string[] }) {
      const url = input.imageUrls[0]!;
      seen.push(url);
      const answer = byUrl[url];
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

const 온전한답 = {
  people: ["왼쪽에서 첫 번째 — 검은 단발, 회색 버킷햇"],
  hasText: true,
  typeInteraction: "가림",
  dominantColor: "아이보리",
  accentColor: "블랙",
  note: "큰 세리프 타이포가 인물 머리를 가로지름",
  staging: "여러 사람의 손이 스마트폰을 들고 인물을 사방에서 둘러싸 촬영",
};

describe("읽기 프롬프트", () => {
  const prompt = buildAttachmentReadPrompt();

  /**
   * **이것이 2026-09-17 회귀의 뿌리였다.**
   *
   * 옛 문법 읽기가 맨 앞에서 「무슨 내용인지는 묻지 않습니다」라고 못 박았다.
   * 그래서 「여러 사람이 핸드폰으로 찍고 있다」가 들어갈 칸이 아예 없었다.
   */
  it("무슨 내용인지 묻지 않는다고 말하지 않는다", () => {
    expect(prompt).not.toContain("무슨 내용인지는 묻지 않습니다");
  });

  it("연출을 묻는다", () => {
    expect(prompt).toContain("staging");
    // 「연출」 한 낱말로는 모호하다. 무엇을 적을지 짚어 준다.
    expect(prompt).toContain("주변에 무엇이 있고");
  });

  it("사람을 왼쪽부터 한 명씩 묻는다", () => {
    expect(prompt).toContain("왼쪽부터 한 명씩");
  });

  /** 옛 `people.ts` 의 교훈. 「모자 없음」이 다른 장의 모자를 막았다. */
  it("「없음」을 적지 말라고 못 박는다", () => {
    expect(prompt).toMatch(/없음.*적지|없다고.*적지/);
  });

  /** 옛 `grammar.ts` 의 교훈. 글자를 넣을지는 붙인 그림이 정한다. */
  it("글자가 있는지 묻는다", () => {
    expect(prompt).toContain("hasText");
  });
});

describe("첨부를 읽는다", () => {
  it("읽은 것을 id 별로 담는다", async () => {
    const fake = reader({ "u1": 온전한답 });
    const result = await readAttachments([{ id: "a", title: "포스터", url: "u1" }], fake);

    expect(result.reads.a?.staging).toContain("스마트폰");
    expect(result.reads.a?.hasText).toBe(true);
    expect(result.reads.a?.typeInteraction).toBe("가림");
  });

  /**
   * **역할을 안 본다.** 이 함수는 역할을 입력으로 받지도 않는다 — 받으면
   * 언젠가 그것으로 가르게 된다.
   */
  it("붙인 것을 하나도 안 빼고 읽는다", async () => {
    const fake = reader({ "u1": 온전한답, "u2": 온전한답, "u3": 온전한답 });
    await readAttachments([
      { id: "a", title: "포스터", url: "u1" },
      { id: "b", title: "인물", url: "u2" },
      { id: "c", title: "모자", url: "u3" },
    ], fake);

    expect(fake.seen).toEqual(["u1", "u2", "u3"]);
  });

  it("한 장이 실패해도 나머지는 계속한다", async () => {
    const fake = reader({ "u1": new Error("504"), "u2": 온전한답 });
    const result = await readAttachments([
      { id: "a", title: "포스터", url: "u1" },
      { id: "b", title: "인물", url: "u2" },
    ], fake);

    expect(result.reads.a).toBeUndefined();
    expect(result.reads.b).toBeDefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("포스터");
  });

  /**
   * **`staging` 이 안 오면 조용히 빈 값이 되면 안 된다.**
   *
   * 이 저장소가 같은 구멍을 두 번 겪었다 — `invented` 가 여섯 번 다 빈 목록으로
   * 왔고, `hasText` 가 안 왔다. 둘 다 프롬프트로 시켰는데 **틀에 칸이 없어서**
   * 였고, 기본값이 있어 아무 데도 안 빨개졌다.
   *
   * `staging` 은 1단계가 더하는 칸 하나다. 이것이 조용히 비면 **1단계를 하고도
   * 아무것도 안 달라진다.**
   */
  it("연출이 안 오면 조용히 넘기지 않는다", async () => {
    const 연출없음 = { ...온전한답 };
    delete (연출없음 as Record<string, unknown>).staging;
    const fake = reader({ "u1": 연출없음 });
    const result = await readAttachments([{ id: "a", title: "포스터", url: "u1" }], fake);

    expect(result.reads.a, "빈 값으로 받아들이면 안 된다").toBeUndefined();
    expect(result.issues).toHaveLength(1);
  });

  /** 모양이 틀린 응답은 **조용히 빈 값이 되면 안 된다.** */
  it("모양이 틀리면 알린다", async () => {
    const fake = reader({ "u1": { 색: "아이보리" } });
    const result = await readAttachments([{ id: "a", title: "포스터", url: "u1" }], fake);

    expect(result.reads.a).toBeUndefined();
    expect(result.issues).toHaveLength(1);
  });
});

describe("기획에 넘기는 모양", () => {
  it("사람을 첨부마다 한 명당 한 줄로 준다", async () => {
    const fake = reader({ "u1": 온전한답 });
    const result = await readAttachments([{ id: "a", title: "인물", url: "u1" }], fake);

    expect(result.people.a).toEqual(["왼쪽에서 첫 번째 — 검은 단발, 회색 버킷햇"]);
  });

  /**
   * **요약에 연출이 들어간다.** 이것이 빠지면 1단계를 해도 기획이 못 본다 —
   * `planReferences` 가 넘기는 것이 이 요약이다.
   */
  it("요약에 연출이 들어간다", async () => {
    const fake = reader({ "u1": 온전한답 });
    const result = await readAttachments([{ id: "a", title: "포스터", url: "u1" }], fake);

    expect(result.summaries.a).toContain("스마트폰");
  });

  it("요약에 색과 글자 관계도 그대로 들어간다", async () => {
    const fake = reader({ "u1": 온전한답 });
    const result = await readAttachments([{ id: "a", title: "포스터", url: "u1" }], fake);

    expect(result.summaries.a).toContain("아이보리");
    expect(result.summaries.a).toContain("가림");
  });

  /** 빈 칸은 요약에 안 넣는다. 「지배색 」 같은 토막이 기획으로 간다. */
  it("빈 칸은 요약에서 뺀다", async () => {
    const fake = reader({
      "u1": { ...온전한답, staging: "", accentColor: "", note: "", typeInteraction: null },
    });
    const result = await readAttachments([{ id: "a", title: "포스터", url: "u1" }], fake);

    expect(result.summaries.a).toBe("지배색 아이보리");
  });
});
