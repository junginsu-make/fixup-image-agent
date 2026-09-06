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
 * 흐름에 못 적었을 때 **올린 파일을 지워도 되는가.**
 *
 * 자리가 앱의 `snsPreviewPath` 와 완전히 같아, 그 사이 회원이 카드를 다시
 * 만들었다면 그 자리에 회원의 파일이 놓이고 회원의 흐름이 그것을 가리킨다.
 * 잘못 지우면 **흐름은 멀쩡한데 그림만 사라진다.**
 */
function loadWriteFailure(): (input: Record<string, unknown>) => { keepFiles: boolean } | null {
  const start = script.indexOf("function writeFailure(");
  if (start < 0) throw new Error("writeFailure 를 찾지 못했습니다.");
  const rest = script.slice(start);
  const end = rest.search(/^\}/m);
  const source = rest.slice(0, end + 1);
  // 꺼낸 조각이 알맹이인지 확인한다. 자르기가 어긋나면 아래가 전부 헛돈다.
  expect(source).toMatch(/keepFiles/);
  return new Function(`${source}; return writeFailure;`)() as never;
}

const writeFailure = loadWriteFailure();
const ok = { freshError: undefined, missing: false, rewritten: true, updateError: undefined, updatedRows: 1 };

describe("못 적었을 때 파일을 지워도 되는지", () => {
  it("다 잘 됐으면 실패가 아니다", () => {
    expect(writeFailure(ok)).toBeNull();
  });

  it("회원이 그 사이 저장했으면 지우지 않는다 — 그 자리를 회원이 쓰고 있을 수 있다", () => {
    expect(writeFailure({ ...ok, updatedRows: 0 })?.keepFiles).toBe(true);
  });

  it("회원이 그 사이 채웠으면 지우지 않는다", () => {
    expect(writeFailure({ ...ok, rewritten: false })?.keepFiles).toBe(true);
  });

  it("작업이 사라졌으면 지운다 — 아무도 가리키지 않아 영영 남는다", () => {
    expect(writeFailure({ ...ok, missing: true })?.keepFiles).toBe(false);
  });

  it("다시 읽지 못했으면 지운다 — 행은 그대로라 아무도 안 가리킨다", () => {
    expect(writeFailure({ ...ok, freshError: "네트워크" })?.keepFiles).toBe(false);
  });

  it("쓰기가 실패했으면 지운다 — 행은 그대로다", () => {
    expect(writeFailure({ ...ok, updateError: "네트워크" })?.keepFiles).toBe(false);
  });

  it("스크립트가 이 판단을 실제로 따른다", () => {
    const call = script.slice(script.indexOf("const failure = writeFailure("));
    expect(call.slice(0, 700)).toMatch(/if \(!failure\.keepFiles\)/);
    expect(call.slice(0, 700)).toMatch(/remove\(\[\.\.\.made_paths\.values\(\)\]\)/);
  });
});
