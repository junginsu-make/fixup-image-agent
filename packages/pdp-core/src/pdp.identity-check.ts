/**
 * 그림이 나온 뒤 **무엇을 원본과 대조할 것인가.**
 *
 * ── 무엇이 빠져 있었나 ───────────────────────────────────────
 *
 * 정체성 검증(`pdp_person_check`)이 **업로드한 인물 사진에만** 돌았다.
 *
 *   저장된 캐릭터를 골라 그리면 → 「같은 사람인가」를 **아무도 안 봤다**
 *   제품                      → 대조가 **아예 없었다**. 라벨이 바뀌어도 통과
 *
 * 설계 §10.2 가 「동물/캐릭터/사물도 해당 종류의 동일성 검사 대상으로
 * 취급한다」고 적은 자리다.
 *
 * ── 할 수 있는 것과 없는 것 ──────────────────────────────────
 *
 * 같은 §10.2 가 한계도 못 박았다 — 「QA 는 확률적 판단이다. 보이지 않는 면의
 * 정확한 형상을 증명할 수 없다.」 그래서 이 대조는 **「달라 보인다」를 잡는
 * 것**이지 「똑같다」를 증명하는 것이 아니다. 불확실하면 불확실하다고 말한다.
 */

import { resolvePersonSource } from "./pdp.person-source";
import type { PersonSource } from "./pdp.person-source";

export interface IdentityReference {
  base64: string;
  mimeType: string;
  /** 생김새 서술. 그림 한 장으로는 옆·뒷모습을 가릴 수 없어 말로 보탠다. */
  identityPrompt?: string;
}

export type IdentityKind = "person" | "character" | "product";

export interface IdentityCheckTarget {
  kind: IdentityKind;
  reference: { base64: string; mimeType: string };
  identityPrompt?: string;
}

export interface IdentityCheckInput {
  /** 이 섹션에 사람이 나오는가. 아니면 사람은 대조할 것이 없다. */
  withModel?: boolean;
  uploadedPerson?: IdentityReference;
  characters?: IdentityReference[];
  /** 제품 원형을 지키기로 했는가. */
  /** 둘 다 있을 때 누구를 쓰기로 했는가(U-04). */
  personSource?: PersonSource;
  preserveProduct?: boolean;
  productImage?: IdentityReference;
}

export function identityCheckPlan(input: IdentityCheckInput): IdentityCheckTarget[] {
  const targets: IdentityCheckTarget[] = [];

  if (input.withModel) {
    /*
      **그림에 실제로 들어간 쪽과 대조한다.**

      둘 다 있으면 사용자가 고른다(U-04, `resolvePersonSource`). 안 고르면
      업로드가 쓰인다. 어느 쪽이든 **그림에 안 들어간 얼굴로 대조하면** 「다른
      사람」이 나와 멀쩡한 그림을 다시 만든다 — 실제로 그렇게 3장을 태웠다.
    */
    if (
      resolvePersonSource({
        hasUploadedPerson: Boolean(input.uploadedPerson),
        hasCharacter: Boolean(input.characters?.length),
        choice: input.personSource,
      }) === "uploaded" && input.uploadedPerson
    ) {
      targets.push({
        kind: "person",
        reference: { base64: input.uploadedPerson.base64, mimeType: input.uploadedPerson.mimeType },
        identityPrompt: input.uploadedPerson.identityPrompt,
      });
    } else if (input.characters?.length) {
      // **첫 장만 본다.** 각도마다 부르면 값이 몇 배가 되고, 어느 각도로 그릴지는
      // 모델이 정하므로 전부 맞출 수도 없다.
      const [first] = input.characters;
      targets.push({
        kind: "character",
        reference: { base64: first!.base64, mimeType: first!.mimeType },
        identityPrompt: first!.identityPrompt,
      });
    }
  }

  if (input.preserveProduct && input.productImage) {
    targets.push({
      kind: "product",
      reference: { base64: input.productImage.base64, mimeType: input.productImage.mimeType },
    });
  }

  return targets;
}
