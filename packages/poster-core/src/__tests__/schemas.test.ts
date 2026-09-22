import { describe, expect, it } from "vitest";
import { EMPTY_SLOTS, PosterSlotsSchema, PosterProjectInputSchema, TYPE_INTERACTIONS } from "../schemas";

describe("포스터 슬롯", () => {
  it("빈 슬롯도 통과한다 — 기획이 실패해도 사람이 채울 수 있어야 한다", () => {
    expect(PosterSlotsSchema.safeParse(EMPTY_SLOTS).success).toBe(true);
  });

  it("긴 헤드라인을 자르거나 막지 않는다", () => {
    // 2026-08-20 결정 — 글자수를 숫자로 못 박지 않는다.
    // 내용이 길어지면 그림 단계에서 작게 넣어 소화한다.
    const long = "가".repeat(120);
    expect(PosterSlotsSchema.parse({ ...EMPTY_SLOTS, headline: long }).headline).toHaveLength(120);
  });

  it("곁텍스트는 여러 개를 담는다", () => {
    const parsed = PosterSlotsSchema.parse({ ...EMPTY_SLOTS, sideTexts: ["28MM F2.0", "ISO 400"] });
    expect(parsed.sideTexts).toHaveLength(2);
  });

  it("곁텍스트 개수는 제한한다 — 칸이 무한하지 않다", () => {
    const many = Array.from({ length: 9 }, (_unused, index) => `L${index}`);
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, sideTexts: many }).success).toBe(false);
  });

  it("타이포 관계는 네 값 중 하나다", () => {
    expect(TYPE_INTERACTIONS).toEqual(["통과", "뒤로", "가림", "감쌈"]);
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, typeInteraction: "통과" }).success).toBe(true);
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, typeInteraction: "빙글빙글" }).success).toBe(false);
  });

  it("모르는 칸을 받지 않는다", () => {
    expect(PosterSlotsSchema.safeParse({ ...EMPTY_SLOTS, 이상한칸: "값" }).success).toBe(false);
  });

  it("빈 곁텍스트는 걸러낸다 — 프롬프트에 빈 줄이 생기면 안 된다", () => {
    const parsed = PosterSlotsSchema.parse({ ...EMPTY_SLOTS, sideTexts: ["ISO 400", "  ", ""] });
    expect(parsed.sideTexts).toEqual(["ISO 400"]);
  });
});

describe("포스터 프로젝트 입력", () => {
  const valid = {
    title: "가을 사진전",
    ratio: "2:3",
    modelId: "gpt-image-2",
    variants: 3,
    instruction: "필름 카메라 감성의 사진전 포스터",
    referenceIds: ["11111111-1111-4111-8111-111111111111"],
  };

  /**
   * **글만으로도 만들 수 있다.**
   *
   * 예전에는 `min(1)` 로 막았다 — 「따라 만들 기준이 없으면 못 만든다」. 그래서
   * 글만 들고 온 사람은 시작조차 못 했다(2026-09-16 사용자 보고). 엔진은 진작
   * 할 줄 알았다: `pickEndpoint` 가 첨부 유무로 t2i·i2i 를 갈라 부르고, 값도
   * `pricing.ts` 가 모드별로 따로 잡는다.
   *
   * 화면만 고치면 모자라다. 여기를 안 풀면 화면이 버튼을 열어 줘도 API 가
   * 400 을 돌려준다.
   */
  it("레퍼런스가 없어도 받는다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, referenceIds: [] }).success).toBe(true);
  });

  it("빠져 있어도 받는다 — 빈 목록과 같은 뜻이다", () => {
    const { referenceIds: _omitted, ...withoutReferences } = valid;
    const parsed = PosterProjectInputSchema.safeParse(withoutReferences);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.referenceIds).toEqual([]);
  });

  /**
   * **그림만으로도 만들 수 있다** (2026-09-22 사용자 보고).
   *
   * 글만으로 만드는 길을 연 뒤에도 그 반대는 `instruction: min(1)` 이 막고
   * 있었다. 그림부터 붙이고 「이 그림들을 어떻게 쓸까요」에 적는 것으로
   * 시작하는 사람이 있다 — 화면만 풀면 API 가 400 을 돌려준다.
   */
  it("지시가 비어도 그림이 있으면 받는다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, instruction: "  " }).success).toBe(true);
  });

  it("지시가 빠져 있어도 받는다 — 빈 줄과 같은 뜻이다", () => {
    const { instruction: _omitted, ...withoutInstruction } = valid;
    const parsed = PosterProjectInputSchema.safeParse(withoutInstruction);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.instruction).toBe("");
  });

  /**
   * **둘 다 비면 그릴 근거가 없다.** 기획이 열한 칸을 통째로 지어내고 그 값을
   * 사용자가 낸다. 화면도 막지만(`canCreatePoster`) 화면을 안 거치는 길이 있다.
   */
  it("지시도 그림도 없으면 거절한다", () => {
    expect(PosterProjectInputSchema.safeParse({
      ...valid, instruction: "  ", referenceIds: [],
    }).success).toBe(false);
  });

  /** 지키려고 붙인 그림도 근거다 — 따라 만들 그림이 없어도 통과해야 한다. */
  it("지킬 그림만 있어도 받는다", () => {
    expect(PosterProjectInputSchema.safeParse({
      ...valid,
      instruction: "",
      referenceIds: [],
      preservedIds: ["22222222-2222-4222-8222-222222222222"],
      attachmentOrder: ["22222222-2222-4222-8222-222222222222"],
    }).success).toBe(true);
  });

  /**
   * **광고 모드는 예외다.** 비율을 `match-source` 로 보내 첨부한 그림의 크기를
   * 그대로 따라가는데, 맞출 원본이 없으면 성립하지 않는다. 화면도 막지만
   * (`canCreatePoster`) 화면을 안 거치는 길이 있다.
   */
  it("광고 규격을 지정했으면 레퍼런스가 있어야 한다", () => {
    const ad = { ...valid, adMasterId: "ad-191x1", ratio: "match-source" };

    expect(PosterProjectInputSchema.safeParse({ ...ad, referenceIds: [] }).success).toBe(false);
    expect(PosterProjectInputSchema.safeParse(ad).success).toBe(true);
  });

  it("포스터 비율만 받는다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, ratio: "a4-print" }).success).toBe(true);
    expect(PosterProjectInputSchema.safeParse({ ...valid, ratio: "21:9" }).success).toBe(false);
  });

  it("등록된 모델만 받는다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, modelId: "없는모델" }).success).toBe(false);
  });

  it("변형은 1~3장이다", () => {
    for (const variants of [0, 4]) {
      expect(PosterProjectInputSchema.safeParse({ ...valid, variants }).success).toBe(false);
    }
  });

  it("요청 본문의 user_id 를 받지 않는다", () => {
    // 서버가 세션에서만 가져온다. 본문을 믿으면 남의 이름으로 만들 수 있다.
    expect(PosterProjectInputSchema.safeParse({ ...valid, userId: "attacker" }).success).toBe(false);
    expect(PosterProjectInputSchema.safeParse({ ...valid, user_id: "attacker" }).success).toBe(false);
  });

  it("해상도나 픽셀을 받지 않는다 — 비율에서 백엔드가 정한다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, resolution: "4K" }).success).toBe(false);
    expect(PosterProjectInputSchema.safeParse({ ...valid, width: 2400 }).success).toBe(false);
  });
});

/**
 * 차례와 첨부 목록이 어긋나면 막는다.
 *
 * 어긋나도 통과하던 때는 빠진 첨부가 **조용히 사라졌다.** 오류도 경고도 없이
 * 그림이 만들어지고, 장수 상한과 비용은 세 목록(3장)을 세는데 fal 에는 차례에
 * 담긴 것(1장)만 갔다 — 「7장이라 거절」해 놓고 1장만 보내는 조합이
 * 가능했다(2026-09-08 리뷰).
 */
describe("고른 차례와 첨부 목록이 맞는가", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";
  const C = "33333333-3333-4333-8333-333333333333";
  const base = {
    title: "가을 사진전",
    ratio: "2:3",
    modelId: "gpt-image-2",
    variants: 3,
    instruction: "필름 카메라 감성의 사진전 포스터",
    referenceIds: [A],
    preservedIds: [B],
  };

  it("둘이 같으면 통과한다 — 차례는 달라도 된다", () => {
    // 화면에서 지키기(B)를 먼저 골랐으면 차례도 B 가 먼저다. 그것이 요점이다.
    const parsed = PosterProjectInputSchema.safeParse({ ...base, attachmentOrder: [B, A] });
    expect(parsed.success).toBe(true);
  });

  it("차례가 첨부보다 짧으면 막는다 — 빠진 그림이 조용히 사라진다", () => {
    const parsed = PosterProjectInputSchema.safeParse({ ...base, attachmentOrder: [A] });
    expect(parsed.success).toBe(false);
  });

  it("첨부에 없는 id 가 차례에 있으면 막는다", () => {
    const parsed = PosterProjectInputSchema.safeParse({ ...base, attachmentOrder: [A, B, C] });
    expect(parsed.success).toBe(false);
  });

  it("차례가 비어 있으면 안 본다 — 옛 작업에는 애초에 없다", () => {
    expect(PosterProjectInputSchema.safeParse(base).success).toBe(true);
    expect(PosterProjectInputSchema.safeParse({ ...base, attachmentOrder: [] }).success).toBe(true);
  });

  it("막을 때 사람이 읽을 수 있는 말을 준다", () => {
    const parsed = PosterProjectInputSchema.safeParse({ ...base, attachmentOrder: [A] });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]!.message).toContain("차례가 어긋납니다");
      expect(parsed.error.issues[0]!.path).toEqual(["attachmentOrder"]);
    }
  });
});

/**
 * **쓴 그대로 보낼지, AI 가 다듬을지.**
 *
 * 01 에 완성된 프롬프트를 넣은 사용자가 그것을 잃었다(2026-09-16). 사용자가
 * 고른 갈래를 저장해야 기획을 건너뛸지 판단할 수 있다.
 */
describe("프롬프트 갈래", () => {
  const valid = {
    title: "가을 사진전",
    ratio: "2:3",
    modelId: "gpt-image-2",
    variants: 3,
    instruction: "필름 카메라 감성의 사진전 포스터",
  };

  it("두 갈래를 받는다", () => {
    for (const promptMode of ["verbatim", "assisted"]) {
      expect(PosterProjectInputSchema.safeParse({ ...valid, promptMode }).success).toBe(true);
    }
  });

  /**
   * **옛 작업에는 이 값이 없다.** 없으면 지금까지의 동작(AI 가 다듬는다)이어야
   * 한다 — 기본값이 반대면 쓰던 사람이 깨진다.
   */
  it("안 보내면 다듬어서다", () => {
    const parsed = PosterProjectInputSchema.safeParse(valid);

    expect(parsed.success && parsed.data.promptMode).toBe("assisted");
  });

  it("모르는 값은 안 받는다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, promptMode: "raw" }).success).toBe(false);
  });
});
