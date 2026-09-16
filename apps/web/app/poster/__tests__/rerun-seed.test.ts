import { describe, expect, it } from "vitest";
import { posterSeed } from "../rerun-seed";

/**
 * 이미 만든 작업의 **지난 단계로 돌아간다.**
 *
 * 지금까지 01~03 을 누르면 빈 새 작업 화면으로 보냈다. 값이 지워진 것이
 * 아니라 다른 화면으로 간 것인데, 사용자에게는 「다 초기화됐다」로 읽혔다
 * (2026-09-16 사용자 보고).
 *
 * 그래서 그 작업이 쓰던 값을 들고 간다. **원래 작업은 안 건드린다** —
 * 고쳐서 만들기를 누르면 새 작업이 하나 더 생긴다.
 */
const project = {
  title: "가을 신제품",
  ratio: "2:3",
  modelId: "m-illust",
  data: {
    instruction: "가을 느낌의 신제품 포스터",
    variants: 3,
    referenceIds: ["ref-A"],
    preservedIds: ["ref-B", "ref-C"],
    personIds: ["ref-C"],
    restyledIds: [],
    attachmentOrder: ["ref-C", "ref-A", "ref-B"],
    attachmentIntent: "①번 사람을 ②번 느낌으로",
    userInstruction: "글자는 크게",
    look: "illustration" as const,
    promptMode: "verbatim" as const,
  },
};

/** 지금 이 사람이 볼 수 있는 참고 이미지. */
const 볼수있음 = (...ids: string[]) => new Set(ids);

describe("posterSeed", () => {
  it("그때 쓴 값을 그대로 들고 간다", () => {
    const seed = posterSeed(project, 볼수있음("ref-A", "ref-B", "ref-C"));

    expect(seed.title).toBe("가을 신제품");
    expect(seed.instruction).toBe("가을 느낌의 신제품 포스터");
    expect(seed.ratio).toBe("2:3");
    expect(seed.modelId).toBe("m-illust");
    expect(seed.variants).toBe(3);
    expect(seed.look).toBe("illustration");
    expect(seed.promptMode).toBe("verbatim");
    expect(seed.userInstruction).toBe("글자는 크게");
    expect(seed.attachmentIntent).toBe("①번 사람을 ②번 느낌으로");
  });

  it("고른 차례를 지킨다", () => {
    /*
      차례가 화면의 ①②③ 이고 프롬프트의 `Image N` 이다. 뒤섞이면
      「①번 사람을 ②번 느낌으로」가 다른 뜻이 된다.
    */
    const seed = posterSeed(project, 볼수있음("ref-A", "ref-B", "ref-C"));

    expect(seed.pickOrder).toEqual(["ref-C", "ref-A", "ref-B"]);
  });

  it("역할을 되살린다", () => {
    const seed = posterSeed(project, 볼수있음("ref-A", "ref-B", "ref-C"));

    expect(seed.roles).toEqual({
      "ref-A": "style",
      "ref-B": "preserve_product",
      "ref-C": "preserve_person",
    });
  });

  it("사람인데 그림 느낌만 바꿔도 되는 것은 그 역할로 돌아간다", () => {
    const seed = posterSeed(
      { ...project, data: { ...project.data, restyledIds: ["ref-C"] } },
      볼수있음("ref-A", "ref-B", "ref-C"),
    );

    expect(seed.roles["ref-C"]).toBe("preserve_person_restyled");
  });
});

describe("못 보는 참고 이미지", () => {
  /**
   * **남의 참고 이미지는 못 가져온다.**
   *
   * 관리자가 다른 회원의 작업을 다시 만들 때, 그 작업이 가리키는 참고 이미지는
   * **그 회원 것**이다. 골라 둔 채로 두면 화면에는 ①②③ 이 서는데 실제로는
   * 아무 그림도 없어, 만들기를 눌러야 그제서야 이상해진다.
   *
   * 그래서 빼고, **몇 장을 못 가져왔는지 말한다.** 조용히 빠지면 사용자는
   * 자기가 안 고른 줄 안다.
   */
  it("못 보는 것은 빼고 센다", () => {
    const seed = posterSeed(project, 볼수있음("ref-A"));

    expect(seed.pickOrder).toEqual(["ref-A"]);
    expect(seed.roles).toEqual({ "ref-A": "style" });
    expect(seed.missingReferences).toBe(2);
  });

  it("다 볼 수 있으면 빠진 것이 없다", () => {
    expect(posterSeed(project, 볼수있음("ref-A", "ref-B", "ref-C")).missingReferences).toBe(0);
  });

  it("한 장도 못 보면 전부 뺀다", () => {
    const seed = posterSeed(project, 볼수있음());

    expect(seed.pickOrder).toEqual([]);
    expect(seed.roles).toEqual({});
    expect(seed.missingReferences).toBe(3);
  });
});

describe("옛 작업", () => {
  /**
   * 칸이 하나씩 없는 작업이 실제로 남아 있다. 하나라도 없으면 넘어지는 대신
   * **지금까지의 기본값**으로 읽는다 — `store.ts` 가 각 칸에 적어 둔 그대로다.
   */
  const 옛것 = {
    title: "옛 작업",
    ratio: "1:1",
    modelId: "m-old",
    data: { instruction: "무언가", variants: 1, referenceIds: [], preservedIds: [] },
  };

  it("없는 칸은 기본값으로 읽는다", () => {
    const seed = posterSeed(옛것, 볼수있음());

    expect(seed.look).toBe("auto");
    expect(seed.promptMode).toBe("assisted");
    expect(seed.userInstruction).toBe("");
    expect(seed.attachmentIntent).toBe("");
    expect(seed.missingReferences).toBe(0);
  });

  it("차례가 없으면 따라 만들 것 다음에 지킬 것을 잇는다", () => {
    /*
      그때는 차례를 저장하지 않았다. `store.ts` 가 「읽는 쪽이 `referenceIds` +
      `preservedIds` 를 이어 붙인다」고 정해 두었으므로 그대로 따른다.
    */
    const seed = posterSeed(
      { ...옛것, data: { ...옛것.data, referenceIds: ["s1"], preservedIds: ["p1"] } },
      볼수있음("s1", "p1"),
    );

    expect(seed.pickOrder).toEqual(["s1", "p1"]);
  });

  it("같은 id 가 두 목록에 있어도 한 번만 센다", () => {
    // 옛 작업에 실제로 있다. 두 번 서면 화면 ①②③ 이 어긋난다.
    const seed = posterSeed(
      { ...옛것, data: { ...옛것.data, referenceIds: ["x"], preservedIds: ["x"] } },
      볼수있음("x"),
    );

    expect(seed.pickOrder).toEqual(["x"]);
  });
});
