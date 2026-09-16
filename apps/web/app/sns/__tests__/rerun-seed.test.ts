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

  it("팀원 것은 첨부를 살린다", () => {
    /*
      **팀원의 작업은 `mine` 이 참이다.** 회원용 길이 성공했다는 것은 내 것이거나
      같은 팀이라는 뜻이고, 참고 이미지 목록도 팀 범위라 그 첨부는 내가 고를 수
      있는 것이다(`rerun-seed.ts` 머리말). 빼면 팀 기능을 되돌리는 셈이다.

      관리자 통로로 온 것만 `mine` 이 거짓이다 — 그건 팀 밖이라 목록에도 없다.
    */
    expect(snsSeed(project, true).attachments).toHaveLength(2);
    expect(snsSeed(project, false).attachments).toHaveLength(0);
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

/**
 * **원본 글은 네 종류다.**
 *
 * 글·유튜브·웹·질문(`_components/source-input.tsx` 의 `SourceDraft`). 전부
 * 「글」로 만들면 유튜브로 시작한 작업이 **빈 칸**으로 돌아온다 — 고치려던
 * 「다 초기화된다」와 똑같은 일이 다른 자리에서 일어난다.
 */
describe("snsSeed — 원본 글의 종류", () => {
  const 작업 = (source: unknown) =>
    snsSeed({ title: "t", data: { source } } as never, true).source;

  it("유튜브는 유튜브로 돌아온다", () => {
    expect(작업({ kind: "youtube", url: "https://youtu.be/abc" }))
      .toEqual({ kind: "youtube", url: "https://youtu.be/abc" });
  });

  it("웹 주소는 웹으로 돌아온다", () => {
    expect(작업({ kind: "web", url: "https://example.test/글" }))
      .toEqual({ kind: "web", url: "https://example.test/글" });
  });

  it("질문은 질문으로 돌아온다", () => {
    expect(작업({ kind: "question", question: "가을에 뭘 팔까요" }))
      .toEqual({ kind: "question", question: "가을에 뭘 팔까요" });
  });

  it("글은 글로 돌아온다", () => {
    expect(작업({ kind: "text", text: "올가을 신제품" }))
      .toEqual({ kind: "text", text: "올가을 신제품" });
  });

  it("모르는 종류는 빈 글로 떨어진다", () => {
    /*
      새 종류가 생겼는데 여기를 안 고쳤거나, 값이 망가진 경우다. 넘어지는
      대신 빈 글로 열어 사용자가 직접 채울 수 있게 한다.
    */
    expect(작업({ kind: "새것", 뭔가: "값" })).toEqual({ kind: "text", text: "" });
    expect(작업(null)).toEqual({ kind: "text", text: "" });
    expect(작업({ kind: "youtube" })).toEqual({ kind: "text", text: "" });
  });
});

/**
 * **관리자가 다른 회원의 카드뉴스를 다시 만들 때 첨부를 복사해 온다.**
 *
 * 남의 첨부는 경로 첫 칸이 그 회원 id 라 그대로 못 싣는다. 관리자 라이브러리로
 * 복사한 것만 **복사본의 id·경로·주소로 바꿔서** 싣는다.
 */
describe("snsSeed — 관리자가 복사해 온 첨부", () => {
  const 복사본 = [
    { from: "a1", id: "내a1", storagePath: "관리자/references/내a1.png", url: "signed:내a1" },
  ];

  it("복사한 첨부는 복사본으로 바꿔 싣는다", () => {
    const seed = snsSeed(project, false, 복사본);

    expect(seed.attachments).toHaveLength(1);
    expect(seed.attachments[0]).toMatchObject({
      id: "내a1",
      assetPath: "관리자/references/내a1.png",
      url: "signed:내a1",
      // 역할 같은 것은 원래 것을 그대로 지킨다.
      kind: "style_reference",
      role: "cover",
    });
  });

  it("복사 못 한 첨부만 빠진 수로 센다", () => {
    expect(snsSeed(project, false, 복사본).droppedAttachments).toBe(1);
  });

  it("내 작업이면 복사본을 안 본다", () => {
    // 내 것은 그대로 쓸 수 있다. 복사본 목록이 섞여 와도 원래 첨부를 싣는다.
    const seed = snsSeed(project, true, 복사본);

    expect(seed.attachments.map((attachment) => attachment.id)).toEqual(["a1", "a2"]);
    expect(seed.droppedAttachments).toBe(0);
  });

  it("원본 첨부를 건드리지 않는다", () => {
    snsSeed(project, false, 복사본);
    expect(project.data.attachments[0]!.id).toBe("a1");
  });
});
