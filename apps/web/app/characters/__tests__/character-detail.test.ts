import { describe, expect, it } from "vitest";
import { characterDetailRows, shownViews } from "../character-detail";

/**
 * 캐릭터 「과정 보기」가 무엇을 보여주나.
 *
 * 카드뉴스·포스터와 달리 캐릭터는 단계를 밟는 흐름이 아니다. 보여줄 것은
 * **설정과 결과물**이다 — 내가 적은 묘사, AI 가 정리한 정체성, 종류·화풍,
 * 각도별 그림.
 */
describe("characterDetailRows", () => {
  const full = {
    sourcePrompt: "호랑이 마스코트, 모자 쓴",
    identityPrompt: "주황 털에 검은 줄무늬, 둥근 얼굴",
    kind: "character",
    look: "illustration",
    createdAt: "2026-09-01",
  };

  it("사람이 적은 말과 AI 가 정리한 것을 나눠서 보여준다", () => {
    const rows = characterDetailRows(full);

    expect(rows[0]).toEqual({ label: "이렇게 말했습니다", value: "호랑이 마스코트, 모자 쓴" });
    expect(rows[1]!.value).toBe("주황 털에 검은 줄무늬, 둥근 얼굴");
  });

  it("종류와 화풍을 사람 말로 바꾼다", () => {
    const rows = characterDetailRows(full);
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));

    expect(byLabel.get("종류")).toBe("캐릭터");
    expect(byLabel.get("화풍")).toBe("그림");
  });

  it("모르는 값은 저장된 그대로 낸다 — 숨기지 않는다", () => {
    /*
      표에 없다고 숨기면 그 값이 있다는 사실까지 사라진다. 나중에 종류가
      하나 늘었을 때 화면이 조용히 빈칸을 내는 것이 가장 나쁘다.
    */
    const rows = characterDetailRows({ ...full, kind: "미확인종류", look: "새화풍" });
    const byLabel = new Map(rows.map((row) => [row.label, row.value]));

    expect(byLabel.get("종류")).toBe("미확인종류");
    expect(byLabel.get("화풍")).toBe("새화풍");
  });

  it("빈 값은 줄을 만들지 않는다", () => {
    // 「종류: 」처럼 값 없는 줄이 서면 화면이 고장난 것처럼 보인다.
    const rows = characterDetailRows({
      sourcePrompt: "호랑이", identityPrompt: "", kind: null, look: undefined,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]!.label).toBe("이렇게 말했습니다");
  });

  it("아무것도 없으면 빈 목록이다 — 던지지 않는다", () => {
    expect(characterDetailRows({})).toEqual([]);
  });
});

describe("shownViews", () => {
  it("그림이 있는 각도만 낸다", () => {
    /*
      만들다 만 캐릭터에는 그림 없는 각도가 남는다. 그것을 그리면 빈 칸이
      서고, 「그림이 사라졌다」로 읽힌다 — 포스터에서 실제로 그렇게 읽혔다
      (2026-09-16 신고).
    */
    const views = [
      { angle: "front", url: "signed:0.png" },
      { angle: "side", url: null },
      { angle: "back", url: undefined },
    ];

    expect(shownViews(views).map((view) => view.angle)).toEqual(["front"]);
  });

  it("사본만 있어도 낸다", () => {
    // 격자는 사본을 쓴다. 원본이 아직 없다고 빼면 볼 수 있는 것을 숨긴다.
    const views = [{ angle: "front", url: null, thumbUrl: "signed:0.thumb.webp" }];

    expect(shownViews(views)).toHaveLength(1);
  });

  it("비어 있거나 없으면 빈 목록이다", () => {
    expect(shownViews([])).toEqual([]);
    expect(shownViews(null)).toEqual([]);
    expect(shownViews(undefined)).toEqual([]);
  });
});

import { pickCharacter } from "../pick-character";

/**
 * 목록에서 하나 고르기.
 *
 * 단건 질의를 새로 만들지 않는 이유는 `pick-character.ts` 머리말에 적었다 —
 * 같은 규칙이 두 군데로 갈리면 한쪽만 고쳐진다.
 */
describe("pickCharacter", () => {
  const list = [{ id: "a", name: "호랑이" }, { id: "b", name: "곰" }];

  it("id 가 맞는 것을 준다", () => {
    expect(pickCharacter(list, "b")!.name).toBe("곰");
  });

  it("없으면 null 이다 — 던지지 않는다", () => {
    // 부르는 쪽이 404 로 답해야 하는데 예외로 던지면 500 이 된다.
    expect(pickCharacter(list, "없는-id")).toBeNull();
  });

  it("빈 id 는 첫 항목을 집지 않는다", () => {
    // 주소가 잘려 들어왔을 때 남의 캐릭터를 열어 주면 안 된다.
    expect(pickCharacter(list, "")).toBeNull();
  });

  it("목록이 비어 있거나 없어도 견딘다", () => {
    expect(pickCharacter([], "a")).toBeNull();
    expect(pickCharacter(null, "a")).toBeNull();
    expect(pickCharacter(undefined, "a")).toBeNull();
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 화면이 규칙을 실제로 부르는가.
 *
 * 규칙을 만들어 놓고 안 부르면 소용이 없다 — 이 저장소가 두 번 겪었다
 * (2026-09-08·2026-09-15). **찾지 말고 센다.**
 */
describe("캐릭터 화면 배선", () => {
  const detail = readFileSync(
    join(__dirname, "..", "[id]", "detail-client.tsx"), "utf8");
  const tab = readFileSync(
    join(__dirname, "..", "..", "library", "characters-tab.tsx"), "utf8");

  it("화면이 두 규칙을 모두 부른다", () => {
    expect(detail).toContain("characterDetailRows(character)");
    expect(detail).toContain("shownViews(character.views)");
  });

  it("격자는 사본을 쓰고 확대는 원본을 연다", () => {
    const wired = detail.match(/<ThumbImage[\s\S]{0,120}src=\{gridSrc\(view\)/g) ?? [];
    expect(wired.length).toBe(1);
    expect(detail).toContain("data-viewer-src={view.url");
  });

  it("남의 캐릭터면 관리자 통로로 한 번 더 묻는다", () => {
    expect(detail).toContain("/api/admin/works/character/");
    expect(detail).toContain("readOnly: true");
  });

  it("막아만 두지 않고 복사할 길을 낸다", () => {
    expect(detail).toContain("내 것으로 복사");
    expect(detail).toContain("/copy");
  });

  it("라이브러리 캐릭터 탭에서 들어갈 수 있다", () => {
    expect(tab).toContain("과정 보기");
    expect(tab).toContain("/characters/${character.id}");
  });
});
