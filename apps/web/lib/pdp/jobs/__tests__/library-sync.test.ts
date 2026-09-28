import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { artifactTag, libraryFileKey, parseLibraryFileKey, sectionKey } from "../library-sync-plan";
import {
  LibrarySyncBusyError,
  scheduleLibrarySync,
  syncPdpDocumentToLibrary,
  type LibrarySyncDeps,
  type LibrarySyncInput,
} from "../library-sync";

/**
 * **서버가 상세페이지를 라이브러리 작업 하나에 맞춰 둔다**(2026-09-28 사용자 결정).
 *
 * **화면이 보고 있는 그림이 기준이다**(3차 리뷰 HIGH). 서버는 바이트를 가진 그림
 * (방금 만든 것·화면이 보낸 것)만 넣고, 나머지는 지문으로 맞춰 본 뒤 다르면 「없음」
 * 으로 알린다. 저장소를 흉내 낸 가짜로 돌린다 — **지우는 길은 가짜에도 없다.**
 */
type Row = { position: number; path: string };
function fakeWorld(initial: Record<string, Row[]> = {}) {
  const calls: string[] = [];
  const library: Record<string, Row[]> = structuredClone(initial);
  let created = 0;
  const deps: LibrarySyncDeps = {
    localOnly: () => false,
    // 가장 최근 것부터(삽입 역순).
    findItems: async () => Object.entries(library).reverse().map(([itemId, rows]) => ({ itemId, rows: [...rows] })),
    create: async ({ fileKey }) => {
      created += 1;
      const itemId = `new-${created}`;
      library[itemId] = [{ position: 0, path: `u/${itemId}/0-${fileKey}-r0.webp` }];
      calls.push(`create ${itemId}`);
      return itemId;
    },
    appendAt: async ({ itemId, position, fileKey }) => {
      library[itemId] = [...(library[itemId] ?? []), { position, path: `u/${itemId}/${position}-${fileKey}-r1.webp` }];
      calls.push(`append ${itemId}@${position}`);
      return true;
    },
    replaceAt: async ({ itemId, position, fileKey }) => {
      library[itemId] = (library[itemId] ?? []).map((row) => (row.position === position ? { position, path: `u/${itemId}/${position}-${fileKey}-r2.webp` } : row));
      calls.push(`replace ${itemId}@${position}`);
      return true;
    },
    reorder: async ({ itemId, order }) => {
      calls.push(`reorder ${itemId} ${order.join(",")}`);
      library[itemId] = order.map((from, to) => ({ ...library[itemId]!.find((row) => row.position === from)!, position: to }));
      return true;
    },
  };
  const sectionsOf = (itemId: string) =>
    [...(library[itemId] ?? [])].sort((a, b) => a.position - b.position).map((row) => parseLibraryFileKey(row.path)?.section);
  return { deps, calls, library, sectionsOf };
}

// 섹션마다 그림 한 벌. 바이트 → 지문.
const img = (label: string) => ({ base64: Buffer.from(label).toString("base64"), mimeType: "image/png" });
const hash = (label: string) => artifactTag(Buffer.from(label));
const row = (position: number, section: string, label: string, itemId = "item") =>
  ({ position, path: `u/${itemId}/${position}-${libraryFileKey(sectionKey(section), hash(label))}-zz.webp` });
const full = () => ({ item: [row(0, "a", "A"), row(1, "b", "B"), row(2, "c", "C")] });

/** 확인 문처럼: 화면의 지문을 싣고, 새 판을 열 수 있다. */
const confirm = (sections: string[], labels: Array<string | null>, extra: Partial<LibrarySyncInput> = {}): LibrarySyncInput => ({
  userId: "u",
  documentId: "d",
  pageSectionIds: sections,
  pageHashes: labels.map((label) => (label ? hash(label) : null)),
  mayFork: true,
  ...extra,
});
/** 생성 라우트처럼: 방금 만든 그림만 알고, 새 판은 못 연다. */
const generated = (sections: string[], made: Record<string, string>): LibrarySyncInput => ({
  userId: "u",
  documentId: "d",
  pageSectionIds: sections,
  images: Object.entries(made).map(([sectionId, label]) => ({ sectionId, image: img(label) })),
  mayFork: false,
});

describe("생성 라우트 — 방금 만든 그림을 넣는다", () => {
  it("**처음 만든 묶음으로 작업을 연다** — 창을 닫아도 라이브러리에 남는다", async () => {
    const world = fakeWorld();
    const summary = await syncPdpDocumentToLibrary(generated(["a", "b", "c"], { a: "A", b: "B", c: "C" }), world.deps);
    expect(world.calls).toEqual(["create new-1", "append new-1@1", "append new-1@2"]);
    expect(summary).toEqual({ desired: 3, covered: 3, missing: [] });
  });

  it("다음 묶음은 같은 작업에 붙인다", async () => {
    const world = fakeWorld({ item: [row(0, "a", "A")] });
    await syncPdpDocumentToLibrary(generated(["a", "b", "c"], { b: "B", c: "C" }), world.deps);
    expect(world.calls).toEqual(["append item@1", "append item@2"]);
  });

  it("**한 장 다시 만들면 그 자리만 바꾼다**", async () => {
    const world = fakeWorld(full());
    await syncPdpDocumentToLibrary(generated(["a", "b", "c"], { b: "B2" }), world.deps);
    expect(world.calls).toEqual(["replace item@1"]);
  });

  it("**이미 판이 있는데 맞지 않으면 새 판을 열지 않는다** — 몇 장만 알아 반쪽짜리가 된다", async () => {
    const world = fakeWorld(full());
    const summary = await syncPdpDocumentToLibrary(generated(["a", "c"], { c: "C2" }), world.deps);
    expect(world.calls).toEqual([]);
    expect(summary.missing).toEqual(["c"]);
  });
});

describe("확인 문 — 화면이 보고 있는 그림이 기준(3차 리뷰 HIGH)", () => {
  it("**지문이 같으면 아무것도 안 한다**", async () => {
    const world = fakeWorld(full());
    const summary = await syncPdpDocumentToLibrary(confirm(["a", "b", "c"], ["A", "B", "C"]), world.deps);
    expect(world.calls).toEqual([]);
    expect(summary).toEqual({ desired: 3, covered: 3, missing: [] });
  });

  it("**작업의 그림이 화면과 다르면 「없음」으로 알린다** — 서버의 옛 기록으로 채우지 않는다", async () => {
    const world = fakeWorld(full());
    const summary = await syncPdpDocumentToLibrary(confirm(["a", "b", "c"], ["A", "B-screen", "C"]), world.deps);
    expect(world.calls).toEqual([]);
    expect(summary).toEqual({ desired: 3, covered: 2, missing: ["b"] });
  });

  it("**화면이 보낸 그림으로 그 자리를 바꾼다** — 화면과 같아진다", async () => {
    const world = fakeWorld(full());
    const summary = await syncPdpDocumentToLibrary(
      confirm(["a", "b", "c"], ["A", "B-screen", "C"], { images: [{ sectionId: "b", image: img("B-screen") }] }),
      world.deps,
    );
    expect(world.calls).toEqual(["replace item@1"]);
    expect(summary.missing).toEqual([]);
  });

  it("작업에 없는 섹션을 화면이 보내면 같은 작업에 붙인다 — 새 작업을 만들지 않는다", async () => {
    const world = fakeWorld(full());
    await syncPdpDocumentToLibrary(confirm(["a", "b", "c", "x"], ["A", "B", "C", "X"], { images: [{ sectionId: "x", image: img("X") }] }), world.deps);
    expect(world.calls).toEqual(["append item@3"]);
  });

  it("그림이 없는 섹션(아직 안 만듦)은 셈하지 않는다", async () => {
    const world = fakeWorld(full());
    const summary = await syncPdpDocumentToLibrary(confirm(["a", "b", "c", "x"], ["A", "B", "C", null]), world.deps);
    expect(summary).toEqual({ desired: 3, covered: 3, missing: [] });
  });

  it("작업이 없으면 전부 「없음」이고, 화면이 보낸 첫 장으로 작업을 연다", async () => {
    const world = fakeWorld();
    expect((await syncPdpDocumentToLibrary(confirm(["a", "b"], ["A", "B"]), world.deps)).missing).toEqual(["a", "b"]);
    await syncPdpDocumentToLibrary(confirm(["a", "b"], ["A", "B"], { images: [{ sectionId: "a", image: img("A") }] }), world.deps);
    const last = await syncPdpDocumentToLibrary(confirm(["a", "b"], ["A", "B"], { images: [{ sectionId: "b", image: img("B") }] }), world.deps);
    expect(world.calls).toEqual(["create new-1", "append new-1@1"]);
    expect(last.missing).toEqual([]);
  });
});

describe("판 고르기", () => {
  it("**구성을 다시 짜면 새 작업 — 끝낸 작업은 한 장도 안 건드린다**(1차 리뷰 HIGH-1)", async () => {
    const world = fakeWorld(full());
    await syncPdpDocumentToLibrary(confirm(["n1", "n2"], ["N1", null], { images: [{ sectionId: "n1", image: img("N1") }] }), world.deps);
    expect(world.calls).toEqual(["create new-1"]);
    expect(world.library.item).toEqual(full().item);
  });

  it("**섹션을 지웠으면 새 작업에 지금 판을 담는다 — 옛 작업은 그대로**(2차 리뷰 MEDIUM-1)", async () => {
    const world = fakeWorld(full());
    await syncPdpDocumentToLibrary(confirm(["a", "c"], ["A", "C"], { images: [{ sectionId: "a", image: img("A") }] }), world.deps);
    await syncPdpDocumentToLibrary(confirm(["a", "c"], ["A", "C"], { images: [{ sectionId: "c", image: img("C") }] }), world.deps);
    expect(world.calls).toEqual(["create new-1", "append new-1@1"]);
    expect(world.library.item).toEqual(full().item);
    world.calls.length = 0;
    expect((await syncPdpDocumentToLibrary(confirm(["a", "c"], ["A", "C"]), world.deps)).missing).toEqual([]);
    expect(world.calls).toEqual([]);
  });

  it("**순서를 바꾸면 자리만 옮긴다**", async () => {
    const world = fakeWorld(full());
    await syncPdpDocumentToLibrary(confirm(["c", "a", "b"], ["C", "A", "B"]), world.deps);
    expect(world.calls).toEqual(["reorder item 2,0,1"]);
    expect(world.sectionsOf("item")).toEqual(["c", "a", "b"].map(sectionKey));
  });

  it("가운데에 새 섹션을 넣으면 붙인 뒤 자리를 옮긴다", async () => {
    const world = fakeWorld({ item: [row(0, "a", "A"), row(1, "c", "C")] });
    await syncPdpDocumentToLibrary(generated(["a", "b", "c"], { b: "B" }), world.deps);
    expect(world.calls).toEqual(["append item@2", "reorder item 0,2,1"]);
  });

  it("새로 붙이는 자리는 가장 큰 자리 다음이다 — 중간이 비어 있어도 겹치지 않는다", async () => {
    const world = fakeWorld({ item: [row(0, "a", "A"), row(5, "b", "B")] });
    await syncPdpDocumentToLibrary(generated(["a", "b", "c"], { c: "C" }), world.deps);
    expect(world.calls).toEqual(["append item@6"]);
  });
});

describe("되살려 넣은 옛 작업(표시 없음)", () => {
  const legacy = () => ({ legacy: [0, 1, 2].map((position) => ({ position, path: `u/legacy/${position}-deadbeef.webp` })) });

  it("장수가 같으면 자리대로 쓰고, 그림을 모르는 자리는 「없음」으로 알린다", async () => {
    const world = fakeWorld(legacy());
    const summary = await syncPdpDocumentToLibrary(confirm(["a", "b", "c"], ["A", "B", "C"], { images: [{ sectionId: "b", image: img("B") }] }), world.deps);
    expect(world.calls).toEqual(["replace legacy@1"]);
    expect(summary).toEqual({ desired: 3, covered: 1, missing: ["a", "c"] });
  });

  it("**바꾸기가 실패하면 된 것만 센다**(2차 리뷰 MEDIUM-3)", async () => {
    const world = fakeWorld(legacy());
    const summary = await syncPdpDocumentToLibrary(
      confirm(["a", "b", "c"], ["A", "B", "C"], { images: [{ sectionId: "b", image: img("B") }] }),
      { ...world.deps, replaceAt: async () => false },
    );
    expect(summary.missing).toEqual(["a", "b", "c"]);
  });

  it("**장수가 다르면 새 작업을 만든다 — 옛 작업은 그대로**(2차 리뷰 HIGH-B)", async () => {
    const world = fakeWorld({ legacy: legacy().legacy.slice(0, 2) });
    await syncPdpDocumentToLibrary(confirm(["a", "b", "c"], ["A", "B", "C"], { images: [{ sectionId: "a", image: img("A") }] }), world.deps);
    expect(world.calls).toEqual(["create new-1"]);
    expect(world.library.legacy).toHaveLength(2);
  });
});

describe("그 밖", () => {
  it("로컬 저장소 모드에서는 아무것도 안 한다", async () => {
    const world = fakeWorld();
    expect(await syncPdpDocumentToLibrary(generated(["a"], { a: "A" }), { ...world.deps, localOnly: () => true })).toEqual({ desired: 0, covered: 0, missing: [] });
    expect(world.calls).toEqual([]);
  });

  it("**붙이다 실패하면 멈추고, 들어간 만큼만 셈한다**", async () => {
    const world = fakeWorld();
    const summary = await syncPdpDocumentToLibrary(generated(["a", "b", "c"], { a: "A", b: "B", c: "C" }), { ...world.deps, appendAt: async () => false });
    expect(summary).toEqual({ desired: 3, covered: 1, missing: ["b", "c"] });
  });
});

describe("같은 문서는 한 번에 하나씩", () => {
  it("**겹쳐 불러도 차례로 돈다**", async () => {
    const order: string[] = [];
    const slow = (label: string) => async () => {
      order.push(`${label}:start`);
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push(`${label}:end`);
    };
    await Promise.all([scheduleLibrarySync("u:d", slow("first")), scheduleLibrarySync("u:d", slow("second"))]);
    expect(order).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("앞의 것이 실패해도 뒤의 것은 돈다", async () => {
    const ran: string[] = [];
    await Promise.allSettled([
      scheduleLibrarySync("u:e", async () => { throw new Error("boom"); }),
      scheduleLibrarySync("u:e", async () => { ran.push("second"); }),
    ]);
    expect(ran).toEqual(["second"]);
  });

  it("**서버 전체로는 두 개까지만 동시에** — 메모리 911MB", async () => {
    let now = 0;
    let peak = 0;
    const job = () => async () => {
      now += 1;
      peak = Math.max(peak, now);
      await new Promise((resolve) => setTimeout(resolve, 10));
      now -= 1;
    };
    await Promise.all(["a", "b", "c", "d"].map((key) => scheduleLibrarySync(`g:${key}`, job())));
    expect(peak).toBe(2);
  });

  it("**자리를 넘기는 틈에 새로 온 것이 끼어들지 않는다**(2차 리뷰 LOW-1)", async () => {
    let now = 0;
    let peak = 0;
    const job = () => async () => {
      now += 1;
      peak = Math.max(peak, now);
      await new Promise((resolve) => setTimeout(resolve, 5));
      now -= 1;
    };
    const first = ["h1", "h2", "h3"].map((key) => scheduleLibrarySync(`h:${key}`, job()));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const late = scheduleLibrarySync("h:late", job());
    await Promise.all([...first, late]);
    expect(peak).toBe(2);
  });

  it("**줄이 가득 차면 거절한다** — 그림을 쥔 요청이 쌓여 서버가 죽지 않게(3차 리뷰 MEDIUM)", async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const held = [0, 1, 2].map(() => scheduleLibrarySync("q:same", () => gate));
    await expect(scheduleLibrarySync("q:same", async () => {})).rejects.toBeInstanceOf(LibrarySyncBusyError);
    const others = Array.from({ length: 9 }, (_, index) => scheduleLibrarySync(`q:${index}`, () => gate));
    await expect(scheduleLibrarySync("q:overflow", async () => {})).rejects.toBeInstanceOf(LibrarySyncBusyError);
    release();
    await Promise.all([...held, ...others]);
    // 비우면 다시 받는다.
    await expect(scheduleLibrarySync("q:same", async () => "ok")).resolves.toBe("ok");
  });
});
