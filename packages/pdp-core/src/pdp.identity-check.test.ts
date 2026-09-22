import { describe, expect, it } from "vitest";
import { identityCheckPlan } from "./pdp.identity-check";

/**
 * **지켜야 할 것을 실제로 대조했는가.**
 *
 * 정체성 검증(`pdp_person_check`)이 **업로드한 인물 사진에만** 돌았다. 저장된
 * 캐릭터를 골라 그리면 「같은 사람인가」를 아무도 안 봤고, 제품은 아예 대조가
 * 없었다 — 라벨이 바뀌어도 통과했다.
 *
 * 설계 §10.2: 「QA 입력에 승인 제품·캐릭터 자료와 fixed identity constraints 를
 * 포함한다. **동물/캐릭터/사물도 해당 종류의 동일성 검사 대상으로 취급한다.**」
 *
 * 다만 §10.2 는 한계도 적어 두었다 — 「QA 는 확률적 판단이다. 보이지 않는 면의
 * 정확한 형상을 증명할 수 없다.」 그래서 **못 재는 것은 못 잰다고 말한다.**
 */
const 인물 = { base64: "AAA", mimeType: "image/png" };
const 캐릭터 = { base64: "BBB", mimeType: "image/png", identityPrompt: "짧은 머리 20대" };
const 제품 = { base64: "CCC", mimeType: "image/png" };

describe("무엇을 대조할지 정한다", () => {
  it("업로드한 인물이 있으면 그것을 본다", () => {
    const 계획 = identityCheckPlan({ withModel: true, uploadedPerson: 인물 });

    expect(계획.map((one) => one.kind)).toContain("person");
  });

  it("**저장된 캐릭터도 본다** — 전에는 아무도 안 봤다", () => {
    const 계획 = identityCheckPlan({ withModel: true, characters: [캐릭터] });

    expect(계획.map((one) => one.kind)).toContain("character");
  });

  it("**제품도 본다** — 라벨이 바뀌어도 통과했다", () => {
    const 계획 = identityCheckPlan({ preserveProduct: true, productImage: 제품 });

    expect(계획.map((one) => one.kind)).toContain("product");
  });

  it("인물컷이 아니면 사람을 안 본다", () => {
    const 계획 = identityCheckPlan({ withModel: false, uploadedPerson: 인물, characters: [캐릭터] });

    expect(계획.map((one) => one.kind)).not.toContain("person");
    expect(계획.map((one) => one.kind)).not.toContain("character");
  });

  it("제품 보존을 껐으면 제품을 안 본다", () => {
    expect(identityCheckPlan({ preserveProduct: false, productImage: 제품 })).toHaveLength(0);
  });

  it("**업로드 사진이 캐릭터를 밀어낸다** — 그림에 그 사람이 나온다", () => {
    const 계획 = identityCheckPlan({ withModel: true, uploadedPerson: 인물, characters: [캐릭터] });
    const 종류 = 계획.map((one) => one.kind);

    expect(종류).toContain("person");
    expect(종류).not.toContain("character");
  });

  it("지킬 것이 없으면 대조도 없다", () => {
    expect(identityCheckPlan({})).toHaveLength(0);
  });
});

describe("무엇으로 대조하는지 함께 싣는다", () => {
  it("캐릭터는 생김새 서술을 함께 준다 — 한 장으로는 옆모습을 못 가린다", () => {
    const [대상] = identityCheckPlan({ withModel: true, characters: [캐릭터] });

    expect(대상!.identityPrompt).toBe("짧은 머리 20대");
  });

  it("제품은 서술 없이 그림만 준다", () => {
    const [대상] = identityCheckPlan({ preserveProduct: true, productImage: 제품 });

    expect(대상!.identityPrompt).toBeUndefined();
    expect(대상!.reference.base64).toBe("CCC");
  });

  it("**캐릭터가 여럿이면 첫 장만 본다** — 각도마다 부르면 값이 몇 배가 된다", () => {
    const 여럿 = [캐릭터, { ...캐릭터, base64: "DDD" }];
    const 계획 = identityCheckPlan({ withModel: true, characters: 여럿 });

    expect(계획.filter((one) => one.kind === "character")).toHaveLength(1);
  });
});
