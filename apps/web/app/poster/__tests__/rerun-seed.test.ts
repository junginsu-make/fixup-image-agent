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

/**
 * **한 바퀴 돌려도 같아야 한다.**
 *
 * 저장은 목록 넷으로 갈려 있고(`referenceIds`·`preservedIds`·`personIds`·
 * `restyledIds`) 화면은 한 칸에 한 역할을 쓴다. 되짚었다가 다시 저장했을 때
 * 원래와 다른 네 목록이 나오면, **다시 만든 그림이 원본과 달라진다** — 그런데
 * 화면에는 아무 오류도 안 뜬다.
 *
 * 그래서 화면이 저장할 때 쓰는 셈(`new-client.tsx` 의 `styleIds` 등)을 여기서
 * 그대로 다시 적어 맞대 본다.
 */
function 화면이_저장하는_목록(seed: ReturnType<typeof posterSeed>) {
  const order = seed.pickOrder;
  const role = (id: string) => seed.roles[id];
  return {
    referenceIds: order.filter((id) => role(id) === "style"),
    preservedIds: order.filter((id) => role(id)?.startsWith("preserve")),
    personIds: order.filter(
      (id) => role(id) === "preserve_person" || role(id) === "preserve_person_restyled"),
    restyledIds: order.filter((id) => role(id) === "preserve_person_restyled"),
  };
}

describe("역할 한 바퀴", () => {
  const 모두 = 볼수있음("s1", "p1", "person1", "restyle1");

  it("네 역할이 섞여 있어도 그대로 돌아온다", () => {
    const 원래 = {
      referenceIds: ["s1"],
      preservedIds: ["p1", "person1", "restyle1"],
      personIds: ["person1", "restyle1"],
      restyledIds: ["restyle1"],
      attachmentOrder: ["s1", "p1", "person1", "restyle1"],
    };

    const 다시 = 화면이_저장하는_목록(
      posterSeed({ title: "t", ratio: "2:3", modelId: "m", data: { ...원래, instruction: "i" } }, 모두));

    expect(다시.referenceIds).toEqual(원래.referenceIds);
    expect(다시.preservedIds).toEqual(원래.preservedIds);
    expect(다시.personIds).toEqual(원래.personIds);
    expect(다시.restyledIds).toEqual(원래.restyledIds);
  });

  it("사람이 없는 옛 작업도 그대로 돌아온다", () => {
    // `personIds`·`restyledIds` 가 아예 없던 시절 작업이다.
    const 원래 = { referenceIds: ["s1"], preservedIds: ["p1"] };

    const 다시 = 화면이_저장하는_목록(
      posterSeed({ title: "t", ratio: "2:3", modelId: "m", data: { ...원래, instruction: "i" } },
        볼수있음("s1", "p1")));

    expect(다시).toEqual({
      referenceIds: ["s1"],
      preservedIds: ["p1"],
      personIds: [],
      restyledIds: [],
    });
  });

  it("못 보는 것을 뺀 만큼만 줄어든다", () => {
    /*
      남의 참고 이미지를 빼고 나면 목록도 그만큼 줄어야 한다. 역할만 지우고
      목록에 남기면 저장할 때 **없는 그림을 가리키는 작업**이 된다.
    */
    const 다시 = 화면이_저장하는_목록(posterSeed({
      title: "t", ratio: "2:3", modelId: "m",
      data: {
        instruction: "i",
        referenceIds: ["s1"], preservedIds: ["p1"],
        attachmentOrder: ["s1", "p1"],
      },
    }, 볼수있음("s1")));

    expect(다시.referenceIds).toEqual(["s1"]);
    expect(다시.preservedIds).toEqual([]);
  });
});

/**
 * **차례와 목록이 어긋난 옛 작업.**
 *
 * `attachmentOrder` 는 2026-09-07 에 생겼고 정합성 검사(`superRefine`)는
 * 09-08 에 붙었다 — **그 사이에 만들어진 행은 검사를 안 받았다.** 차례에 안
 * 담긴 참고 이미지가 있을 수 있다.
 *
 * 그때 세는 기준이 차례뿐이면 **빠진 것을 아예 안 센다.** 화면은 「다
 * 가져왔습니다」라고 말하는데 실제로는 한 장이 사라진 상태다 — 「조용히 빠지면
 * 사용자는 자기가 안 고른 줄 안다」는 이 파일의 원칙이 바로 여기서 깨진다
 * (2026-09-16 독립 리뷰).
 */
describe("차례와 목록이 어긋난 작업", () => {
  it("차례에 안 담긴 참고 이미지도 빠진 것으로 센다", () => {
    const seed = posterSeed({
      title: "t", ratio: "2:3", modelId: "m",
      data: {
        instruction: "i",
        referenceIds: ["a", "b"],
        preservedIds: [],
        attachmentOrder: ["a"],
      },
    }, 볼수있음("a", "b"));

    expect(seed.pickOrder).toEqual(["a"]);
    // b 는 사라졌다. 0 이라고 말하면 거짓말이다.
    expect(seed.missingReferences).toBe(1);
  });

  it("차례에 안 담긴 **지킬 그림**도 센다", () => {
    const seed = posterSeed({
      title: "t", ratio: "2:3", modelId: "m",
      data: {
        instruction: "i",
        referenceIds: [],
        preservedIds: ["p1", "p2"],
        attachmentOrder: ["p1"],
      },
    }, 볼수있음("p1", "p2"));

    expect(seed.missingReferences).toBe(1);
  });

  it("차례에만 있고 역할이 없는 것도 센다", () => {
    /*
      `pickOrder` 에는 남지만 역할이 안 붙어 저장 때 빠진다. 화면에는 ①이
      서는데 만들면 없다.
    */
    const seed = posterSeed({
      title: "t", ratio: "2:3", modelId: "m",
      data: {
        instruction: "i",
        referenceIds: ["a"],
        preservedIds: [],
        attachmentOrder: ["a", "떠도는것"],
      },
    }, 볼수있음("a", "떠도는것"));

    expect(seed.pickOrder).toEqual(["a"]);
    expect(seed.missingReferences).toBe(1);
  });

  it("앞뒤가 맞는 작업은 여전히 0 이다", () => {
    const seed = posterSeed({
      title: "t", ratio: "2:3", modelId: "m",
      data: {
        instruction: "i",
        referenceIds: ["a"],
        preservedIds: ["b"],
        attachmentOrder: ["a", "b"],
      },
    }, 볼수있음("a", "b"));

    expect(seed.missingReferences).toBe(0);
  });
});
