import { describe, expect, it } from "vitest";
import { sourceReadingNotice } from "../source-reading";

/**
 * **원본을 얼마나 읽었는지 뭐라고 말하는가**(2026-09-22 재검토).
 *
 * 전사가 없으면 서버 프롬프트가 「원본 전사: 없음(이미지만으로 추정)」으로
 * 바뀐다. 그러면 **「전사에 없는 수치·인증·효능을 만들지 마라」는 제동과
 * `verified_facts` 가 함께 사라진다.** 결과는 나오지만 근거가 다른 물건이다.
 *
 * 버리는 것 자체는 괜찮다. 안 알리는 것이 문제다.
 */

describe("통째로 못 읽었을 때", () => {
  it("**사진만 보고 만든다고 말한다**", () => {
    const 말 = sourceReadingNotice({ failedBatches: 0, readFailed: true });

    expect(말, "아무 말도 안 한다").not.toBe("");
    expect(말).toContain("읽지 못했습니다");
    expect(말, "무엇으로 만드는지 안 말한다").toContain("사진만");
  });

  /**
   * **무엇이 빠지는지까지 말한다.** 「못 읽었습니다」만으로는 그래서 어쩌라는
   * 것인지 모른다. 원본의 수치와 인증 문구가 결과에 안 실린다는 것이 이
   * 알림의 값어치다.
   */
  it("**무엇이 빠지는지 말한다**", () => {
    const 말 = sourceReadingNotice({ failedBatches: 0, readFailed: true });

    expect(말).toContain("수치");
  });
});

describe("일부만 못 읽었을 때", () => {
  it("**몇 구간인지 말한다**", () => {
    const 말 = sourceReadingNotice({ failedBatches: 3, readFailed: false });

    expect(말).toContain("3개 구간");
  });

  /**
   * **통째 실패와 다른 말을 한다.** 앞은 사진만 보고 만든다는 뜻이고, 뒤는
   * 읽은 범위로 만든다는 뜻이다. 같은 말이면 사용자가 심각도를 못 가린다.
   */
  it("**통째 실패와 다른 말이다**", () => {
    const 통째 = sourceReadingNotice({ failedBatches: 0, readFailed: true });
    const 일부 = sourceReadingNotice({ failedBatches: 3, readFailed: false });

    expect(일부).not.toBe(통째);
    expect(일부, "일부만 못 읽었는데 사진만 본다고 한다").not.toContain("사진만");
  });

  it("**둘 다면 통째 실패 쪽을 말한다** — 더 나쁜 쪽이다", () => {
    const 말 = sourceReadingNotice({ failedBatches: 3, readFailed: true });

    expect(말).toContain("사진만");
  });
});

/**
 * **멀쩡할 때는 아무 말도 안 한다.**
 *
 * 다 읽었는데 「다 읽었습니다」를 띄우면, 다음에 진짜 경고가 떴을 때 사용자가
 * 같은 자리를 또 무시한다. 모를 때 경고하면 경고 전체가 무시된다.
 */
describe("다 읽었을 때", () => {
  it("**빈 문자열이다**", () => {
    expect(sourceReadingNotice({ failedBatches: 0, readFailed: false })).toBe("");
  });
});

describe("문구 규칙", () => {
  it("**줄표가 없다**", () => {
    const 말들 = [
      sourceReadingNotice({ failedBatches: 0, readFailed: true }),
      sourceReadingNotice({ failedBatches: 2, readFailed: false }),
    ];

    for (const 말 of 말들) expect(말).not.toContain("—");
  });
});
