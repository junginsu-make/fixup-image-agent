import { describe, expect, it } from "vitest";
import { copiedAssetPath } from "../copy-paths";

/**
 * 복사본의 그림이 놓일 자리.
 *
 * **원본 경로를 그대로 물려받으면 안 된다.** 버킷 정책이 경로 첫 칸으로
 * 소유자를 판정하므로(`docs/DEPLOY.md`), 남의 첫 칸을 그대로 쓰면
 *
 *   1. 관리자 작업인데 그림의 소유 판정이 어긋나고
 *   2. **원래 회원이 자기 작업을 지우면 복사본의 그림이 같이 사라진다**
 *
 * 그래서 첫 칸을 **복사한 사람**으로, 작업 칸을 **새 작업 id** 로 바꾼다.
 */
describe("copiedAssetPath", () => {
  it("첫 칸을 복사한 사람으로 바꾼다", () => {
    expect(copiedAssetPath("회원A/sns/작업1/0.png", "관리자B", "작업2"))
      .toBe("관리자B/sns/작업2/0.png");
  });

  it("작업 칸도 새 작업 id 로 바꾼다", () => {
    expect(copiedAssetPath("회원A/poster/작업1/2.png", "관리자B", "작업9"))
      .toBe("관리자B/poster/작업9/2.png");
  });

  it("작은 사본의 이름을 지킨다", () => {
    // `.thumb.webp` 는 `gridThumbPath` 가 정한 규칙이다. 여기서 깨면 복사본이
    // 격자에서 원본을 받아 2026-09-15 에 고친 것이 그 작업에서만 되살아난다.
    expect(copiedAssetPath("회원A/sns/작업1/0.thumb.webp", "관리자B", "작업2"))
      .toBe("관리자B/sns/작업2/0.thumb.webp");
  });

  it("도구 칸은 건드리지 않는다", () => {
    // 도구가 바뀌면 그 그림을 읽는 라우트가 못 찾는다.
    expect(copiedAssetPath("회원A/poster/작업1/0.png", "관리자B", "작업2"))
      .toContain("/poster/");
  });

  it("규약을 벗어난 경로는 null 이다 — 엉뚱한 자리에 쓰지 않는다", () => {
    expect(copiedAssetPath("이상한경로.png", "관리자B", "작업2")).toBeNull();
    expect(copiedAssetPath("", "관리자B", "작업2")).toBeNull();
    expect(copiedAssetPath("회원A/sns", "관리자B", "작업2")).toBeNull();
    expect(copiedAssetPath("회원A/sns/작업1", "관리자B", "작업2")).toBeNull();
  });

  it("새 소유자나 새 작업 id 가 비면 null 이다", () => {
    // 빈 값을 그대로 이으면 `/sns/...` 처럼 첫 칸 없는 경로가 되고, 그러면
    // 버킷 정책이 소유자를 못 읽는다.
    expect(copiedAssetPath("회원A/sns/작업1/0.png", "", "작업2")).toBeNull();
    expect(copiedAssetPath("회원A/sns/작업1/0.png", "관리자B", "")).toBeNull();
  });

  it("깊은 경로도 뒤쪽을 그대로 보존한다", () => {
    expect(copiedAssetPath("회원A/sns/작업1/안/0.png", "관리자B", "작업2"))
      .toBe("관리자B/sns/작업2/안/0.png");
  });
});

import { posterCopyPlan, snsCopyPlan } from "../copy-paths";

/**
 * **무엇을 어디로 옮기고, 표에는 무엇을 적을까.**
 *
 * 내려받고 올리는 일과 갈라 둔다 — 그래야 저장소를 흉내 내지 않고 값으로
 * 잰다. 이 계획이 틀리면 그림이 엉뚱한 자리에 가거나 표가 옛 자리를 가리킨다.
 */
describe("snsCopyPlan", () => {
  const data = {
    userInstruction: "겨울 느낌으로",
    flow: {
      stage: "result",
      cards: [
        { assetPath: "회원A/sns/작업1/0.png", thumbPath: "회원A/sns/작업1/0.thumb.webp", text: "첫 장" },
        { assetPath: "회원A/sns/작업1/1.png", thumbPath: null, text: "둘째 장" },
      ],
    },
  };

  it("원본과 사본을 모두 옮길 목록에 넣는다", () => {
    const plan = snsCopyPlan(data, "관리자B", "작업2");

    expect(plan.moves).toEqual([
      { from: "회원A/sns/작업1/0.png", to: "관리자B/sns/작업2/0.png" },
      { from: "회원A/sns/작업1/0.thumb.webp", to: "관리자B/sns/작업2/0.thumb.webp" },
      { from: "회원A/sns/작업1/1.png", to: "관리자B/sns/작업2/1.png" },
    ]);
  });

  it("표에 적을 경로를 새 자리로 바꾼다", () => {
    const plan = snsCopyPlan(data, "관리자B", "작업2");
    const cards = (plan.data as typeof data).flow.cards;

    expect(cards[0]!.assetPath).toBe("관리자B/sns/작업2/0.png");
    expect(cards[0]!.thumbPath).toBe("관리자B/sns/작업2/0.thumb.webp");
    expect(cards[1]!.thumbPath).toBeNull();
  });

  it("그림 말고 다른 값은 그대로 둔다", () => {
    const plan = snsCopyPlan(data, "관리자B", "작업2");
    const next = plan.data as typeof data;

    expect(next.userInstruction).toBe("겨울 느낌으로");
    expect(next.flow.cards[0]!.text).toBe("첫 장");
  });

  it("원본을 건드리지 않는다", () => {
    // 복사인데 원본이 바뀌면 그게 사고다.
    snsCopyPlan(data, "관리자B", "작업2");

    expect(data.flow.cards[0]!.assetPath).toBe("회원A/sns/작업1/0.png");
  });

  it("규약을 벗어난 경로는 옮기지 않고 칸을 비운다", () => {
    const odd = { flow: { cards: [{ assetPath: "이상한경로.png", thumbPath: null }] } };

    const plan = snsCopyPlan(odd, "관리자B", "작업2");

    expect(plan.moves).toEqual([]);
    expect((plan.data as typeof odd).flow.cards[0]!.assetPath).toBeNull();
  });

  it("그림이 없는 작업도 처리한다", () => {
    expect(snsCopyPlan({}, "관리자B", "작업2").moves).toEqual([]);
    expect(snsCopyPlan({ flow: { cards: [] } }, "관리자B", "작업2").moves).toEqual([]);
  });
});

describe("posterCopyPlan", () => {
  const rows = [
    { variant_index: 0, selected: true, width: 1024, height: 1024, review: null,
      asset_path: "회원A/poster/작업1/0.png", thumb_path: "회원A/poster/작업1/0.thumb.webp" },
    { variant_index: 1, selected: false, width: 1024, height: 1024, review: null,
      asset_path: "회원A/poster/작업1/1.png", thumb_path: null },
  ];

  it("원본과 사본을 모두 옮길 목록에 넣는다", () => {
    const plan = posterCopyPlan(rows, "관리자B", "작업2", "새요청");

    expect(plan.moves.map((move) => move.to)).toEqual([
      "관리자B/poster/작업2/0.png",
      "관리자B/poster/작업2/0.thumb.webp",
      "관리자B/poster/작업2/1.png",
    ]);
  });

  it("새 행은 소유자와 작업이 복사한 사람 것이다", () => {
    const plan = posterCopyPlan(rows, "관리자B", "작업2", "새요청");

    expect(plan.rows[0]).toMatchObject({
      user_id: "관리자B",
      project_id: "작업2",
      variant_index: 0,
      asset_path: "관리자B/poster/작업2/0.png",
      thumb_path: "관리자B/poster/작업2/0.thumb.webp",
    });
  });

  it("id 와 만든 시각은 새로 받는다 — 옮겨 적지 않는다", () => {
    const plan = posterCopyPlan(rows, "관리자B", "작업2", "새요청");

    expect(plan.rows[0]).not.toHaveProperty("id");
    expect(plan.rows[0]).not.toHaveProperty("created_at");
  });

  it("생성 요청은 **새로 만든 것**을 가리킨다 — 남의 장부 줄이 아니다", () => {
    /*
      `poster_images.generation_request_id` 는 **not null** 이다
      (`202608310004_poster.sql:47`). 처음엔 「남의 장부를 안 가리킨다」는
      뜻으로 이 칸을 통째로 뺐는데, 그러면 insert 가 23502 로 **무조건**
      실패한다 — 그리고 그때는 행과 파일이 이미 올라간 뒤다.

      원칙은 그대로 두되(남의 줄을 안 가리킨다) 값은 채운다. 복사한 사람
      소유의 **비용 0** 짜리 요청 행을 하나 만들어 그것을 가리킨다.
    */
    const plan = posterCopyPlan(rows, "관리자B", "작업2", "새요청");

    expect(plan.rows[0]!.generation_request_id).toBe("새요청");
    expect(plan.rows[0]!.generation_request_id).not.toBe("회원A-요청");
  });

  it("규약을 벗어난 경로의 행은 싣지 않는다", () => {
    // 그림 없는 변형 행을 남기면 목록에 빈 칸이 생긴다.
    const plan = posterCopyPlan([{ variant_index: 0, asset_path: "이상한경로.png", thumb_path: null }], "관리자B", "작업2", "새요청");

    expect(plan.moves).toEqual([]);
    expect(plan.rows).toEqual([]);
  });
});

import { copiedCharacterAssetPath } from "../copy-paths";

/**
 * 캐릭터는 **칸이 하나 적다** — `{소유자}/{캐릭터}/{각도}` 다. 작업물 규칙을
 * 그대로 쓰면 전부 `null` 이 되어 그림이 한 장도 안 옮겨진다.
 */
describe("copiedCharacterAssetPath", () => {
  it("첫 칸과 캐릭터 칸을 바꾼다", () => {
    expect(copiedCharacterAssetPath("회원A/캐릭1/front.png", "관리자B", "캐릭2"))
      .toBe("관리자B/캐릭2/front.png");
  });

  it("작은 사본의 이름을 지킨다", () => {
    expect(copiedCharacterAssetPath("회원A/캐릭1/front.thumb.webp", "관리자B", "캐릭2"))
      .toBe("관리자B/캐릭2/front.thumb.webp");
  });

  it("규약을 벗어난 경로는 null 이다", () => {
    expect(copiedCharacterAssetPath("이상한경로.png", "관리자B", "캐릭2")).toBeNull();
    expect(copiedCharacterAssetPath("회원A/캐릭1", "관리자B", "캐릭2")).toBeNull();
    expect(copiedCharacterAssetPath("", "관리자B", "캐릭2")).toBeNull();
  });

  it("새 소유자나 새 캐릭터 id 가 비면 null 이다", () => {
    expect(copiedCharacterAssetPath("회원A/캐릭1/front.png", "", "캐릭2")).toBeNull();
    expect(copiedCharacterAssetPath("회원A/캐릭1/front.png", "관리자B", "")).toBeNull();
  });

  it("작업물 규칙과 섞이지 않는다", () => {
    // 칸이 넷인 작업물 경로를 캐릭터 규칙에 넣으면 도구 칸이 각도로 밀린다.
    // 그래서 부르는 쪽이 갈래를 정확히 골라야 한다 — 이 시험이 그 경계다.
    expect(copiedCharacterAssetPath("회원A/sns/작업1/0.png", "관리자B", "캐릭2"))
      .toBe("관리자B/캐릭2/작업1/0.png");
  });
});
