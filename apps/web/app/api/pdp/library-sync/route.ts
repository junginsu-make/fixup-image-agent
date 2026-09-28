import { authenticateApiMember } from "../../../../lib/membership/api";
import { isLocalStoreEnabled } from "../../../../lib/local-store";
import { isPdpJobsEnabled } from "../../../../lib/pdp/jobs";
import { LibrarySyncBusyError, libraryQueueFull, syncDocumentLibraryNow } from "../../../../lib/pdp/jobs/library-sync";
import { hasDuplicateSections, libraryConfirmFromBody } from "../../../../lib/pdp/jobs/library-sync-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * **서버가 이 상세페이지를 라이브러리에 다 넣었는지 확인하고, 모자라면 채운다**
 * (2026-09-28, 독립 리뷰 HIGH-2).
 *
 * 생성 라우트는 라이브러리 맞추기를 **기다리지 않고** 걸어 둔다. 그것이 실패하거나
 * 배포 재시작으로 끊기면 아무도 채우지 않았다 — 화면은 서버가 한 줄 알고 안 올렸다.
 * 그래서 화면이 생성을 마치면 이 문을 부른다. 같은 문서의 맞추기는 차례로 돌기 때문에
 * 뒤에서 돌던 것이 끝난 뒤에 이것이 돈다 — 할 일이 없으면 바로 끝난다.
 *
 * 요청에는 **화면이 보고 있는 그림의 지문**(`pageSectionHashes`)이 실린다. 서버는 작업의
 * 그림과 지문을 맞춰 본다 — 서버의 옛 생성 기록으로 채우지 않는다(3차 리뷰 HIGH).
 *
 * 답: `{ ok, desired, covered, missing }` — `missing` 은 그림이 작업에 없거나 화면과
 * 다른 섹션이다. 화면은 그 섹션의 그림을 **한 장씩** `supplied` 로 다시
 * 보낸다 — 서버가 **같은 작업**에 붙인다. 전에는 화면이 페이지 전체를 따로 새 작업으로
 * 올려, 한 장을 다시 만들 때마다 같은 페이지가 한 벌씩 늘었다(2차 리뷰 HIGH-A).
 *
 * 서버가 맞출 수 없는 환경(기록 꺼짐·로컬)이면 `ok: false, reason: "unavailable"` —
 * 그때만 화면이 예전처럼 직접 올린다. 다른 실패에는 올리지 않는다(2차 리뷰 MEDIUM-2).
 *
 * 돈이 드는 일은 없다. 이미 만든 그림을 옮길 뿐이다. 자기 문서만 — 회원 id 는 세션에서.
 */
export async function POST(req: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  if (!isPdpJobsEnabled() || isLocalStoreEnabled()) return Response.json({ ok: false, reason: "unavailable" });

  // 줄이 가득 찼으면 본문(최대 16MB)을 읽기도 전에 돌려보낸다(4차 리뷰 LOW).
  if (libraryQueueFull()) return Response.json({ ok: false, reason: "busy" }, { status: 429 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, reason: "invalid_request" }, { status: 400 });
  }
  // 섹션 id 가 겹치는 예전 초안은 서버가 맞출 수 없다 — 화면이 예전처럼 올린다.
  if (body && typeof body === "object" && hasDuplicateSections(body as Record<string, unknown>)) {
    return Response.json({ ok: false, reason: "unavailable" });
  }
  const input = body && typeof body === "object" ? libraryConfirmFromBody(auth.member.userId, body as Record<string, unknown>) : null;
  if (!input) return Response.json({ ok: false, reason: "invalid_request" }, { status: 400 });

  try {
    const summary = await syncDocumentLibraryNow(input);
    return Response.json({ ok: true, ...summary });
  } catch (error) {
    // 줄이 가득 찼다 — 화면은 「잠시 뒤 다시」를 안내한다(3차 리뷰 MEDIUM).
    if (error instanceof LibrarySyncBusyError) return Response.json({ ok: false, reason: "busy" }, { status: 429 });
    // 저장소 문구를 화면에 흘리지 않는다. 화면은 「다시 확인」을 안내한다.
    console.error("[pdp-library-sync] 확인 실패", error);
    return Response.json({ ok: false, reason: "failed" }, { status: 500 });
  }
}
