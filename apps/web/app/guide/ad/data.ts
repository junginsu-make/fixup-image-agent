import { AD_SPECS } from "../../../lib/ad/specs";
import { PORTAL_LABEL } from "../../ad/export-rules";

/**
 * 설명서가 쓸 광고 규격 표.
 *
 * **목록을 베껴 적지 않는다.** 규격은 포털이 조용히 바꾸고, 그때 코드는 고치면서
 * 설명서를 잊으면 안내가 거짓말이 된다. 이 저장소의 다른 설명서도 같은 약속을
 * 지킨다 — 비율·모델·역할·심사 항목을 전부 코드에서 가져다 쓴다.
 */

export { AD_SPECS };

/** 포털 · 상품별로 묶은 표 한 줄. `ChoiceTable` 이 그대로 받는다. */
export function adPortalSummary(): Array<[string, string, string]> {
  const groups = new Map<string, { portal: string; product: string; labels: string[] }>();

  for (const spec of AD_SPECS) {
    const key = `${spec.portal}/${spec.product}`;
    const found = groups.get(key) ?? {
      portal: PORTAL_LABEL[spec.portal],
      product: spec.product,
      labels: [],
    };
    // 필수를 따로 적는다 — 없으면 등록 자체가 안 되는 것과 성과가 떨어지는 것은 다르다.
    found.labels.push(`${spec.label}${spec.required ? " (필수)" : ""}`);
    groups.set(key, found);
  }

  return [...groups.values()].map((group) => [
    group.portal,
    group.product,
    group.labels.join(" · "),
  ]);
}
