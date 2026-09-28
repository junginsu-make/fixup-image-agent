import { createHash } from "node:crypto";

/**
 * 상세페이지 결과를 **서버가 라이브러리 작업 하나에** 맞출 때의 규칙(2026-09-28).
 *
 * 전에는 브라우저가 등록했다. 만든 직후 창을 닫거나 저장이 실패하면 그림은 서버에
 * 있는데 라이브러리에는 안 보였다(09-23 에 8장이 실제로 그렇게 빠졌다).
 *
 * ── 두 번의 독립 리뷰가 정한 것 ────────────────────────────────
 *
 * - **서버는 라이브러리에서 아무것도 지우지 않는다.** 첫 판은 「지금 페이지에 없는
 *   자리를 잘라 낸다」였는데, 구성을 다시 짜면 섹션 id 가 전부 새로 지어져 끝낸
 *   여덟 장이 통째로 지워졌다(1차 HIGH-1)
 * - **작업 하나 = 페이지 한 판.** 작업에 지금 페이지에 없는 섹션이 있으면(지웠거나
 *   구성이 바뀌었다) 그 작업은 그대로 두고 **새 작업**을 만든다(2차 MEDIUM-1)
 * - 순서를 바꿨으면 **자리만 옮긴다**. 새 섹션은 붙이고 그 자리로 옮긴다
 * - 되살려 넣은 옛 작업(표시 없음)은 장수가 같을 때만 자리대로 이어 쓴다. 다르면
 *   새 작업 — 전에는 그 문서를 영원히 못 맞추고 멈췄다(2차 HIGH-B)
 *
 * - **화면이 보고 있는 그림이 기준이다**(3차 리뷰 HIGH). 서버의 「가장 최근 기록」은
 *   예전 초안·기록 실패·겹친 요청에서 화면과 달랐다. 그 기록으로 채우면 틀린 그림을
 *   두고 「저장됨」이라 했다. 이제 그림의 지문(`artifactTag`)으로 맞춰 본다
 *
 * 여기는 무엇을 할지만 정하고 저장은 `library-sync.ts` 가 한다.
 */

const short = (value: string | Buffer) => createHash("sha1").update(value).digest("hex").slice(0, 8);

/** 섹션의 짧은 표시(8자리). */
export function sectionKey(sectionId: string): string {
  return short(`section:${sectionId}`);
}

/**
 * 그림의 짧은 표시(8자리) — **그림 바이트의 지문**이다. 화면이 보고 있는 그림의 지문과
 * 같은 규칙(sha1 앞 8자리)이라, 화면과 서버가 「같은 그림인가」를 바이트 없이 맞춰 본다.
 */
export function artifactTag(bytes: Buffer): string {
  return short(bytes);
}

/**
 * 라이브러리 파일 이름에 새길 표시 — `s<섹션>-a<그림>`. 저장할 때 뒤에 무작위 조각이
 * 한 번 더 붙는다(겹친 쓰기가 서로의 파일을 되돌리지 않게, 리뷰 LOW-2).
 */
export function libraryFileKey(section: string, artifact: string): string {
  return `s${section}-a${artifact}`;
}

export interface FileKey {
  section: string;
  artifact: string;
}

/**
 * 라이브러리 파일 이름(`<user>/<item>/<자리>-s<섹션>-a<그림>[-<조각>].<확장자>`)에서
 * 표시를 읽는다. 작은 사본(`.thumb.webp`)과 옛 이름은 `null` 이다.
 */
export function parseLibraryFileKey(path: string): FileKey | null {
  const name = path.split("/").at(-1) ?? "";
  if (name.includes(".thumb.")) return null;
  const matched = /^\d+-s([0-9a-f]{8})-a([0-9a-f]{8})(?:-[0-9a-z]+)?\.[a-z0-9]+$/i.exec(name);
  return matched ? { section: matched[1]!.toLowerCase(), artifact: matched[2]!.toLowerCase() } : null;
}

export interface ItemPlan {
  /** 이 작업에 이어 쓸 수 있나. 아니면 새 작업을 만든다(이 작업은 그대로). */
  compatible: boolean;
  /** 그림을 바꿀 자리와, 페이지의 순번. */
  replace: Array<{ position: number; index: number }>;
  /** 붙일 것(페이지의 순번). */
  append: number[];
  /** 다 한 뒤 자리를 페이지 차례로 옮겨야 하나. */
  reorder: boolean;
}

/** 페이지의 한 섹션. 그림(`artifact`)을 모르면 `null` — 서버에도 없고 화면도 안 보냈다. */
export interface PageEntry {
  section: string;
  artifact: string | null;
}

/**
 * 작업 하나(자리·표시)를 페이지에 맞출 계획. **지우는 계획은 없다.**
 */
export function planItemSync(
  rows: ReadonlyArray<{ position: number; key: FileKey | null }>,
  page: ReadonlyArray<PageEntry>,
): ItemPlan {
  const no: ItemPlan = { compatible: false, replace: [], append: [], reorder: false };
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const untagged = sorted.filter((row) => row.key === null);

  /*
    표시 없는 줄이 섞였으면(되살려 넣은 옛 작업, 또는 그것을 바꾸다 일부만 된 것)
    **장수가 같고 표시된 줄이 제자리에 있을 때만** 자리대로 이어 쓴다.
  */
  if (untagged.length > 0) {
    if (sorted.length !== page.length) return no;
    const aligned = sorted.every((row, index) => row.key === null || row.key.section === page[index]!.section);
    if (!aligned) return no;
    const replace = sorted.flatMap((row, index) => {
      const artifact = page[index]!.artifact;
      return artifact !== null && (row.key === null || row.key.artifact !== artifact) ? [{ position: row.position, index }] : [];
    });
    return { compatible: true, replace, append: [], reorder: false };
  }

  // 작업에 지금 페이지에 없는 섹션이 있으면 다른 판이다 — 손대지 않는다.
  const pageSections = new Set(page.map((entry) => entry.section));
  if (sorted.some((row) => !pageSections.has(row.key!.section))) return no;

  const bySection = new Map(sorted.map((row) => [row.key!.section, row]));
  const replace: ItemPlan["replace"] = [];
  const append: number[] = [];
  page.forEach((entry, index) => {
    if (entry.artifact === null) return;
    const have = bySection.get(entry.section);
    if (!have) append.push(index);
    else if (have.key!.artifact !== entry.artifact) replace.push({ position: have.position, index });
  });

  // 붙인 뒤의 차례(있던 것 + 뒤에 붙인 것)가 페이지 차례와 다르면 옮긴다.
  const after = [...sorted.map((row) => row.key!.section), ...append.map((index) => page[index]!.section)];
  const present = new Set(after);
  const target = page.map((entry) => entry.section).filter((section) => present.has(section));
  const reorder = after.some((section, index) => section !== target[index]);
  return { compatible: true, replace, append, reorder };
}
