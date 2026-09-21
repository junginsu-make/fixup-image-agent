import { describe, expect, it } from "vitest";
import { POSTER_RATIOS } from "@fixup/sns-core";
import { IMAGE_LOOKS, IMAGE_LOOK_LABEL } from "@fixup/shared";
import { EASY_DEFAULT_LOOK, EASY_DEFAULT_RATIO, EASY_LOOKS, EASY_RATIOS, easyAsk } from "../ask";

/**
 * **비율과 결을 한 번 물어본다** (2026-09-21 사용자 — 「지금은 무조건 1:1로만
 * 나옵니다. 비율, 스타일 정보는 물어보고 그에 맞게 제작하게 해주세요」).
 *
 * 묻되 막지 않는다. 답이 없으면 지금까지대로다 — 1:1, 결은 `auto`.
 */

const 빈것 = { attachmentCount: 0 };

describe("고를 수 있는 것", () => {
  /**
   * **이름을 지어내지 않는다.** 같은 비율을 두 화면이 다르게 부르면 사용자가
   * 같은 것인 줄 모른다.
   */
  it("비율은 포스터 표에서 가져온다", () => {
    for (const one of EASY_RATIOS) {
      expect(POSTER_RATIOS.map((ratio) => ratio.id)).toContain(one.id);
    }
  });

  /**
   * **모델을 가리는 비율은 안 낸다.** `pixelOnly` 는 정밀형 계열로만 만들 수
   * 있어서, 고를 것을 줄이는 이 모드에서 고르면 모델이 조용히 바뀐다.
   */
  it("어느 모델로도 만들 수 있는 것만 낸다", () => {
    for (const one of EASY_RATIOS) {
      const spec = POSTER_RATIOS.find((ratio) => ratio.id === one.id)!;
      expect(spec.pixelOnly, `${one.id} 는 모델을 가린다`).toBeUndefined();
    }
  });

  it("결은 다섯 도구가 쓰는 그 목록이다", () => {
    expect(EASY_LOOKS.map((one) => one.id)).toEqual([...IMAGE_LOOKS]);
    expect(EASY_LOOKS.map((one) => one.label)).toEqual(IMAGE_LOOKS.map((id) => IMAGE_LOOK_LABEL[id]));
  });

  it("기본값이 고를 수 있는 것 안에 있다", () => {
    expect(EASY_RATIOS.map((one) => one.id)).toContain(EASY_DEFAULT_RATIO);
    expect(EASY_LOOKS.map((one) => one.id)).toContain(EASY_DEFAULT_LOOK);
  });
});

describe("물어야 하나", () => {
  it("아무것도 없으면 묻는다", () => {
    expect(easyAsk(빈것).asks).toBe(true);
  });

  /**
   * **붙인 것이 있으면 안 묻는다.** 그 결을 따라가는 것이 기본이라 물을 자리가
   * 아니다.
   */
  it("붙인 것이 있으면 안 묻는다", () => {
    expect(easyAsk({ attachmentCount: 1 }).asks).toBe(false);
  });

  /**
   * **이미 말했는데 또 물으면 안 들은 것이 된다.** 그리고 지금까지는 그렇게
   * 말해도 무조건 정사각형이 나왔다.
   */
  it("말 속에 있으면 안 묻고 그것을 쓴다", () => {
    const 세로 = easyAsk({ ...빈것, saidRatio: "2:3" });

    expect(세로.asks).toBe(false);
    expect(세로.ratio).toBe("2:3");
  });

  it("결만 말해도 안 묻는다", () => {
    expect(easyAsk({ ...빈것, saidLook: "anime" })).toMatchObject({ asks: false, look: "anime" });
  });

  it("물어본 뒤 고른 것이 오면 안 묻는다", () => {
    expect(easyAsk({ ...빈것, chosenRatio: "9:16" })).toMatchObject({ asks: false, ratio: "9:16" });
  });
});

describe("무엇으로 만드나", () => {
  /** **답이 없으면 지금까지대로다**(2026-09-21 사용자). */
  it("아무것도 없으면 기본값", () => {
    expect(easyAsk(빈것)).toMatchObject({ ratio: EASY_DEFAULT_RATIO, look: EASY_DEFAULT_LOOK });
  });

  /**
   * **고른 것이 가장 세다.** 방금 고른 것을 말이 덮으면 고르는 뜻이 없다.
   */
  it("고른 것이 말보다 세다", () => {
    expect(easyAsk({ ...빈것, chosenRatio: "16:9", saidRatio: "2:3" }).ratio).toBe("16:9");
    expect(easyAsk({ ...빈것, chosenLook: "3d", saidLook: "anime" }).look).toBe("3d");
  });

  /**
   * **모르는 값은 버린다.** 목록에 없는 것을 그대로 넘기면 만들기가 거절당한다
   * (`PosterProjectInputSchema`). 기본값으로 떨어지는 편이 이해할 수 있다.
   */
  it("목록에 없는 값은 없는 셈 친다", () => {
    expect(easyAsk({ ...빈것, saidRatio: "7:3", saidLook: "유화" })).toEqual({
      asks: true,
      ratio: EASY_DEFAULT_RATIO,
      look: EASY_DEFAULT_LOOK,
    });
  });
});
