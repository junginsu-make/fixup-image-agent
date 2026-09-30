import { describe, expect, it } from "vitest";
import type { AttachmentRead } from "@fixup/poster-core";
import {
  canPickPerson, describePhoto, easyRolePrompt, mergeRoles, photoAskReason,
  readChosenRoles, readRoleJudgment, type RoleJudgment,
} from "../photo-roles";

/**
 * **붙인 사진을 어떻게 쓸지**(설계 §2-3 ⓑ2 · §2-4).
 *
 * 판단은 모델이 한다. 여기서 재는 것은 **무엇을 물었나**와 **돌아온 답을
 * 어떻게 읽나**다. 읽기가 느슨하면 모르는 사진이 「분위기 참고」로 떨어지고,
 * 지켜야 할 제품이 다시 그려진다 — 가장 비싼 실수다.
 */

const 읽음 = (over: Partial<AttachmentRead> = {}): AttachmentRead => ({
  people: [], staging: "", hasText: false, typeInteraction: null,
  dominantColor: "", accentColor: "", note: "", ...over,
});

describe("사진 설명", () => {
  it("사람 수와 한 사람씩을 적는다", () => {
    const 설명 = describePhoto(읽음({ people: ["왼쪽 — 안경", "오른쪽 — 모자"], staging: "공원에서 둘이 섬" }));

    expect(설명).toContain("사람 2명");
    expect(설명).toContain("왼쪽 — 안경");
    expect(설명).toContain("공원에서 둘이 섬");
  });

  it("사람이 없고 글자가 있으면 그렇게 적는다", () => {
    const 설명 = describePhoto(읽음({ staging: "카페 포스터", hasText: true, note: "제목이 음료 뒤로 깔림" }));

    expect(설명).toContain("사람 없음");
    expect(설명).toContain("글자 있음");
    expect(설명).toContain("제목이 음료 뒤로 깔림");
  });
});

describe("모델에게 보낼 글", () => {
  const 글 = easyRolePrompt({
    words: "1번 제품은 그대로",
    photos: [{ description: "흰 배경의 원두 봉투" }, {}],
  });

  it("사용자 말을 그대로 싣는다", () => {
    expect(글).toContain("1번 제품은 그대로");
  });

  it("붙인 순서대로 번호를 붙인다", () => {
    expect(글).toContain("1번: 흰 배경의 원두 봉투");
    expect(글).toMatch(/2번: \(설명 없음/);
  });

  it("역할 다섯을 다 알려 준다", () => {
    for (const role of ["style", "preserve_product", "preserve_person", "preserve_person_restyled", "unclear"]) {
      expect(글).toContain(role);
    }
  });

  /** 「바꿔 그리지 마」는 지키라는 말이다. 부정문을 쓰임으로 못 읽으면 되묻는다. */
  it("하지 말라는 말도 쓰임이라고 알린다", () => {
    expect(글).toContain("하지 말라는 말도");
  });

  /** 모르면 style 로 두는 순간 제품이 다시 그려진다. */
  it("모르면 style 로 두지 말라고 못 박는다", () => {
    expect(글).toContain("모르면 style 로 두지 마세요");
  });
});

describe("판단 응답 읽기", () => {
  it("번호대로 역할과 said 를 읽는다", () => {
    const 판단 = readRoleJudgment({
      photos: [
        { number: 2, role: "style", said: false },
        { number: 1, role: "preserve_product", said: true },
      ],
      conflicting: false,
    }, 2);

    expect(판단.photos).toEqual([
      { role: "preserve_product", said: true },
      { role: "style", said: false },
    ]);
    expect(판단.conflicting).toBe(false);
  });

  it("빠진 번호는 unclear 다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "style", said: false }], conflicting: false }, 2).photos[1])
      .toEqual({ role: "unclear", said: false });
  });

  it("모르는 역할은 unclear 다 — 분위기로 떨어지지 않는다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "place_as_is", said: true }] }, 1).photos[0])
      .toEqual({ role: "unclear", said: false });
  });

  it("범위 밖 · 글자 · 소수 번호는 버린다", () => {
    const 판단 = readRoleJudgment({
      photos: [
        { number: 0, role: "style", said: false },
        { number: 3, role: "style", said: false },
        { number: "1", role: "style", said: false },
        { number: 1.5, role: "style", said: false },
      ],
    }, 2);

    expect(판단.photos).toEqual([{ role: "unclear", said: false }, { role: "unclear", said: false }]);
  });

  /** 한 사진에 답이 둘이면 어느 쪽인지 모른다. */
  it("같은 번호가 두 번 오면 unclear 다", () => {
    const 판단 = readRoleJudgment({
      photos: [
        { number: 1, role: "style", said: false },
        { number: 1, role: "preserve_product", said: true },
      ],
    }, 1);

    expect(판단.photos[0]).toEqual({ role: "unclear", said: false });
  });

  it("unclear 는 said 가 늘 거짓이다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "unclear", said: true }] }, 1).photos[0]!.said)
      .toBe(false);
  });

  it("said 는 참일 때만 참이다", () => {
    expect(readRoleJudgment({ photos: [{ number: 1, role: "style", said: "yes" }] }, 1).photos[0]!.said)
      .toBe(false);
  });

  it("conflicting 은 참일 때만 참이다", () => {
    expect(readRoleJudgment({ photos: [], conflicting: "true" }, 0).conflicting).toBe(false);
    expect(readRoleJudgment({ photos: [], conflicting: true }, 0).conflicting).toBe(true);
  });

  it("모양이 틀린 응답은 전부 unclear 다", () => {
    expect(readRoleJudgment("엉망", 2)).toEqual({
      photos: [{ role: "unclear", said: false }, { role: "unclear", said: false }],
      conflicting: false,
    });
  });
});

const 판단 = (...roles: Array<[string, boolean]>): RoleJudgment => ({
  photos: roles.map(([role, said]) => ({ role: role as never, said })),
  conflicting: false,
});

describe("고른 값 읽기 — 서버가 다시 확인한다 (설계 §2-5)", () => {
  const ids = ["a", "b"];

  it("붙인 사진의 네 역할만 받는다", () => {
    expect(readChosenRoles([{ id: "a", role: "preserve_product" }, { id: "b", role: "style" }], ids))
      .toEqual({ a: "preserve_product", b: "style" });
  });

  it("목록 밖의 id 는 버린다 — 남의 사진 id 를 넣어도 안 먹힌다", () => {
    expect(readChosenRoles([{ id: "남의것", role: "preserve_product" }], ids)).toEqual({});
  });

  it("모르는 역할은 버린다", () => {
    expect(readChosenRoles([{ id: "a", role: "place_as_is" }, { id: "b", role: "unclear" }], ids)).toEqual({});
  });

  it("같은 id 가 두 번 오면 둘 다 버린다", () => {
    expect(readChosenRoles([{ id: "a", role: "style" }, { id: "a", role: "preserve_product" }], ids)).toEqual({});
  });

  it("목록이 아니면 아무것도 안 고른 것이다", () => {
    expect(readChosenRoles("a:style", ids)).toEqual({});
  });
});

describe("합치기 — 고른 것 > 말 > 판단 > 모름 (설계 §2-4)", () => {
  it("고른 것이 판단을 이긴다", () => {
    expect(mergeRoles({ ids: ["a"], chosen: { a: "style" }, judged: 판단(["preserve_product", true]) }))
      .toEqual([{ id: "a", role: "style" }]);
  });

  it("안 고른 사진은 판단대로 간다", () => {
    expect(mergeRoles({ ids: ["a", "b"], chosen: { a: "style" }, judged: 판단(["unclear", false], ["preserve_product", true]) }))
      .toEqual([{ id: "a", role: "style" }, { id: "b", role: "preserve_product" }]);
  });

  it("판단도 없으면 unclear 다", () => {
    expect(mergeRoles({ ids: ["a"], chosen: {}, judged: { photos: [], conflicting: false } }))
      .toEqual([{ id: "a", role: "unclear" }]);
  });

  it("붙인 순서를 지킨다", () => {
    expect(mergeRoles({ ids: ["b", "a"], chosen: {}, judged: 판단(["style", false], ["style", false]) }).map((row) => row.id))
      .toEqual(["b", "a"]);
  });
});

describe("물을까 (설계 §2-5)", () => {
  it("모르는 사진이 있으면 묻는다", () => {
    expect(photoAskReason([{ id: "a", role: "unclear" }, { id: "b", role: "style" }])).toBe("unclear");
  });

  it("인물 역할인 사진이 둘이면 묻는다", () => {
    expect(photoAskReason([{ id: "a", role: "preserve_person" }, { id: "b", role: "preserve_person" }])).toBe("people");
  });

  it("그림체만 바꾸는 인물도 인물로 센다", () => {
    expect(photoAskReason([{ id: "a", role: "preserve_person_restyled" }, { id: "b", role: "preserve_person" }])).toBe("people");
  });

  /** 장 단위로 센다 — 단체 사진 한 장은 1이다(설계 §2-5). */
  it("단체 사진 한 장은 묻지 않는다", () => {
    expect(photoAskReason([{ id: "단체", role: "preserve_person_restyled" }, { id: "b", role: "style" }])).toBeNull();
  });

  it("제품은 여럿이어도 된다", () => {
    expect(photoAskReason([{ id: "a", role: "preserve_product" }, { id: "b", role: "preserve_product" }])).toBeNull();
  });

  it("모름이 먼저다 — 둘 다면 unclear 로 묻는다", () => {
    expect(photoAskReason([
      { id: "a", role: "unclear" }, { id: "b", role: "preserve_person" }, { id: "c", role: "preserve_person" },
    ])).toBe("unclear");
  });
});

describe("인물은 한 줄에만 (설계 §2-5)", () => {
  it("다른 줄이 인물이면 못 고른다", () => {
    expect(canPickPerson({ a: "preserve_person", b: undefined }, "b")).toBe(false);
  });

  it("자기 줄이 인물이면 그대로 고를 수 있다", () => {
    expect(canPickPerson({ a: "preserve_person" }, "a")).toBe(true);
  });

  it("다른 줄이 제품이면 고를 수 있다", () => {
    expect(canPickPerson({ a: "preserve_product" }, "b")).toBe(true);
  });
});
