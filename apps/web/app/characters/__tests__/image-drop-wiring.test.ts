import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 두 칸(「내 캐릭터」·「참고할 그림」)에 끌어다 놓기·붙여넣기가 걸려 있는가.
 * 화면 코드의 문장을 직접 본다 — 이 저장소에는 jsdom 이 없다.
 */
const studio = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");
const own = readFileSync(new URL("../OwnCharacterField.tsx", import.meta.url), "utf8");

function hookCall(source: string): string {
  const at = source.indexOf("useImageDropTarget({");
  expect(at).toBeGreaterThan(-1);
  return source.slice(at, source.indexOf("});", at));
}

/** 손잡이를 펼친 요소의 여는 태그. 고를 수 있는 표시와 손잡이가 **같은 요소**에 있어야 한다. */
function zoneTag(source: string, spread: string): string {
  const at = source.indexOf(spread);
  expect(at).toBeGreaterThan(-1);
  const start = Math.max(source.lastIndexOf("<Card", at), source.lastIndexOf("<div", at));
  const end = source.indexOf(">\n", at) > -1 ? source.indexOf(">", source.indexOf("className", at)) : -1;
  return source.slice(start, end + 1);
}

describe("「참고할 그림」 칸", () => {
  it("잠겼을 때는 안 받고, 받은 그림은 「새 이미지 올리기」와 같은 길로 넣는다", () => {
    const call = hookCall(studio);
    expect(call).toContain("disabled: locked");
    expect(call).toContain("attachFile([file])");
  });

  it("같은 요소가 손잡이를 갖고, 잠기면 Tab 으로 들어가지 않는다", () => {
    const tag = zoneTag(studio, "{...referenceDrop.handlers}");
    expect(tag).toContain("tabIndex={locked ? -1 : 0}");
    expect(tag).toContain('role="group"');
  });
});

describe("「내 캐릭터」 칸", () => {
  it("잠겼을 때는 안 받고, 받은 그림은 올리기와 같은 길로 넣는다", () => {
    const call = hookCall(own);
    expect(call).toContain("disabled: locked");
    expect(call).toContain("props.onUpload([file])");
  });

  it("같은 요소가 손잡이를 갖고, 잠기면 Tab 으로 들어가지 않는다", () => {
    const tag = zoneTag(own, "{...drop.handlers}");
    expect(tag).toContain("tabIndex={locked ? -1 : 0}");
    expect(tag).toContain('role="group"');
  });
});

describe("칸 밖에 놓기", () => {
  it("화면 전체가 파일 놓기로 페이지를 떠나는 것을 막는다", () => {
    expect(studio).toContain("usePreventFileNavigation();");
  });
});

describe("빠르게 두 번 넣기", () => {
  /** 함수 본문 — 다음 `async function` 앞까지. */
  function body(start: string): string {
    const from = studio.indexOf(start);
    expect(from).toBeGreaterThan(-1);
    return studio.slice(from, studio.indexOf("async function", from + start.length));
  }

  it("읽기가 늦게 끝난 옛 그림이 나중 것을 덮지 않는다 — 칸마다 마지막에 넣은 것만 남긴다", () => {
    for (const [name, seq] of [
      ["async function attachFile(", "attachSeq"],
      ["async function attachFromLibrary(", "attachSeq"],
      ["async function attachOwnFile(", "ownSeq"],
      ["async function attachOwnFromLibrary(", "ownSeq"],
    ] as const) {
      const fn = body(name);
      expect(fn, name).toContain(`const seq = ++${seq}.current;`);
      expect(fn, name).toContain(`seq === ${seq}.current`);
    }
  });
});

describe("안내 문구", () => {
  it("Mac 은 ⌘V 로 붙여넣는다", () => {
    expect(studio).toContain("⌘V");
    expect(own).toContain("⌘V");
  });
});
