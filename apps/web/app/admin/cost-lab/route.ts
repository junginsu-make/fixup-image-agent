import { readFile } from "node:fs/promises";
import { authenticateApiMember } from "../../../lib/membership/api";
import { COST_LAB_HEADERS, canOpenCostLab, costLabFilePath } from "../../../lib/admin/cost-lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 비용 전략실을 내준다.
 *
 * **페이지가 아니라 라우트다.** 내줄 것이 완성된 HTML 한 장이라, React 로
 * 감싸면 `<html>` 이 둘이 된다. 그대로 흘려보낸다.
 *
 * **문을 두 번 잠근다.**
 *
 *   ① 미들웨어 — `/admin` 규칙이 하위 경로까지 덮어 회원을 먼저 막는다
 *   ② 여기 — 그래도 다시 본다
 *
 * 미들웨어 하나에 맡기지 않는 이유가 있다. 이 저장소는 미들웨어가 조용히
 * 비껴가는 일을 이미 두 번 겪었다 — 정적 자산 matcher 에서 `woff2` 가 빠져
 * 글꼴이 307 로 튕겼고, `LOCAL_AUTH_BYPASS=1` 은 미들웨어를 통째로 건너뛴다.
 * 그때 이 화면이 열리면 가격·마진 전략이 회원에게 그대로 보인다.
 *
 * **못 들어오면 404 다.** 403 을 주면 「여기 뭔가 있다」를 알려 준다. 없는
 * 화면으로 둔다.
 */
export async function GET() {
  const auth = await authenticateApiMember();
  if (!auth.ok) return new Response("찾을 수 없습니다.", { status: 404 });
  if (!canOpenCostLab({ role: auth.member.profile.role })) {
    return new Response("찾을 수 없습니다.", { status: 404 });
  }

  try {
    const html = await readFile(costLabFilePath(), "utf8");
    return new Response(html, { headers: COST_LAB_HEADERS });
  } catch {
    /*
      **파일이 없으면 그렇게 말한다.** 이 길로 빠지는 경우는 하나다 —
      `next.config.mjs` 의 추적 목록에서 이 파일이 빠져 꾸러미에 안 담긴 것.
      빈 화면을 주면 도구가 고장 난 줄 알고 계산을 의심하게 된다.
    */
    return new Response("비용 전략실 파일을 찾지 못했습니다. 배포 꾸러미를 확인해 주세요.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
