import { describe, expect, it } from "vitest";
import { POSTER_STEPS, currentPosterStep, posterSteps, reachableBeforeCreate } from "../steps";

/**
 * 이미지 만들기의 **단계 차례.**
 *
 * 예전 차례는 「01 레퍼런스 → 02 규격 → 03 지시」였다. 첫 칸이 「따라 만들
 * 이미지」라서 **글만 들고 온 사람은 시작조차 못 했다**(2026-09-16 사용자 보고).
 *
 * 지금은 「무엇을 만들까」를 먼저 묻고, 그 다음에 따라 만들 그림이 있는지 묻는다.
 * 없으면 글만 모델로 간다 — 엔진은 진작부터 그럴 줄 알았다(`pickEndpoint`).
 *
 * **차례를 값으로 재 둔다.** 화면 안에만 있으면 누가 되돌려도 아무도 모른다.
 */

const ids = () => POSTER_STEPS.map((step) => step.id);

describe("단계 차례", () => {
  it("지시가 맨 앞이다", () => {
    expect(ids()[0]).toBe("instruction");
  });

  /** 그림을 붙이고 나서 규격을 봐야 「예상 비용」이 맞는 모드(t2i·i2i)로 계산된다. */
  it("레퍼런스가 규격보다 앞이다", () => {
    expect(ids().indexOf("reference")).toBeLessThan(ids().indexOf("spec"));
  });

  it("만들기 전 세 단계, 만든 뒤 두 단계", () => {
    expect(ids()).toEqual(["instruction", "reference", "spec", "plan", "result"]);
  });

  /** 번호가 곧 차례다. 어긋나면 막대와 본문이 다른 말을 한다. */
  it("이름표 번호가 차례와 같다", () => {
    POSTER_STEPS.forEach((step, index) => {
      expect(step.label.startsWith(`0${index + 1} `)).toBe(true);
    });
  });

  /** 레퍼런스가 선택이 됐다는 것이 이름표에 보여야 한다. */
  it("레퍼런스가 선택임을 적는다", () => {
    const reference = POSTER_STEPS.find((step) => step.id === "reference");
    expect(`${reference?.label} ${reference?.desc}`).toContain("선택");
  });
});

describe("만들기 전에 갈 수 있는 단계", () => {
  it("앞 세 단계는 열려 있다", () => {
    for (const id of ["instruction", "reference", "spec"]) {
      expect(reachableBeforeCreate(id)).toBe(true);
    }
  });

  /** 04·05 는 작업이 있어야 생긴다. 막대에는 보이되 갈 수는 없다. */
  it("기획·결과는 아직 못 간다", () => {
    expect(reachableBeforeCreate("plan")).toBe(false);
    expect(reachableBeforeCreate("result")).toBe(false);
  });
});

/**
 * **「그대로 생성」은 04 를 건너뛴다** (설계 §3.2).
 *
 * 그 갈래는 기획 LLM 을 안 돌린다. 슬롯이 비어 있고 채울 일도 없으니 04 에는
 * **고칠 것이 없다.** 그런데 막대는 「04 기획 확인」을 그대로 내보이고 있었다
 * (2026-09-17 설계 대조). 눌러 들어가면 빈 칸만 나온다 — 무엇을 해야 할지
 * 모르게 만드는 자리다.
 *
 * 값이 새지는 않았다. 부름을 막는 쪽은 화면과 서버 둘 다 하고 있었다.
 * 어긋난 것은 **사용자에게 보이는 차례**뿐이다.
 */
describe("그대로 생성일 때의 차례", () => {
  it("04 기획 확인이 빠진다", () => {
    const 차례 = posterSteps("verbatim").map((step) => step.id);

    expect(차례).toEqual(["instruction", "reference", "spec", "result"]);
  });

  it("다듬어서 생성은 지금까지대로다", () => {
    expect(posterSteps("assisted")).toEqual(POSTER_STEPS);
  });

  /** 옛 작업에는 이 칸이 없다. 지금까지대로 읽는다(설계 §9). */
  it("안 고른 작업도 지금까지대로다", () => {
    expect(posterSteps(undefined)).toEqual(POSTER_STEPS);
  });

  /**
   * **번호를 다시 매기지 않는다.** 04 를 빼고 결과를 「04 결과」로 바꾸면,
   * 같은 화면을 두 사람이 다른 번호로 부르게 된다. 이름표는 무엇을 하는
   * 자리인지 가리키는 것이지 몇 번째인지 세는 것이 아니다.
   */
  it("남은 단계의 이름표는 그대로다", () => {
    const 결과 = posterSteps("verbatim").find((step) => step.id === "result");

    expect(결과?.label).toBe("05 결과");
  });
});

/**
 * **지금 어느 단계인가.**
 *
 * 그대로 생성은 04 가 없으므로 만든 직후에도 「05 결과」에 서 있다. 없는 단계를
 * 가리키면 막대가 아무 곳도 안 밝힌다 — 어디쯤 왔는지 알 수 없다.
 */
describe("만든 뒤 서 있는 단계", () => {
  it("그림이 있으면 결과다", () => {
    expect(currentPosterStep({ hasImages: true, promptMode: "assisted" })).toBe("result");
  });

  it("아직 없으면 기획이다", () => {
    expect(currentPosterStep({ hasImages: false, promptMode: "assisted" })).toBe("plan");
  });

  it("그대로 생성은 기획이 없어 결과에 선다", () => {
    expect(currentPosterStep({ hasImages: false, promptMode: "verbatim" })).toBe("result");
  });

  /** 가리키는 곳이 막대에 실제로 있어야 한다. */
  it("가리키는 단계가 막대에 있다", () => {
    for (const promptMode of ["verbatim", "assisted"] as const) {
      for (const hasImages of [true, false]) {
        const 차례 = posterSteps(promptMode).map((step) => step.id);

        expect(차례).toContain(currentPosterStep({ hasImages, promptMode }));
      }
    }
  });
});
