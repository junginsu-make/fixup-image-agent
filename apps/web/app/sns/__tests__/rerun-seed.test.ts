import { describe, expect, it } from "vitest";
import type { Attachment } from "@fixup/sns-core";
import { snsSeed } from "../rerun-seed";

/**
 * 카드뉴스도 **지난 단계로 돌아간다.**
 *
 * 이미지 만들기는 01~03 을 누르면 빈 화면으로 보냈고, 카드뉴스는 **아예 못
 * 누르게** 막혀 있었다. 둘 다 「지난 단계를 볼 수 없다」는 같은 불편이다
 * (2026-09-16 사용자 보고).
 *
 * **원래 작업은 안 건드린다.** 고쳐서 만들면 새 작업이 하나 더 생긴다.
 */
const project = {
  title: "가을 소식",
  ratio: "4:5",
  language: "ko" as const,
  modelId: "m-1",
  cardCountMode: "fixed" as const,
  cardCount: 6,
  toneNote: "따뜻하게",
  data: {
    source: { kind: "text" as const, text: "올가을 신제품이 나왔습니다" },
    attachments: [
      { id: "a1", kind: "style_reference", assetPath: "회원A/sns/x/0.png", url: "u1", role: "cover" },
      { id: "a2", kind: "keep_identity", assetPath: "회원A/sns/x/1.png", url: "u2", subject: "person" },
    ] as Attachment[],
    attachmentIntents: { cover: "표지는 크게", body: "", ending: "" },
    look: "illustration" as const,
    userInstruction: "글자 크게",
  },
};

describe("snsSeed — 내 작업", () => {
  it("그때 쓴 값을 그대로 들고 간다", () => {
    const seed = snsSeed(project, true);

    expect(seed.title).toBe("가을 소식");
    expect(seed.toneNote).toBe("따뜻하게");
    expect(seed.source).toEqual({ kind: "text", text: "올가을 신제품이 나왔습니다" });
    expect(seed.spec).toMatchObject({
      ratio: "4:5",
      language: "ko",
      modelId: "m-1",
      cardCountMode: "fixed",
      cardCount: 6,
      look: "illustration",
      userInstruction: "글자 크게",
    });
    expect(seed.intents).toEqual({ cover: "표지는 크게", body: "", ending: "" });
  });

  it("붙였던 그림을 그대로 들고 간다", () => {
    const seed = snsSeed(project, true);

    expect(seed.attachments).toHaveLength(2);
    expect(seed.attachments[0]).toMatchObject({ id: "a1", role: "cover" });
    expect(seed.droppedAttachments).toBe(0);
  });
});

describe("snsSeed — 남의 작업", () => {
  /**
   * **남의 그림은 못 들고 온다.**
   *
   * 첨부는 `assetPath` 로 저장되는데 그 경로의 첫 칸이 **원래 회원의 id** 다
   * (버킷 정책이 첫 칸으로 소유자를 판정한다). 그대로 실어 새 작업을 만들면
   * 남의 파일을 가리키는 내 작업이 되고, 그 회원이 지우면 내 것도 같이
   * 사라진다 — 복사 규칙이 막으려던 바로 그 깨짐이다.
   *
   * 그래서 빼고, **몇 장을 못 들고 왔는지 말한다.**
   */
  it("첨부를 빼고 센다", () => {
    const seed = snsSeed(project, false);

    expect(seed.attachments).toEqual([]);
    expect(seed.droppedAttachments).toBe(2);
  });

  it("글과 설정은 그대로 들고 온다", () => {
    // 글은 경로가 아니라 값이다. 들고 와도 남의 파일을 가리키지 않는다.
    const seed = snsSeed(project, false);

    expect(seed.source).toEqual({ kind: "text", text: "올가을 신제품이 나왔습니다" });
    expect(seed.spec.ratio).toBe("4:5");
    expect(seed.toneNote).toBe("따뜻하게");
  });
});

describe("snsSeed — 옛 작업", () => {
  const 옛것 = {
    title: "옛 작업",
    ratio: "1:1",
    language: "ko" as const,
    modelId: "m-old",
    cardCountMode: "auto" as const,
    data: { source: { kind: "text" as const, text: "글" }, attachments: [] },
  };

  it("없는 칸은 기본값으로 읽는다", () => {
    const seed = snsSeed(옛것, true);

    expect(seed.spec.look).toBe("auto");
    expect(seed.spec.userInstruction).toBe("");
    expect(seed.toneNote).toBe("");
    expect(seed.intents).toEqual({ cover: "", body: "", ending: "" });
    expect(seed.spec.cardCount).toBeUndefined();
  });

  it("글이 없어도 넘어지지 않는다", () => {
    const seed = snsSeed({ ...옛것, data: { attachments: [] } } as never, true);

    expect(seed.source).toEqual({ kind: "text", text: "" });
    expect(seed.attachments).toEqual([]);
  });
});
