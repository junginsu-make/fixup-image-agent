import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 백필이 카드뉴스 흐름에 사본 자리를 얹는 규칙.
 *
 * 이 규칙이 틀리면 **회원이 그 사이 고친 것이 사라진다.** 백필은 500건을
 * 한꺼번에 읽고 한 건씩 내려받아 인코딩하므로, 뒤쪽 작업은 읽은 지 수십 분 뒤에
 * 쓴다. 그래서 쓰기 직전에 다시 읽고 「사본 자리만」 얹는다.
 *
 * 스크립트는 `.mjs` 이고 불러오는 순간 환경변수를 확인하며 죽으므로 import 할 수
 * 없다. 순수 함수라 소스를 꺼내 그대로 실행한다 — **출처는 스크립트 하나뿐이라**
 * 시험이 스크립트를 베끼지 않는다.
 */
const script = readFileSync(
  path.resolve(__dirname, "../../../../scripts/backfill-thumbnails.mjs"),
  "utf8",
);

function loadWithThumbPaths(): (data: unknown, paths: Map<number, string>) => unknown {
  const start = script.indexOf("function withThumbPaths(");
  if (start < 0) throw new Error("withThumbPaths 를 찾지 못했습니다.");
  const rest = script.slice(start);
  const end = rest.search(/^\}/m);
  if (end < 0) throw new Error("withThumbPaths 의 끝을 찾지 못했습니다.");
  const source = rest.slice(0, end + 1);
  // 꺼낸 조각이 실제 알맹이인지 확인한다. 자르기가 어긋나면 아래가 전부 헛돈다.
  expect(source).toMatch(/pathByIndex\.get\(card\.index\)/);
  return new Function(`${source}; return withThumbPaths;`)() as never;
}

const withThumbPaths = loadWithThumbPaths();
const flow = (cards: unknown[]) => ({ flow: { cards }, title: "그대로" });

describe("사본 자리를 얹을 때", () => {
  it("사본이 없던 카드에 자리를 적는다", () => {
    const result = withThumbPaths(
      flow([{ index: 0, assetPath: "a.png" }]),
      new Map([[0, "a.thumb.webp"]]),
    ) as { flow: { cards: Array<{ thumbPath?: string }> } };
    expect(result.flow.cards[0].thumbPath).toBe("a.thumb.webp");
  });

  it("그 사이 회원이 고친 것을 지운다면 이 백필은 쓸 수 없다", () => {
    const fresh = flow([
      { index: 0, assetPath: "a.png" },
      { index: 1, assetPath: "b.png", caption: "회원이 방금 적은 글" },
    ]);
    const result = withThumbPaths(fresh, new Map([[0, "a.thumb.webp"]])) as {
      title: string;
      flow: { cards: Array<{ caption?: string; thumbPath?: string }> };
    };
    expect(result.flow.cards[1].caption).toBe("회원이 방금 적은 글");
    expect(result.title).toBe("그대로");
  });

  it("이미 사본이 있는 카드는 건드리지 않는다 — 회원이 다시 만든 쪽이 새것이다", () => {
    const result = withThumbPaths(
      flow([{ index: 0, assetPath: "a.png", thumbPath: "회원이-다시-만든것.webp" }]),
      new Map([[0, "우리가-만든-낡은것.webp"]]),
    );
    expect(result).toBeNull();
  });

  it("받은 흐름을 제자리에서 고치지 않는다 — 실패해도 되돌릴 것이 없어야 한다", () => {
    const original = flow([{ index: 0, assetPath: "a.png" }]);
    withThumbPaths(original, new Map([[0, "a.thumb.webp"]]));
    expect(original.flow.cards[0]).not.toHaveProperty("thumbPath");
  });

  it("얹을 것이 하나도 없으면 null 이다 — 헛되이 쓰지 않는다", () => {
    expect(withThumbPaths(flow([{ index: 0 }]), new Map([[9, "x.webp"]]))).toBeNull();
  });

  it("흐름이 없는 모양이면 null 이다 — 알 수 없는 것에 쓰지 않는다", () => {
    expect(withThumbPaths({}, new Map([[0, "x.webp"]]))).toBeNull();
    expect(withThumbPaths({ flow: {} }, new Map([[0, "x.webp"]]))).toBeNull();
  });
});

/**
 * 되돌릴 때 **무엇을 지우는가.**
 *
 * 사본의 자리는 `{회원}/sns/{작업}/{카드}.thumb.webp` 로 정해져 있어 앱의
 * `snsPreviewPath` 와 완전히 같다. 그 사이 회원이 카드를 다시 만들었다면 그
 * 자리에 회원의 파일이 놓이고 회원의 흐름이 그것을 가리킨다. 그것까지 지우면
 * **흐름은 멀쩡한데 그림만 사라진다.**
 *
 * 스크립트는 「방금 읽은 흐름이 가리키는 자리는 남긴다」로 고른다. 그 규칙을
 * 여기 그대로 옮겨 두어, 스크립트에서 사라지면 시험이 먼저 깨지게 한다.
 */
describe("되돌릴 때 지울 것을 고르는 규칙", () => {
  const rollbackScope = script.slice(script.indexOf("const referenced = new Set("));

  it("스크립트가 그 규칙을 실제로 쓴다", () => {
    expect(rollbackScope).toMatch(/\.filter\(\(path\) => !referenced\.has\(path\)\)/);
    expect(rollbackScope.slice(0, 900)).toMatch(/fresh\.data\?\.data\?\.flow\?\.cards/);
  });

  const chooseOrphans = (uploaded: string[], freshCards: Array<{ thumbPath?: string }>) => {
    const referenced = new Set(freshCards.map((card) => card.thumbPath).filter(Boolean));
    return uploaded.filter((p) => !referenced.has(p));
  };

  it("아무도 안 쓰는 자리는 지운다", () => {
    expect(chooseOrphans(["u/sns/p/0.thumb.webp"], [{}])).toEqual(["u/sns/p/0.thumb.webp"]);
  });

  it("회원의 흐름이 가리키는 자리는 남긴다 — 지우면 그림이 사라진다", () => {
    expect(chooseOrphans(
      ["u/sns/p/0.thumb.webp"],
      [{ thumbPath: "u/sns/p/0.thumb.webp" }],
    )).toEqual([]);
  });

  it("섞여 있으면 남의 것만 남긴다", () => {
    expect(chooseOrphans(
      ["u/sns/p/0.thumb.webp", "u/sns/p/1.thumb.webp"],
      [{ thumbPath: "u/sns/p/1.thumb.webp" }],
    )).toEqual(["u/sns/p/0.thumb.webp"]);
  });
});
