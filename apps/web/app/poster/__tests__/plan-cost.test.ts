import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LLM_PLAN_USD, LLM_VISION_READ_USD, creditUnits, llmCostUsd } from "@fixup/shared";
import { planCostCounts, planCostUsd, planCostUnits, planCostNote } from "../plan-cost";

/**
 * **「그대로 생성」은 기획 LLM 값이 안 든다.**
 *
 * 03 의 「예상 비용」은 그림 값만 적는다. 기획은 따로 돌고 따로 차감되는데
 * (`plan/route.ts` 가 `reserveAiUsage` 를 부른다) 화면이 그 얘기를 안 한다.
 *
 * 「그대로 생성」을 고르면 기획이 아예 안 돈다. **안 드는 값을 안 든다고 말해야**
 * 두 갈래를 견줄 수 있다(설계 §9 의 열어 둔 물음).
 *
 * **화면 밖에서 잰다.** `.tsx` 안에 두면 「얼마가 빠지는가」를 값으로 못 잰다.
 */

describe("기획에 드는 값", () => {
  /** 기획 LLM 한 번. 첨부를 안 읽으면 이것뿐이다. */
  it("첨부가 없으면 기획 한 번 값이다", () => {
    expect(planCostUsd({ attachmentCount: 0 })).toBeCloseTo(LLM_PLAN_USD, 4);
  });

  /** 따라 만들기 그림은 레이아웃 문법을 한 장씩 읽는다. */
  it("따라 만들기 그림 수만큼 붙는다", () => {
    expect(planCostUsd({ attachmentCount: 2 })).toBeCloseTo(LLM_PLAN_USD + 2 * LLM_VISION_READ_USD, 4);
  });

  /** 지킬 사람 사진도 한 장씩 읽는다(`readPeople`). */
  it("지킬 사람 사진 수만큼 붙는다", () => {
    expect(planCostUsd({ attachmentCount: 2 })).toBeCloseTo(LLM_PLAN_USD + 2 * LLM_VISION_READ_USD, 4);
  });

  /**
   * **제품 보존도 이제 읽는다**(설계 §5-1, 2026-09-17).
   *
   * 전에는 아무도 안 읽어서 안 셌다. 읽기를 역할에서 떼어내면서 **붙인 것은
   * 전부 한 번씩** 읽는다 — 그만큼 값이 오르고, 화면이 그 사실을 말해야 한다.
   *
   * 반대로 틀리면 더 나쁘다. 실제로 깎이는 것보다 **싸게** 말하면 사용자가
   * 모르는 사이에 한도가 준다.
   *
   * **역할 목록을 그대로 넣어 잰다.** 처음에는 `styleCount` 를 직접 넘겨
   * 견줬는데 두 호출의 인자가 같아 항등식이었다 — 무엇을 세는지가 틀려도 안
   * 빨개졌다(2026-09-16 재검토).
   */
  it("제품 보존도 한 장으로 센다", () => {
    const 따라만들기만 = planCostUsd(planCostCounts(["style"]));
    const 제품보존을더함 = planCostUsd(planCostCounts(["style", "preserve_product"]));

    expect(제품보존을더함).toBeCloseTo(LLM_PLAN_USD + 2 * LLM_VISION_READ_USD, 4);
    expect(따라만들기만).toBeCloseTo(LLM_PLAN_USD + LLM_VISION_READ_USD, 4);
  });

  /**
   * **원본 그대로 넣기는 여전히 안 센다.**
   *
   * 이것만은 그림 모델을 아예 안 거친다(설계 §7). 라우트도 `referenceIds` ·
   * `preservedIds` 어느 쪽에도 안 담아서 읽지 않는다.
   */
  it("원본 그대로 넣기는 값이 안 붙는다", () => {
    expect(planCostUsd(planCostCounts(["style", "place_as_is"]))).toBeCloseTo(LLM_PLAN_USD + LLM_VISION_READ_USD, 4);
  });

  /**
   * **지킬 사람은 두 역할이다.** 「그림 느낌만」 쪽을 빠뜨리면 실제보다 싸게
   * 말한다 — 라우트는 `personIds` 에 둘 다 넣는다(`new-client.tsx`).
   */
  it("사람 지키기 두 역할을 모두 센다", () => {
    const 둘다 = planCostCounts(["preserve_person", "preserve_person_restyled"]);

    expect(둘다.attachmentCount).toBe(2);
    expect(planCostUsd(둘다)).toBeCloseTo(LLM_PLAN_USD + 2 * LLM_VISION_READ_USD, 4);
  });

  /** 아무 역할도 안 준 그림은 안 붙는다. */
  it("역할 없는 그림은 안 센다", () => {
    expect(planCostCounts(["none", "none"])).toEqual({ attachmentCount: 0 });
  });

  /** 쓴 그대로면 기획이 아예 안 돈다. */
  it("그대로 생성이면 0 이다", () => {
    expect(planCostUsd({ attachmentCount: 4, promptMode: "verbatim" })).toBe(0);
  });

  /**
   * **라우트와 같은 식을 쓴다.**
   *
   * 여기서 손으로 다시 세면 화면이 말하는 값과 실제로 깎이는 값이 갈린다.
   * 단가가 바뀌면 둘이 함께 움직여야 한다.
   */
  it("라우트가 쓰는 llmCostUsd 와 같은 값을 낸다", () => {
    expect(planCostUsd({ attachmentCount: 3 })).toBeCloseTo(
      llmCostUsd({ planCalls: 1, visionReads: 3 }),
      4,
    );
  });

  /**
   * **첨부 읽기도 작업 수만큼 는다.**
   *
   * 작업마다 기획이 한 번씩 돌고, 그때마다 붙인 그림을 **다시** 읽는다.
   * 기획 값만 곱하고 읽기 값을 안 곱하면 광고 모드에서 적게 말한다 —
   * 첨부가 0장인 경우만 재면 그 실수를 못 잡는다(2026-09-16 변이 시험).
   */
  it("작업이 여럿이면 첨부 읽기도 그만큼 는다", () => {
    expect(planCostUsd({ attachmentCount: 2, projects: 3 })).toBeCloseTo(
      llmCostUsd({ planCalls: 3, visionReads: 6 }),
      4,
    );
    expect(planCostUsd({ attachmentCount: 2, projects: 3 })).toBeCloseTo(3 * (LLM_PLAN_USD + 2 * LLM_VISION_READ_USD), 4);
  });
});

describe("한도에서 빠지는 장", () => {
  /**
   * **달러가 아니라 장이 빠진다.** $0.014 는 올림해서 1장(=$0.05)이다.
   * 달러만 적으면 실제보다 3.5배 적게 말한다.
   */
  it("기획 한 번은 1장이다", () => {
    expect(planCostUnits({ attachmentCount: 0 })).toBe(creditUnits(LLM_PLAN_USD));
    expect(planCostUnits({ attachmentCount: 0 })).toBe(1);
  });

  /**
   * **작업마다 따로 올림한다.** 라우트가 작업마다 한 번씩 예약하므로 합쳐서
   * 올림하면 모자란다 — 3작업이면 1장이 아니라 3장이다.
   */
  it("작업이 셋이면 3장이다", () => {
    expect(planCostUnits({ attachmentCount: 0, projects: 3 })).toBe(3);
  });

  it("그대로 생성이면 0장이다", () => {
    expect(planCostUnits({ attachmentCount: 2, promptMode: "verbatim" })).toBe(0);
  });
});

/**
 * **화면이 세는 것과 라우트가 읽는 것이 같아야 한다.**
 *
 * 이 커밋이 있는 이유가 「화면이 말하는 값 = 실제로 깎이는 값」인데, 값만 재는
 * 시험은 **무엇을 세는지가 틀린 것**을 못 잡았다. 라우트가 읽는 대상이 바뀌면
 * 여기서 빨개져서 `plan-cost.ts` 도 같이 고치게 한다.
 */
describe("라우트가 실제로 읽는 것", () => {
  const 라우트 = readFileSync(
    join(__dirname, "..", "..", "api", "poster", "projects", "[id]", "plan", "route.ts"),
    "utf8",
  );

  it("읽은 장수는 읽어 온 것을 그대로 센다", () => {
    expect(라우트).toContain("const visionReads = Object.keys(read.reads).length;");
  });

  /**
   * **역할이 읽기를 가르지 않는다**(설계 §5-1).
   *
   * 전에는 「따라 만들기」면 문법만, 「인물 지키기」면 사람만 읽고 제품 보존은
   * 아무도 안 읽었다. 그림을 보기도 전에 고른 버튼 하나가 배울 수 있는 것을
   * 잘라 버렸고, 그래서 2026-09-17 에 레퍼런스의 연출이 통째로 사라졌다.
   *
   * **거르는 말이 되살아나면 여기서 빨개진다.**
   */
  it("붙인 것을 역할로 안 가르고 한 번에 읽는다", () => {
    expect(라우트).toContain("readAttachments(");
    expect(라우트).toContain("[...references, ...preserved]");
  });

  it("역할로 거르던 말이 남아 있지 않다", () => {
    expect(라우트).not.toContain("personIds.has(reference.id)");
    expect(라우트).not.toContain("readPeople(");
    expect(라우트).not.toContain("readReferenceGrammar(");
  });

  /**
   * **색·글자 관계는 「따라 만들기」에서만 가져온다.**
   *
   * 붙인 것을 전부 읽게 되면서 인물 사진의 색도 읽힌다. 그것이 포스터의
   * 지배색이 되면 안 된다 — `mergeGrammar` 에 넘기는 것은 레퍼런스뿐이다.
   */
  it("합칠 값은 referenceIds 에서 고른다", () => {
    expect(라우트).toContain("project.data.referenceIds.map((id) => read.reads[id])");
  });

  /** 달러가 아니라 장으로 예약한다. */
  it("장으로 바꿔 예약한다", () => {
    expect(라우트).toContain("creditUnits(llmCostUsd({ planCalls: 1, visionReads }))");
  });
});

describe("화면에 할 말", () => {
  /**
   * **안 드는 값을 안 든다고 말한다.** 그래야 「AI 가 다듬어서」와 견줄 수 있다.
   */
  it("그대로 생성이면 기획 값이 빠진다고 알린다", () => {
    const note = planCostNote({ attachmentCount: 1, promptMode: "verbatim" });

    expect(note).toContain("기획");
    expect(note).toContain("안 듭니다");
  });

  /**
   * 다듬어서면 얼마가 더 드는지 숫자로 말한다. 「추가로 든다」만으로는 못 견준다.
   *
   * **단위는 장이다**(2026-09-17 사용자 결정). 회원이 쓰는 단위가 장이고
   * 사용량도 「N/M장」으로 나온다 — 한 화면에 달러가 섞이면 무엇과 견주는지가
   * 흐려진다. 달러는 관리자 화면이 갖는다.
   */
  it("다듬어서면 몇 장이 더 드는지 적는다", () => {
    const note = planCostNote({ attachmentCount: 0, promptMode: "assisted" });

    expect(note).toContain("1장");
    expect(note, "회원 화면에는 달러를 안 적는다").not.toContain("$");
  });

  /** 「장」은 받침이 있어 「이」다. 「1장가」로 나가면 안 된다. */
  it("조사가 맞다", () => {
    const note = planCostNote({ attachmentCount: 0, promptMode: "assisted" });

    expect(note).toContain("1장이");
    expect(note).not.toContain("장가");
  });

  it("첨부가 있으면 그 몫까지 더해 적는다", () => {
    // 그림을 읽는 몫이 더해져 값이 커진다. 장으로도 그 차이가 보여야 한다.
    expect(planCostUsd({ attachmentCount: 2, promptMode: "assisted" }))
      .toBeGreaterThan(planCostUsd({ attachmentCount: 0, promptMode: "assisted" }));
    expect(planCostNote({ attachmentCount: 2, promptMode: "assisted" }))
      .toContain(`${planCostUnits({ attachmentCount: 2, promptMode: "assisted" })}장`);
  });

  /** 광고 모드는 규격마다 작업이 따로 생긴다. 기획도 그만큼 돈다. */
  it("작업이 여럿이면 곱해서 적는다", () => {
    const note = planCostNote({ attachmentCount: 0, promptMode: "assisted", projects: 3 });

    expect(note).toContain("3장");
    expect(note).not.toContain("$");
  });
});
