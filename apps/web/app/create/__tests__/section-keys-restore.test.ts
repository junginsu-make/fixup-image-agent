import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { restoreSectionKeys } from "../section-keys-restore";

/**
 * **되살린 키가 지금 그리는 섹션과 짝이 맞아야 한다.**
 *
 * 레이어와 섹션별 설정은 순서가 아니라 **고유 키**로 저장한다. 그 키 목록이
 * 지금 화면에 그리는 섹션과 길이가 다르면, 레이어가 **남의 섹션에 붙는다.**
 *
 * 전에는 「초안의 키 개수 === **초안의** 섹션 개수」로 확인했다. 그런데 화면이
 * 실제로 그리는 것은 `initialResult` 의 섹션이다. 둘이 다르면 짝이 어긋난 채
 * 통과한다.
 */
const 섹션 = (ids: string[]) => ids.map((id) => ({ section_id: id })) as never[];

describe("저장된 키를 되살린다", () => {
  it("짝이 맞으면 저장된 키를 그대로 쓴다", () => {
    const 키 = restoreSectionKeys({
      draftKeys: ["a", "b"],
      draftSections: 섹션(["S1", "S2"]),
      renderedSections: 섹션(["S1", "S2"]),
    });

    expect(키).toEqual(["a", "b"]);
  });

  it("**그리는 섹션과 개수가 다르면 저장된 키를 안 쓴다**", () => {
    // 초안끼리는 맞지만(2:2) 화면은 3장을 그린다. 그대로 쓰면 한 장이 키가 없다.
    const 키 = restoreSectionKeys({
      draftKeys: ["a", "b"],
      draftSections: 섹션(["S1", "S2"]),
      renderedSections: 섹션(["S1", "S2", "S3"]),
    });

    expect(키).toHaveLength(3);
    expect(키).not.toEqual(["a", "b"]);
  });

  it("저장된 키가 없으면 새로 짓는다", () => {
    const 키 = restoreSectionKeys({
      draftKeys: undefined,
      draftSections: undefined,
      renderedSections: 섹션(["S1", "S2"]),
    });

    expect(키).toHaveLength(2);
  });

  it("**새로 지을 때는 그리는 섹션으로 짓는다** — 초안 것으로 지으면 또 어긋난다", () => {
    const 키 = restoreSectionKeys({
      draftKeys: ["a"],
      draftSections: 섹션(["S1"]),
      renderedSections: 섹션(["X1", "X2"]),
    });

    expect(키).toHaveLength(2);
  });

  it("중복된 AI 응답 id 도 서로 다른 키가 된다", () => {
    const 키 = restoreSectionKeys({
      draftKeys: undefined,
      draftSections: undefined,
      renderedSections: 섹션(["S1", "S1"]),
    });

    expect(new Set(키).size).toBe(2);
  });
});

/** `renderedSections:` 뒤에 무엇을 넘기는지. 줄 끝이나 쉼표까지 본다. */
const RENDERED_RE = new RegExp(String.raw`renderedSections:\s*([^,\r\n]+)`, "g");

describe("화면이 실제로 쓰는가", () => {
  const editor = readFileSync(new URL("../PdpEditor.tsx", import.meta.url), "utf8");

  it("**두 곳 모두 같은 판단을 쓴다** — 한 곳만 고치면 짝이 또 갈린다", () => {
    expect([...editor.matchAll(/restoreSectionKeys\(/g)]).toHaveLength(2);
  });

  it("**그리는 섹션을 넘긴다** — 초안 것을 넘기면 어긋난 채 통과한다", () => {
    // `renderedSections:` 뒤에 무엇이 오는지 본다. 초안이 섞이면 안 된다.
    const 넘긴값 = [...editor.matchAll(RENDERED_RE)].map((m) => m[1]);

    expect(넘긴값).toHaveLength(2);
    for (const 값 of 넘긴값) {
      expect(값).toContain("initialResult.blueprint.sections");
      expect(값).not.toContain("initialDraftState");
    }
  });

  it("옛 비교식이 남아 있지 않다", () => {
    expect(editor).not.toContain("initialDraftState?.sectionKeys?.length === (initialDraftState?.sections?.length ?? -1)");
  });
});
