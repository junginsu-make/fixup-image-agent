import { describe, expect, it } from "vitest";
import type { AttachmentRead } from "@fixup/poster-core";
import { describePhoto, easyRolePrompt, readRoleJudgment } from "../photo-roles";

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
