import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupAttachments, hasStyleSource, resolveLook, type Attachment } from "@fixup/sns-core";

/**
 * **「레퍼런스 스타일」인데 따라갈 그림이 없으면 그릴 결이 없다.**
 *
 * 그 결의 지시문은 빈 문자열이다 — 따라갈 그림이 정해 주기 때문이다. 그런데
 * 따라갈 그림이 하나도 없으면 무엇으로 그릴지 정하는 말이 프롬프트에 **한 줄도
 * 안 들어가고** 모델이 제멋대로 고른다. 화면은 흐리게 막지만 화면을 안 거치는
 * 길이 있다(옛 작업 다시 돌리기).
 *
 * ── 어디서 내리나 ─────────────────────────────────────
 *
 * **작업 단위로 한 번, 흐름 맨 앞에서.** 프롬프트 만드는 자리에서 카드마다
 * 재 봤는데 틀렸다 — 그 자리가 아는 것은 **이 카드 역할에 맞는 레퍼런스**뿐이라
 * (`selectReferencesForRole`), 표지 레퍼런스만 붙인 사람의 속지·엔딩이 실사로
 * 나갔다(2026-09-17 리뷰). 화면은 그때도 「붙인 그림의 화풍을 따라갑니다」라고
 * 적고 있었다.
 *
 * 카드 하나가 자기 역할 레퍼런스를 못 찾는 것은 **다른 문제**이고,
 * `referenceWarningsForRole` 이 이미 경고한다.
 *
 * ── 왜 이 자리여야 하나 ───────────────────────────────
 *
 * 레이아웃 칸 갈래는 `buildFrame` 을 **안 지난다** — `buildSlotPrompt` 로 가서
 * 곧장 빠져나간다. 그래서 프롬프트 만드는 자리에서 막으면 그 갈래가 새고, 실제로
 * 샜다. `tuning.look` 은 둘 다 받으므로 여기가 모든 길이 지나는 자리다.
 */

const source = readFileSync(new URL("../queued-flow.ts", import.meta.url), "utf8");

const item = (kind: Attachment["kind"], patch: Partial<Attachment> = {}): Attachment => ({
  id: Math.random().toString(36).slice(2),
  kind, assetPath: "p", url: "u", ...patch,
});

describe("결을 내리는 자리", () => {
  it("흐름이 작업 단위로 한 번 내린다", () => {
    expect(source).toContain(
      'resolveLook(project.data.look ?? "auto", hasStyleSource(project.data.attachments))',
    );
  });

  /**
   * **카드마다 재면 안 된다.** 역할별 레퍼런스 수로 재는 꼴이 다시 들어오면
   * 표지만 붙인 사람의 속지가 실사로 나간다.
   */
  it("카드 역할별로 재지 않는다", () => {
    expect(source).not.toContain("references.length > 0");
    expect(source).not.toContain("input.images.length > 0");
  });
});

describe("내린 결과", () => {
  it("따라갈 그림이 없으면 실사로 내려간다", () => {
    expect(resolveLook("auto", hasStyleSource([]))).toBe("photoreal");
    expect(resolveLook("auto", hasStyleSource([item("place_as_is")]))).toBe("photoreal");
  });

  /** 있으면 그대로 둔다. 우리가 덧붙이면 그 그림의 결을 덮는다. */
  it("따라갈 그림이 있으면 그대로다", () => {
    const refs = [item("style_reference", { role: "cover" })];

    expect(resolveLook("auto", hasStyleSource(refs))).toBe("auto");
  });

  /**
   * **표지만 붙여도 속지가 실사로 안 바뀐다.** 이 커밋이 고친 회귀다.
   * 역할이 안 맞는 카드도 작업 단위 판단을 함께 받는다.
   */
  it("표지만 붙여도 작업 전체가 레퍼런스 결이다", () => {
    const refs = [item("style_reference", { role: "cover" })];
    const grouped = groupAttachments(refs);

    // 속지·엔딩은 자기 역할 레퍼런스가 없다.
    expect(grouped.styleByRole.body).toHaveLength(0);
    expect(grouped.styleByRole.ending).toHaveLength(0);
    // 그래도 작업 단위로는 따라갈 그림이 있다.
    expect(resolveLook("auto", hasStyleSource(refs))).toBe("auto");
  });

  /** 고른 결이 따로 있으면 첨부가 있든 없든 그대로 간다. */
  it("고른 결은 그대로 간다", () => {
    for (const has of [true, false]) {
      expect(resolveLook("anime", has)).toBe("anime");
    }
  });
});

/**
 * **장면을 쓰는 LLM 이 어떤 모델이 그릴지 알아야 한다.**
 *
 * 카드뉴스는 LLM 이 **프롬프트 본문을 직접 쓴다.** 그래서 「이 모델에 맞게
 * 쓰라」가 손댈 자리가 있다 — 실측에서 문장 길이가 갈렸다(2026-09-17,
 * 각 2회): 이름 없음 1,674자 · gpt 계열 992자 · nano 계열 1,850자.
 *
 * 포스터에서 같은 것을 해 봤을 때는 아무 차이가 없었다. 거기서는 기획이 칸에
 * **내용만** 채우고 문장은 코드가 짜서, 모델 얘기가 손댈 자리가 없다(§11-7).
 */
describe("장면 LLM 이 아는 모델", () => {
  it("흐름이 모델 이름을 넘긴다", () => {
    expect(source).toContain("modelId: modelEndpointLabel(project.modelId,");
  });

  /**
   * **장면 LLM 에게는 날 id 를 주면 안 된다.** 우리가 붙인 이름이라
   * 어느 업체의 무슨 모델인지 알 수 없다.
   *
   * 값 계산 쪽(`estimateCost`)은 날 id 가 맞다 — 우리 표를 찾는 열쇠다.
   * 그래서 파일 전체가 아니라 **이 부름의 인자만** 본다.
   */
  it("장면 LLM 에는 날 id 를 안 준다", () => {
    const 부름 = source.slice(
      source.indexOf("await writeImagePrompt({"),
      source.indexOf("dependencies.sceneProvider)"),
    );

    expect(부름.length, "writeImagePrompt 부름을 못 찾았다").toBeGreaterThan(50);
    expect(부름).not.toContain("modelId: project.modelId");
  });
});
