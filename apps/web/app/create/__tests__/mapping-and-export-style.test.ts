import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stableSections } from "../document-state";
import { buildOverlayTextStyle } from "../pdp-canvas-utils";

/**
 * **되던 두 가지를 개선 중에 잃지 않는다**(X-07).
 *
 * 설계 §14.6: 「정상 매핑·export style 공유 | **개선 중 회귀 방지**, 새 문서
 * UUID/renderer 로 계승」.
 *
 * 둘 다 지금 맞게 돌고 있다. 그래서 「고칠 것」이 아니라 **「잃지 말 것」**이다.
 * 이 파일은 고장을 고치는 것이 아니라, 앞으로 고장 나면 **그 자리에서 빨개지게**
 * 만든다.
 */

/**
 * **① 섹션이 누구인지 잃지 않는다.**
 *
 * 새 문서(v3)는 섹션을 UUID 로 식별한다. 모델이 준 `section_id`(S1, S2…)는
 * 섹션을 더하거나 다시 기획하면 **겹치거나 바뀐다** — 그것을 열쇠로 쓰면
 * 만든 그림이 엉뚱한 섹션에 붙는다.
 *
 * 그래서 안정된 id 를 따로 두고, **모델이 뭐라고 불렀는지**는
 * `sourceSectionId` 에 남긴다.
 */
describe("섹션 매핑이 새 문서로 계승된다", () => {
  it("**모델이 준 이름이 겹쳐도 서로 다른 섹션이다**", () => {
    const 결과 = stableSections([
      { section_id: "S1", prompt_en: "a" },
      { section_id: "S1", prompt_en: "b" },
    ] as never);

    expect(결과[0]!.id).not.toBe(결과[1]!.id);
    // 그래도 원래 이름은 잃지 않는다.
    expect(결과.map((section) => section.sourceSectionId)).toEqual(["S1", "S1"]);
  });

  it("**이미 안정된 id 는 그대로 이어받는다** — 다시 매기면 그림이 떨어진다", () => {
    const 처음 = stableSections([{ section_id: "S1", prompt_en: "a" }] as never);

    const 두번째 = stableSections(처음 as never);

    expect(두번째[0]!.id).toBe(처음[0]!.id);
  });

  it("**id 는 UUID 다** — 모델이 준 이름을 그대로 쓰지 않는다", () => {
    const 결과 = stableSections([{ section_id: "S1", prompt_en: "a" }] as never);

    expect(결과[0]!.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  /**
   * **같은 id 가 두 번 오면 하나는 새로 받는다.** 안 그러면 두 섹션이 한
   * 자리를 가리키고, 한쪽 그림이 다른 쪽을 덮는다.
   */
  it("**안정된 id 가 겹쳐 와도 갈라 준다**", () => {
    const 같은것 = "11111111-1111-4111-8111-111111111111";

    const 결과 = stableSections([
      { section_id: 같은것, prompt_en: "a" },
      { section_id: 같은것, prompt_en: "b" },
    ] as never);

    expect(결과[0]!.id).not.toBe(결과[1]!.id);
  });
});

/**
 * **② 보는 것과 받는 것이 같아야 한다.**
 *
 * 글 상자의 스타일을 화면과 내보내기가 **따로** 계산하면, 사용자가 화면에서
 * 맞춰 둔 것이 내려받은 파일에서 어긋난다. 그래서 네 조립기를 양쪽이 함께
 * 쓴다 — `pdp-canvas-utils.ts` 머리말이 그것을 ⚠️ 로 적어 두었다.
 *
 * 주석은 읽는 사람에게만 말한다. **여기서는 코드에 말한다.**
 */
describe("화면과 내보내기가 같은 스타일을 쓴다", () => {
  const 읽기 = (name: string) =>
    readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

  /**
   * **셋만 공유한다.** 머리말 주석은 넷이라고 적혀 있었지만, 도형은 내보내기가
   * 직접 짓는다(아래 시험이 그 사실을 적어 둔다).
   */
  const 조립기 = [
    "buildOverlayShellStyle",
    "buildOverlayBackgroundStyle",
    "buildOverlayTextStyle",
  ];

  it.each(조립기.map((name) => [name]))("**%s 를 내보내기가 쓴다**", (name) => {
    const utils = 읽기("pdp-canvas-utils.ts");
    const 내보내기 = utils.slice(utils.indexOf("export async function buildExportNode"));

    expect(내보내기, `${name} 이 내보내기에서 안 쓰인다`).toContain(name);
  });

  it.each([
    ["편집 화면", "PdpEditor.tsx"],
    ["미리보기", "SectionPreview.tsx"],
  ])("**%s 도 같은 조립기를 쓴다**", (_label, file) => {
    expect(읽기(file)).toContain("buildOverlayTextStyle");
  });

  /**
   * **같은 레이어면 같은 값이 나와야 한다.** 조립기가 하나뿐이라는 말의 뜻이
   * 이것이다.
   */
  it("**같은 레이어에 같은 값을 준다**", () => {
    const layer = { text: "제목", fontSize: 32, color: "#112233", fontWeight: 700 } as never;

    expect(buildOverlayTextStyle(layer)).toEqual(buildOverlayTextStyle(layer));
  });

  /**
   * **손으로 적은 글꼴 크기가 끼면 그 순간 갈라진다.** 화면만 고치고
   * 내보내기를 안 고치는 실수가 이 꼴로 들어온다.
   */
  /**
   * **도형은 아직 두 벌이다.** 내보내기가 `buildShapeLayerStyle` 을 안 쓰고
   * `backgroundColor`·`borderRadius` 를 직접 적는다. 지금은 두 곳이 같은 값을
   * 내지만, **한쪽만 고치는 날 조용히 갈린다** — 글 상자에서 막으려던 바로
   * 그 꼴이다.
   *
   * 이번에 안 고친 이유는 그 자리가 렌더링 본체라 따로 봐야 하기 때문이다.
   * 사실을 시험으로 적어 둔다 — 누가 고치면 이 시험이 빨개지고, 그때 위
   * 목록에 `buildShapeLayerStyle` 을 넣으면 된다.
   */
  it("**도형은 아직 내보내기가 직접 짓는다** — 고치면 이 시험을 바꿔라", () => {
    const utils = 읽기("pdp-canvas-utils.ts");
    const 내보내기 = utils.slice(utils.indexOf("export async function buildExportNode"));

    expect(내보내기).toContain("shapeSurface.style.backgroundColor");
    expect(내보내기).not.toContain("buildShapeLayerStyle");
  });

  it("**미리보기가 글자 스타일을 따로 짓지 않는다**", () => {
    const preview = 읽기("SectionPreview.tsx");
    const 글자자리 = preview.slice(preview.indexOf("buildOverlayTextStyle"));

    // 조립기를 부른 뒤에 fontSize 를 직접 덮으면 두 벌이 된다.
    expect(글자자리.slice(0, 300)).not.toMatch(/fontSize:\s*\d/);
  });
});
