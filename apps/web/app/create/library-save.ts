/**
 * 상세페이지를 라이브러리에 **한 작업으로** 올리는 규칙.
 *
 * ── 왜 따로 두나 ───────────────────────────────────────────
 *
 * 운영에서 저장이 통째로 실패했다(2026-09-23 로그):
 *
 *   Request body exceeded 10MB for /api/library.
 *   [library:save] SyntaxError: Unterminated string in JSON
 *
 * 묶음 예산이 디코드한 바이트로 20MB 였는데, 앞단(미들웨어)은 요청 본문을
 * **10MB** 에서 자른다. base64 는 1.33배라 두 장만 담아도 넘었다.
 *
 * 그리고 묶음마다 새 작업이 되어 한 페이지가 「(1/3)」처럼 여러 줄로
 * 흩어졌다. 모든 묶음에 **같은 `sourceId`** 를 실으면 서버가 한 작업에
 * 이어 붙인다(`saveOrAppendLibraryItem`).
 */

/**
 * 요청 하나에 담을 base64 글자 수. 본문은 거의 이것이다.
 *
 * 앞단이 10MB 에서 자르므로 기획안(`blueprint`)과 JSON 껍데기가 들어갈 자리를
 * 넉넉히 남긴다.
 */
export const LIBRARY_REQUEST_CHARS = 7 * 1024 * 1024;

/** 예산에 맞게 묶는다. 한 장이 예산보다 커도 버리지 않고 혼자 보낸다. */
export function requestBatches<T extends { base64: string }>(items: readonly T[]): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let chars = 0;
  for (const item of items) {
    if (current.length > 0 && chars + item.base64.length > LIBRARY_REQUEST_CHARS) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current = [...current, item];
    chars += item.base64.length;
  }
  return current.length > 0 ? [...batches, current] : batches;
}

/** 32비트 FNV-1a. 사람이 읽을 값이 아니라 같은지 대조하는 용도다. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

type VersionSection = { key: string; image: string; layers: readonly unknown[] };

/**
 * 판을 이루는 것들을 한 줄로. 그림은 수 MB 라 통째로 쓰지 않고 길이와 끝부분만
 * 본다. 다른 그림이 길이와 끝 96글자까지 같을 일은 없다.
 */
function versionText(sections: ReadonlyArray<VersionSection>): string {
  return sections
    .map((section) => `${section.key}|${section.image.length}|${section.image.slice(-96)}|${JSON.stringify(section.layers)}`)
    .join("\n");
}

/**
 * 지금 페이지의 **판**을 가리키는 열쇠. 화면이 「저장됨」을 가리는 데 쓴다.
 *
 * 그림·순서·얹은 글자 중 하나라도 바뀌면 달라진다 — 저장본은 얹은 글자를
 * 구워서 올리기 때문이다.
 */
export function libraryVersionKey(sections: ReadonlyArray<VersionSection>): string {
  return fnv1a(versionText(sections));
}

/**
 * 128비트 해시(cyrb128). `crypto.subtle` 을 못 쓴다 — 운영 주소가 http 라
 * 브라우저가 그 기능을 막는다.
 */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * 라이브러리의 **작업 열쇠**(`sourceId`). UUID 모양이다.
 *
 * **표의 칸이 `uuid` 다**(`library_items.source_id`, 202607300001). 다른 글자를
 * 보내면 조회와 저장이 형식 오류로 둘 다 실패한다(독립 리뷰 CRITICAL).
 *
 * **초안 id 를 섞지 않는다.** 새 작업은 중간에 초안 id 를 받고, 그때 편집기가
 * 새로 그려져 기억이 사라진다. 그림으로만 지으면 다시 열어도, id 가 생겨도
 * 같은 작업을 가리킨다 — 이미 올린 장은 서버가 알아보고 다시 안 붙인다.
 */
export function libraryWorkId(sections: ReadonlyArray<VersionSection>): string {
  const hex = cyrb128(`pdp-library|${versionText(sections)}`)
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
  // 이름 기반(v5) 모양으로 판번호와 변형 자리를 채운다.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** 이 판을 어디까지 보냈나. 화면이 들고 있다. */
export interface LibraryUploadProgress {
  key: string;
  sent: number;
}

/**
 * 몇 번째 장부터 보내면 되나.
 *
 * **다 보낸 판은 다시 안 보낸다.** 같은 `sourceId` 로 또 보내면 서버가 같은
 * 장을 한 작업 뒤에 또 이어 붙인다. **끊긴 판은 이어서 보낸다** — 처음부터
 * 보내면 앞부분이 두 번 붙는다.
 */
export function pendingLibraryUpload(
  progress: LibraryUploadProgress | null,
  key: string,
  total: number,
): { from: number; done: boolean } {
  if (!progress || progress.key !== key) return { from: 0, done: false };
  const from = Math.min(progress.sent, total);
  return { from, done: from >= total };
}
