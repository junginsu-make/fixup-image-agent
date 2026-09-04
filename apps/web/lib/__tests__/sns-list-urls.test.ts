import { describe, expect, it } from "vitest";
import { collectCardPaths, withCardUrls } from "../sns/list-urls";

const project = (id: string, cards: Array<{ index: number; assetPath?: string; thumbPath?: string }>) => ({
  id,
  data: {
    attachments: [],
    flow: {
      stage: "result" as const, planningIssues: [], copyIssues: [], costs: [],
      cards: cards.map((card) => ({
        index: card.index, kind: "generated" as const, role: "body" as const,
        copy: { index: card.index, headline: `${card.index}` },
        status: "done" as const, assetPath: card.assetPath, thumbPath: card.thumbPath,
      })),
    },
  },
});

describe("목록에 필요한 그림 경로 모으기", () => {
  it("여러 작업의 경로를 한 번에 모은다", () => {
    // 작업마다 따로 서명하면 왕복이 작업 수만큼 늘어난다.
    const paths = collectCardPaths([
      project("a", [{ index: 1, assetPath: "u/sns/a/1.png" }, { index: 2, assetPath: "u/sns/a/2.png" }]),
      project("b", [{ index: 1, assetPath: "u/sns/b/1.png" }]),
    ] as never);
    expect(paths).toEqual(["u/sns/a/1.png", "u/sns/a/2.png", "u/sns/b/1.png"]);
  });

  it("같은 경로는 한 번만", () => {
    const paths = collectCardPaths([
      project("a", [{ index: 1, assetPath: "u/sns/a/1.png" }]),
      project("b", [{ index: 1, assetPath: "u/sns/a/1.png" }]),
    ] as never);
    expect(paths).toEqual(["u/sns/a/1.png"]);
  });

  it("아직 그림이 없는 카드는 건너뛴다", () => {
    expect(collectCardPaths([project("a", [{ index: 1 }])] as never)).toEqual([]);
  });
});

describe("모은 주소를 작업에 다시 붙이기", () => {
  it("경로에 맞는 주소를 카드에 넣는다", () => {
    const [first] = withCardUrls(
      [project("a", [{ index: 1, assetPath: "u/sns/a/1.png" }])] as never,
      new Map([["u/sns/a/1.png", "https://signed/1"]]),
    );
    expect(first!.data.flow!.cards[0]!.assetUrl).toBe("https://signed/1");
  });

  it("주소를 못 받은 카드는 건드리지 않는다", () => {
    // 하나 실패했다고 나머지까지 못 보여줄 이유가 없다.
    const [first] = withCardUrls(
      [project("a", [{ index: 1, assetPath: "u/sns/a/1.png" }, { index: 2, assetPath: "u/sns/a/2.png" }])] as never,
      new Map([["u/sns/a/2.png", "https://signed/2"]]),
    );
    expect(first!.data.flow!.cards[0]!.assetUrl).toBeUndefined();
    expect(first!.data.flow!.cards[1]!.assetUrl).toBe("https://signed/2");
  });

  it("원래 작업을 건드리지 않는다", () => {
    const projects = [project("a", [{ index: 1, assetPath: "u/sns/a/1.png" }])] as never;
    withCardUrls(projects, new Map([["u/sns/a/1.png", "https://signed/1"]]));
    expect((projects as never as ReturnType<typeof project>[])[0]!.data.flow!.cards[0]!)
      .not.toHaveProperty("assetUrl");
  });

  it("흐름이 없는 작업도 그대로 지나간다", () => {
    const projects = [{ id: "a", data: { attachments: [] } }] as never;
    expect(withCardUrls(projects, new Map())).toHaveLength(1);
  });
});

describe("미리보기 주소", () => {
  it("원본과 미리보기를 함께 모은다 — 한 번에 서명해 왕복을 안 늘린다", () => {
    const paths = collectCardPaths([
      project("a", [{ index: 1, assetPath: "u/sns/a/1.png", thumbPath: "u/sns/a/1.thumb.webp" }]),
    ] as never);

    expect(paths.sort()).toEqual(["u/sns/a/1.png", "u/sns/a/1.thumb.webp"]);
  });

  it("둘 다 붙인다 — 목록은 미리보기를, 확대·내려받기는 원본을 쓴다", () => {
    const [result] = withCardUrls(
      [project("a", [{ index: 1, assetPath: "u/sns/a/1.png", thumbPath: "u/sns/a/1.thumb.webp" }])] as never,
      new Map([["u/sns/a/1.png", "signed:orig"], ["u/sns/a/1.thumb.webp", "signed:thumb"]]),
    );

    const card = result!.data.flow!.cards[0]!;
    expect(card.assetUrl).toBe("signed:orig");
    expect(card.thumbUrl).toBe("signed:thumb");
  });

  it("미리보기가 없는 옛 카드는 원본만 붙는다", () => {
    const [result] = withCardUrls(
      [project("a", [{ index: 1, assetPath: "u/sns/a/1.png" }])] as never,
      new Map([["u/sns/a/1.png", "signed:orig"]]),
    );

    const card = result!.data.flow!.cards[0]!;
    expect(card.assetUrl).toBe("signed:orig");
    expect(card.thumbUrl).toBeUndefined();
  });
});
