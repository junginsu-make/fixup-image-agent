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

  it("레퍼런스가 있어야 한다 — 따라 만들 기준이 없으면 못 만든다", () => {
    expect(PosterProjectInputSchema.safeParse({ ...valid, referenceIds: [] }).success).toBe(false);
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
