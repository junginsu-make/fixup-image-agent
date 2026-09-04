import type { LibraryOrigin } from "../../../lib/server-library";

/**
 * 이 요청이 AI 결과인가, 사용자가 직접 고른 파일인가.
 *
 * 본문이 말해 주면 그 말을 따른다. 안 말해 주면 도구로 가른다 — 지금
 * `create` 로 들어오는 것은 라이브러리 화면에서 사람이 직접 고른 파일뿐이고,
 * `redesign` 은 리디자인이 만든 결과뿐이다. 상세페이지 결과를 이 길로
 * 저장하게 될 때는 `origin: "ai"` 를 적어 보내면 된다.
 *
 * 라우트 파일은 Next 가 정한 이름만 내보낼 수 있어 여기 따로 둔다.
 */
export function originOf(origin: unknown, tool: "create" | "redesign"): LibraryOrigin {
  if (origin === "ai" || origin === "upload") return origin;
  return tool === "redesign" ? "ai" : "upload";
}
