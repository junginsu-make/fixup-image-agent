/**
 * 화면이 **서버에 라이브러리 저장을 확인하고, 서버가 모르는 섹션만 한 장씩 보낸다**
 * (2026-09-28, 2차 독립 리뷰 HIGH-A·MEDIUM-2, 3차 리뷰 HIGH).
 *
 * 전에는 서버가 다 못 넣었으면 화면이 페이지 전체를 **따로 새 작업**으로 올렸다. 한
 * 장을 다시 만들 때마다 그 일이 되풀이되어 같은 페이지가 라이브러리에 한 벌씩 늘었다.
 * 이제 화면은 섹션마다 **지금 보고 있는 그림의 지문**을 보내고, 서버가 「없거나 다르다」
 * 고 한 섹션의 그림만 보낸다. 서버가 **같은 작업**에 넣는다.
 *
 * - `saved`: 페이지의 그림이 전부 서버의 한 작업에 **화면과 같은 그림으로** 들어 있다
 * - `unavailable`: 서버가 맞출 수 없는 환경(기록 꺼짐·로컬) — **이때만** 화면이 예전처럼 올린다
 * - `incomplete`: 확인은 됐는데 다 못 넣었다 · `error`: 확인 자체가 안 됐다(연결 끊김·줄이
 *   가득 참 등). 둘 다 **화면이 짐작으로 올리지 않는다** — 올리면 같은 페이지가 두 벌 된다
 */
export type ServerLibraryOutcome = "saved" | "unavailable" | "incomplete" | "error";

interface SyncAnswer {
  ok: boolean;
  reason?: string;
  missing?: string[];
}

export async function confirmServerLibrary(options: {
  /** `/api/pdp/library-sync` 를 부른다. `supplied` 가 있으면 그 한 장을 싣는다. */
  request: (supplied?: { sectionId: string; base64: string; mimeType: string }) => Promise<SyncAnswer>;
  /** 화면이 그림을 가진 섹션(페이지 차례). */
  sectionIds: readonly string[];
  /** 그 섹션의 원본 그림. 못 읽으면 `null`. */
  imageOf: (sectionId: string) => { base64: string; mimeType: string } | null;
}): Promise<ServerLibraryOutcome> {
  const mine = new Set(options.sectionIds);
  const stillMissing = (answer: SyncAnswer) => (answer.missing ?? []).filter((id) => mine.has(id));

  try {
    const first = await options.request();
    if (!first.ok) return first.reason === "unavailable" ? "unavailable" : "error";

    let missing = stillMissing(first);
    // 한 장씩 보낸다. 보낸 장이 들어가지 않으면 멈춘다 — 같은 장을 되풀이해 보내지 않는다.
    for (let sent = 0; missing.length > 0 && sent < options.sectionIds.length; sent += 1) {
      const sectionId = missing[0]!;
      const image = options.imageOf(sectionId);
      if (!image) return "incomplete";
      const answer = await options.request({ sectionId, ...image });
      if (!answer.ok) return "error";
      const next = stillMissing(answer);
      if (next.includes(sectionId)) return "incomplete";
      missing = next;
    }
    return missing.length === 0 ? "saved" : "incomplete";
  } catch {
    return "error";
  }
}

/**
 * 확인 뒤 화면이 할 일(3차 리뷰 LOW — 글자 대조 대신 동작으로 시험한다).
 *
 * - `done`: 서버가 다 넣었다
 * - `retry`: 확인이 안 됐거나 다 못 넣었다 — 올리지 않고 「다시 눌러 주세요」
 * - `skip`: 서버가 맞출 수 없는데, 한 장 다시 만들기의 자동 저장이고 이미 올린 판이 있다
 *   — 또 올리면 다시 만들 때마다 한 벌씩 는다
 * - `upload`: 서버가 맞출 수 없다 — 화면이 예전처럼 올린다
 */
export function nextLibraryStep(
  outcome: ServerLibraryOutcome,
  context: { auto: boolean; singleRun: boolean; hasProgress: boolean },
): "done" | "retry" | "skip" | "upload" {
  if (outcome === "saved") return "done";
  if (outcome !== "unavailable") return "retry";
  return context.auto && context.singleRun && context.hasProgress ? "skip" : "upload";
}

/**
 * 페이지 섹션마다 지문을 **한 장씩** 짓는다. 그림이 없거나 **못 읽으면** `null` — 깨진
 * 한 장 때문에 확인 전체가 매번 실패하지 않게(리뷰 LOW). 그 섹션은 서버가 셈하지 않는다.
 */
export async function pageImageHashes(images: ReadonlyArray<string | undefined>): Promise<Array<string | null>> {
  const hashes: Array<string | null> = [];
  for (const image of images) {
    hashes.push(image ? await sectionImageHash(image).catch(() => null) : null);
  }
  return hashes;
}

/**
 * 섹션 그림의 **지문** — 그림 바이트의 sha1 앞 8자리. 서버(`artifactTag`)와 같은 규칙이다.
 * `data:` 주소가 아니면 `null`.
 */
export async function sectionImageHash(dataUrl: string): Promise<string | null> {
  const matched = /^data:[^;]+;base64,(.*)$/.exec(dataUrl);
  if (!matched) return null;
  const binary = atob(matched[1]!);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return Array.from(digest.slice(0, 4), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
