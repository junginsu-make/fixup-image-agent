import { describe, expect, it } from "vitest";
import {
  adoptedReferenceId, copiedAssetPath, copiedLibraryAssetPath, copiedReferencePath,
  copiedReferenceTitle, ownerCouldSeeReference, referenceIdsOfWork,
} from "../copy-paths";

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

/**
 * **규약을 벗어난 칸은 처음부터 자른다.**
 *
 * 지금은 경로를 서버가 조립하므로 사용자가 `..` 를 넣을 길이 없다. 그래도
 * 거르는 까닭은, 이 함수가 만든 문자열이 그대로 저장소 주소가 되고 업로드가
 * `upsert: true` 이기 때문이다 — 언젠가 경로를 받아 쓰는 자리가 하나 생기면
 * 그날 남의 파일을 덮어쓴다. 막는 값이 싸서 미리 막는다.
 */
describe("경로에 위로 올라가는 칸이 있으면 옮기지 않는다", () => {
  // 마지막은 **역슬래시가 든 칸**이다. `"a\b"` 로 적으면 백스페이스 문자가 된다.
  const 나쁜칸 = ["..", ".", "a\\b"];

  it.each(나쁜칸)("작업 경로에 %s 가 있으면 null", (part) => {
    expect(copiedAssetPath(`남/도구/작업/${part}/x.png`, "나", "새작업")).toBeNull();
  });

  it.each(나쁜칸)("캐릭터 경로에 %s 가 있으면 null", (part) => {
    expect(copiedCharacterAssetPath(`남/캐릭터/${part}/x.png`, "나", "새캐릭터")).toBeNull();
  });

  it.each(나쁜칸)("라이브러리 경로에 %s 가 있으면 null", (part) => {
    expect(copiedLibraryAssetPath(`남/작업/${part}/0.png`, "나", "새작업")).toBeNull();
  });

  it("점이 **들어간** 이름은 멀쩡하다", () => {
    // `0.thumb.webp` 는 정상이다. 칸 전체가 점일 때만 막는다.
    expect(copiedLibraryAssetPath("남/작업/0.thumb.webp", "나", "새작업"))
      .toBe("나/새작업/0.thumb.webp");
    expect(copiedAssetPath("남/도구/작업/0.thumb.webp", "나", "새작업"))
      .toBe("나/도구/새작업/0.thumb.webp");
  });
});

/**
 * **참고 이미지를 내 라이브러리로 복사할 때의 자리.**
 *
 * 관리자가 다른 회원의 작업을 다시 만들면 02 가 비었다 — 붙였던 그림이 그
 * 회원 것이라 관리자 목록에 없어서다(2026-09-16 운영 데이터로 확인). 그림을
 * 관리자 라이브러리로 **복사해** 온다.
 *
 * 표가 경로를 직접 검사한다 — `storage_path ~ ^{user_id}/references/{id}\.[^/]+$`
 * (`202608310003_references.sql`). 그래서 **새 id 를 먼저 정하고** 그 id 로
 * 경로를 만든다. 원래 경로의 `{작업}` 칸 같은 것을 물려받는 규칙과 다르다.
 */
describe("copiedReferencePath", () => {
  it("주인과 id 를 새 것으로, 확장자는 그대로", () => {
    expect(copiedReferencePath("남/references/옛id.png", "나", "새id"))
      .toEqual({ path: "나/references/새id.png", thumb: "나/references/새id.thumb.webp" });
  });

  it("확장자가 달라도 그대로 옮긴다", () => {
    expect(copiedReferencePath("남/references/옛id.jpeg", "나", "새id")?.path)
      .toBe("나/references/새id.jpeg");
  });

  it("규약을 벗어난 경로는 옮기지 않는다", () => {
    // 확장자가 없으면 표의 검사를 못 지난다. 넣어 봐야 거절당한다.
    expect(copiedReferencePath("남/references/옛id", "나", "새id")).toBeNull();
    expect(copiedReferencePath("", "나", "새id")).toBeNull();
    expect(copiedReferencePath("남/references/옛id.png", "", "새id")).toBeNull();
    expect(copiedReferencePath("남/references/옛id.png", "나", "")).toBeNull();
  });

  it("위로 올라가는 칸이 든 경로는 옮기지 않는다", () => {
    expect(copiedReferencePath("남/../references/옛id.png", "나", "새id")).toBeNull();
  });
});

/**
 * **복사본 id 는 늘 같다.**
 *
 * 01 을 누를 때마다 새로 복사하면 관리자 라이브러리에 같은 그림이 계속 쌓인다.
 * 「원래 그림 + 복사한 사람」에서 id 를 만들면 두 번째부터는 이미 있는 복사본을
 * 그대로 쓴다 — 표에 칸을 더하지 않고(마이그레이션 없이) 중복을 막는다.
 */
describe("adoptedReferenceId", () => {
  it("같은 그림을 같은 사람이 복사하면 늘 같은 id 다", () => {
    expect(adoptedReferenceId("원래", "관리자")).toBe(adoptedReferenceId("원래", "관리자"));
  });

  it("그림이나 사람이 다르면 다른 id 다", () => {
    const base = adoptedReferenceId("원래", "관리자");
    expect(adoptedReferenceId("다른그림", "관리자")).not.toBe(base);
    expect(adoptedReferenceId("원래", "다른사람")).not.toBe(base);
  });

  it("uuid 모양이다 — 표의 id 칸과 경로 검사를 지난다", () => {
    expect(adoptedReferenceId("원래", "관리자"))
      .toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("원래 id 와 같아지지 않는다", () => {
    // 같아지면 복사본이 원본 행과 부딪친다.
    const original = "61d9bb82-d1e8-4f11-96c5-eac6766348f0";
    expect(adoptedReferenceId(original, "관리자")).not.toBe(original);
  });
});

/**
 * **작업이 가리키는 그림만** 복사한다.
 *
 * 복사 주소는 화면이 보낸 id 를 안 받는다 — 받으면 관리자 권한으로 아무 회원의
 * 아무 그림이나 복사하는 길이 열린다. 그래서 작업 기록에서 직접 뽑는다.
 */
describe("referenceIdsOfWork", () => {
  it("이미지 작업은 네 목록과 차례를 다 본다", () => {
    /*
      차례만 보면 차례가 없던 옛 작업의 그림을 놓치고, 목록만 보면 차례에만
      있는 그림을 놓친다. 앞뒤가 안 맞는 옛 행이 실제로 있다(09-07~09-08).
    */
    expect(referenceIdsOfWork("poster", {
      referenceIds: ["a"], preservedIds: ["b"], personIds: ["b"], restyledIds: [],
      attachmentOrder: ["b", "a", "c"],
    }).sort()).toEqual(["a", "b", "c"]);
  });

  it("카드뉴스 작업은 첨부의 id 를 본다", () => {
    expect(referenceIdsOfWork("sns", {
      attachments: [{ id: "a1", kind: "style_reference" }, { id: "a2", kind: "keep_identity" }],
    })).toEqual(["a1", "a2"]);
  });

  it("같은 id 는 한 번만", () => {
    expect(referenceIdsOfWork("poster", { referenceIds: ["x"], preservedIds: ["x"], attachmentOrder: ["x"] }))
      .toEqual(["x"]);
  });

  it("모양이 망가져도 넘어지지 않는다", () => {
    expect(referenceIdsOfWork("poster", null)).toEqual([]);
    expect(referenceIdsOfWork("poster", { referenceIds: "a" })).toEqual([]);
    expect(referenceIdsOfWork("sns", { attachments: [null, { kind: "x" }, { id: 3 }] })).toEqual([]);
  });
});

/**
 * **복사본의 제목은 원본과 달라야 한다.**
 *
 * 캐릭터 각도 그림은 제목(「이름 (캐릭터) · 정면」)이 유일한 손잡이다 —
 * 붙일 때 제목으로 찾고, 캐릭터를 지우거나 다시 만들 때 제목으로 지운다.
 * 복사본이 같은 제목이면 관리자가 같은 이름의 캐릭터를 붙일 때 남의 각도
 * 그림이 붙고, 자기 캐릭터를 지울 때 복사본까지 같이 지워진다(2026-09-16 리뷰).
 */
describe("copiedReferenceTitle", () => {
  it("뒤에 (복사) 를 단다", () => {
    expect(copiedReferenceTitle("가을 포스터")).toBe("가을 포스터 (복사)");
  });

  it("캐릭터 각도 제목도 더는 그 캐릭터와 맞지 않는다", () => {
    const title = "하루 (캐릭터) · 정면";
    expect(copiedReferenceTitle(title)).not.toBe(title);
    expect(copiedReferenceTitle(title)).toBe("하루 (캐릭터) · 정면 (복사)");
  });

  it("제목이 없으면 없는 채로 둔다", () => {
    expect(copiedReferenceTitle(null)).toBeNull();
    expect(copiedReferenceTitle("")).toBeNull();
  });

  it("두 번 복사해도 (복사) 가 겹치지 않는다", () => {
    expect(copiedReferenceTitle("가을 포스터 (복사)")).toBe("가을 포스터 (복사)");
  });
});

/**
 * **작업 주인이 볼 수 있던 그림만 복사한다.**
 *
 * 작업 기록의 그림 id 는 주인이 소유 검사 없이 적을 수 있는 값이다 — 포스터
 * 저장은 uuid 모양만 본다. 그래서 주인이 남의 팀 그림 id 를 심어 두고 관리자가
 * 그 작업을 다시 만들면, 그 그림이 관리자 손을 거쳐 새어 나올 수 있다
 * (2026-09-16 리뷰). 주인이 원래 볼 수 있던 것만 옮긴다.
 */
describe("ownerCouldSeeReference", () => {
  const 주인 = { userId: "주인", teamId: "팀X" };

  it("주인 것은 된다", () => {
    expect(ownerCouldSeeReference(주인, { userId: "주인", teamId: null })).toBe(true);
    expect(ownerCouldSeeReference(주인, { userId: "주인", teamId: "팀Y" })).toBe(true);
  });

  it("주인 팀 것은 된다", () => {
    expect(ownerCouldSeeReference(주인, { userId: "팀원", teamId: "팀X" })).toBe(true);
  });

  it("공용(팀 없음)은 된다", () => {
    expect(ownerCouldSeeReference(주인, { userId: "아무개", teamId: null })).toBe(true);
  });

  it("**남의 팀 것은 안 된다**", () => {
    expect(ownerCouldSeeReference(주인, { userId: "남", teamId: "팀Y" })).toBe(false);
  });

  it("팀이 없는 주인은 남의 팀 것을 못 본다", () => {
    expect(ownerCouldSeeReference({ userId: "주인", teamId: null }, { userId: "남", teamId: "팀Y" }))
      .toBe(false);
  });
});
