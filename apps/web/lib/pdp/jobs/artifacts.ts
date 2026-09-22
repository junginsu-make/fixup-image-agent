/**
 * 작업이 만든 그림을 어디에 두고 어떻게 되찾는가.
 *
 * ── 기존 버킷을 그대로 쓴다 ────────────────────────────────────
 *
 * `library` 버킷의 정책은 **경로 첫 칸이 소유자**다
 * (`202607280001_server_library.sql`). 그래서 표를 조인하다 실수하는 경로 자체가
 * 없다. 새 버킷을 만들면 정책을 한 벌 더 쓰고 SQL 을 또 적용해야 한다 —
 * 지켜야 할 규칙이 두 곳이 되면 언젠가 갈린다.
 *
 * 라이브러리 목록은 `library_items` 표만 읽으므로 같은 버킷을 써도 섞이지 않는다.
 *
 * ── 왜 이걸 저장하나 ──────────────────────────────────────────
 *
 * 지금은 그림이 브라우저로만 간다. 탭을 닫으면 **이미 값을 치른 그림이 사라지고**
 * 사용자는 다시 눌러 두 번 낸다(2026-09-17 조사 K-04). 서버에 한 벌 두면
 * 돌아왔을 때 되찾을 수 있다.
 */

const PREFIX = "pdp-jobs";

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/**
 * 경로에 쓸 수 있는 이름으로 바꾼다.
 *
 * **`section_id` 는 AI 응답값이다.** 거기에 `../` 가 들어오면 남의 자리에 쓴다.
 * 한글·공백도 온다 — 스토리지 키에 그대로 넣으면 서명·조회에서 인코딩이 갈린다.
 */
function safeSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned.slice(0, 64) || "x";
}

export interface JobArtifactLocation {
  userId: string;
  jobId: string;
  sectionId: string;
  /** 몇 번째 시도인가. 다시 만든 것이 앞 것을 덮지 않게 경로에 넣는다. */
  attempt: number;
  mimeType: string;
}

export function jobArtifactPath(location: JobArtifactLocation): string {
  const extension = EXTENSION[location.mimeType] ?? "png";
  return [
    // 첫 칸이 소유자다. 버킷 정책이 이 한 칸으로 판정한다.
    safeSegment(location.userId),
    PREFIX,
    safeSegment(location.jobId),
    `${safeSegment(location.sectionId)}-${Math.max(1, Math.trunc(location.attempt))}.${extension}`,
  ].join("/");
}

/**
 * 이 경로가 그 사람 것인가.
 *
 * **칸 단위로 본다.** `startsWith("u1")` 로 재면 `u10` 이 통과한다 — 남남인데
 * 남의 그림을 내주게 된다.
 */
export function isOwnedPath(path: string, userId: string): boolean {
  if (path.includes("..")) return false;
  const [owner, ...rest] = path.split("/");
  return owner === userId && rest.length > 0;
}
