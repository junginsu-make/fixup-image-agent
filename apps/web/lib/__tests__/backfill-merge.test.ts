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

/** 함수 하나의 본문. 다음 최상위 선언 전까지를 자른다. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`async function ${name}`);
  if (start < 0) throw new Error(`${name} 을 찾지 못했습니다.`);
  const rest = source.slice(start + 1);
  const end = rest.search(/^(?:async )?function /m);
  const body = end < 0 ? rest : rest.slice(0, end);
  // 자르기가 어긋나면 아래 검사가 조용히 헛돈다. 알맹이가 들었는지 확인한다.
  expect(body).toMatch(/await supabase\.storage/);
  return body;
}

function loadWithThumbPaths(): (data: unknown, paths: Map<number, string>) => unknown {
  const start = script.indexOf("function withThumbPaths(");
  if (start < 0) throw new Error("withThumbPaths 를 찾지 못했습니다.");
  const rest = script.slice(start);
  const end = rest.search(/^\}/m);
  if (end < 0) throw new Error("withThumbPaths 의 끝을 찾지 못했습니다.");
  const source = rest.slice(0, end + 1);
  // 꺼낸 조각이 실제 알맹이인지 확인한다. 자르기가 어긋나면 아래가 전부 헛돈다.
  expect(source).toMatch(/pathByIndex\.get\(card\?\.index\)/);
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

  it("카드 목록에 빈 자리가 섞여도 죽지 않는다", () => {
    const result = withThumbPaths(
      { flow: { cards: [null, { index: 1 }] } },
      new Map([[1, "b.thumb.webp"]]),
    ) as { flow: { cards: Array<{ thumbPath?: string } | null> } };
    expect(result.flow.cards[1]?.thumbPath).toBe("b.thumb.webp");
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
 * 판단이 두 겹이다 — 작업 단위(`writeFailure`)와 경로별(호출부의 거르기).
 * 한 겹만으로는 모자란 것이 실제로 드러났다: 작업 단위로만 정했더니, 회원이
 * 카드 하나만 다시 만든 경우에 그 카드의 파일까지 함께 지웠다.
 *
 * 잘못 지우면 회원 화면에 깨진 그림이 남고, 화면에 대체가 없어
 * (`app/sns/[id]/result-board.tsx` 는 `thumbUrl ?? assetUrl` 만 본다) 회원이 그
 * 카드를 다시 만들기 전에는 낫지 않는다.
 */
function loadWriteFailure(): (input: Record<string, unknown>) => {
  message: string; raced?: boolean;
} | null {
  const start = script.indexOf("function writeFailure(");
  if (start < 0) throw new Error("writeFailure 를 찾지 못했습니다.");
  const rest = script.slice(start);
  const source = rest.slice(0, rest.search(/^\}/m) + 1);
  // 꺼낸 조각이 알맹이인지 확인한다. 자르기가 어긋나면 아래가 전부 헛돈다.
  expect(source).toMatch(/updatedRows/);
  return new Function(`${source}; return writeFailure;`)() as never;
}

const writeFailure = loadWriteFailure();
const ok = { rewritten: true, updateError: undefined, updatedRows: 1 };

describe("흐름에 못 적은 까닭을 가릴 때", () => {
  it("다 잘 됐으면 실패가 아니다", () => {
    expect(writeFailure(ok)).toBeNull();
  });

  it("회원이 그 사이 저장했으면 경합이다 — 실패로 세면 오경보가 뜬다", () => {
    expect(writeFailure({ ...ok, updatedRows: 0 })?.raced).toBe(true);
  });

  it("쓰기가 실패한 것은 경합이 아니다 — 우리 쪽 문제다", () => {
    expect(writeFailure({ ...ok, updateError: "네트워크" })?.raced).toBeUndefined();
  });

  it("얹을 것이 없는 것도 경합이 아니다 — 흐름의 모양이 예상과 다르다", () => {
    expect(writeFailure({ ...ok, rewritten: false })?.raced).toBeUndefined();
    expect(writeFailure({ ...ok, rewritten: false })?.message).toMatch(/모양/);
  });
});

describe("스크립트가 그 판단을 실제로 따르는지", () => {
  const branch = functionBody(script, "backfillSns");

  it("업로드와 얹기를 잇는 다리가 있다 — 이게 끊기면 카드뉴스가 통째로 죽는다", () => {
    // 끊기면 `withThumbPaths` 가 늘 null 이라 전 작업이 「회원이 채웠습니다」로
    // 빠지고, 경합으로 세어져 경보도 안 뜨며 요약은 성공처럼 보인다.
    expect(branch).toMatch(/madePaths\.set\(card\.index, thumbPath\)/);
  });

  it("지우는 갈래에서 경로별로 한 번 더 거른다", () => {
    expect(branch).toMatch(/orphansToRemove\(madePaths, now\.data/);
  });

  it("경합과 실패를 갈라 센다", () => {
    expect(branch).toMatch(/if \(failure\.raced\) raced \+= madePaths\.size;/);
    expect(branch).toMatch(/else failed \+= madePaths\.size;/);
  });

  it("표 갱신도 만든 자리를 그대로 쓴다 — 낡은 흐름을 거치지 않는다", () => {
    expect(branch).toMatch(/for \(const \[index, thumbPath\] of madePaths\)/);
  });

  /**
   * **잠금은 목록을 읽을 때의 시각이어야 한다.**
   *
   * 쓰기 직전에 다시 읽어 그 시각으로 잠그면, 회원이 「다시 기획」을 눌러
   * 카드가 통째로 새로 만들어진 경우에도 쓰기가 통과한다. `withThumbPaths` 는
   * 자리 번호로만 짝을 맞추는데 번호는 0..n-1 로 **재사용**되므로, 첨부A 로
   * 만든 미리보기가 첨부B 카드에 얹힌다. 그 카드는 다음 실행에서 빠지므로
   * 영영 낫지 않는다. 실제로 그렇게 만들었다가 되돌렸다.
   */
  it("목록을 읽을 때의 시각으로 잠근다 — 재기획한 작업에 낡은 그림이 붙지 않게", () => {
    expect(branch).toMatch(/\.eq\("updated_at", project\.updated_at\)/);
    expect(branch).not.toMatch(/\.eq\("updated_at", fresh/);
  });

  /**
   * 이 경보는 「시각 비교가 통째로 어긋남」을 잡으려고 둔 것이다. 그런데 그
   * 고장이 나면 모든 작업이 0행으로 떨어져 **`raced`** 로 세어진다. `failed` 만
   * 보면 잡으려던 바로 그 상황에서 침묵한다.
   */
  it("한 건도 못 썼을 때의 경보가 경합도 함께 본다", () => {
    expect(branch).toMatch(/touched === 0 && raced \+ failed > 0/);
  });

  it("지우기 전에 지금 흐름을 읽는다 — 회원의 파일을 지키는 유일한 근거다", () => {
    expect(branch).toMatch(/orphansToRemove\(madePaths, now\.data\?\.data\?\.flow\?\.cards\)/);
  });
});

/**
 * 지울 자리를 고르는 규칙. **스크립트의 진짜 함수를 실행한다.**
 *
 * 전에는 소스에 그 한 줄이 있는지만 봤다. 그러면 `referenced` 를 빈 집합으로
 * 만드는 변경이 통과한다 — 문자열은 그대로인데 거르기는 무력해진다.
 * (실제로 그 뮤테이션을 놓쳤다.)
 */
function loadOrphansToRemove(): (madePaths: Map<number, string>, cards: unknown) => string[] {
  const start = script.indexOf("function orphansToRemove(");
  if (start < 0) throw new Error("orphansToRemove 를 찾지 못했습니다.");
  const rest = script.slice(start);
  const source = rest.slice(0, rest.search(/^\}/m) + 1);
  expect(source).toMatch(/referenced/);
  return new Function(`${source}; return orphansToRemove;`)() as never;
}

const orphansToRemove = loadOrphansToRemove();

describe("지울 자리를 고를 때", () => {
  it("회원이 카드 하나만 다시 만들었으면 그 한 장은 남긴다", () => {
    expect(orphansToRemove(
      new Map([[0, "u/sns/p/0.thumb.webp"], [1, "u/sns/p/1.thumb.webp"]]),
      [{ index: 0 }, { index: 1, thumbPath: "u/sns/p/1.thumb.webp" }],
    )).toEqual(["u/sns/p/0.thumb.webp"]);
  });

  it("아무도 안 쓰는 자리는 지운다", () => {
    expect(orphansToRemove(
      new Map([[0, "u/sns/p/0.thumb.webp"]]),
      [{ index: 0 }],
    )).toEqual(["u/sns/p/0.thumb.webp"]);
  });

  it("회원이 전부 다시 만들었으면 하나도 안 지운다", () => {
    expect(orphansToRemove(
      new Map([[0, "u/sns/p/0.thumb.webp"]]),
      [{ index: 0, thumbPath: "u/sns/p/0.thumb.webp" }],
    )).toEqual([]);
  });

  it("카드 목록에 빈 자리가 섞여도 죽지 않는다 — 여기서 죽으면 실행이 통째로 멈춘다", () => {
    expect(orphansToRemove(
      new Map([[0, "u/sns/p/0.thumb.webp"]]),
      [null, { index: 0 }],
    )).toEqual(["u/sns/p/0.thumb.webp"]);
  });

  it("흐름을 모르면(카드 목록 없음) 우리 것만 지운다", () => {
    expect(orphansToRemove(new Map([[0, "u/sns/p/0.thumb.webp"]]), undefined))
      .toEqual(["u/sns/p/0.thumb.webp"]);
  });
});
