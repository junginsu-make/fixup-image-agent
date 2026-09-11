import { readFile } from "node:fs/promises";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import {
  COST_LAB_HEADERS,
  canOpenCostLab,
  costLabDocPath,
  costLabDocument,
  costLabFontPath,
  costLabTokenPath,
  isCostLabDoc,
} from "../../../../../lib/admin/cost-lab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 비용 전략실 문서를 창(`iframe`)에 내준다.
 *
 * 주소 모양이 파일 이름 그대로인 이유가 있다 — 도구 안에서 두 문서가
 * **상대 경로로 서로를 건다**(`href="index.html"`). 그래야 그 링크가 그냥
 * 동작한다.
 *
 * **문을 두 번 잠근다.** 미들웨어의 `/admin` 규칙이 먼저 막지만 여기서도
 * 다시 본다. 이 저장소는 미들웨어가 조용히 비껴가는 일을 이미 두 번 겪었다 —
 * 정적 자산 matcher 의 `woff2` 누락, `LOCAL_AUTH_BYPASS=1`. 그때 이 화면이
 * 열리면 가격·마진 전략이 회원에게 그대로 보인다.
 *
 * **못 들어오면 404 다.** 403 은 「여기 뭔가 있다」를 알려 준다.
 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return new Response("찾을 수 없습니다.", { status: 404 });
  if (!canOpenCostLab({ role: auth.member.profile.role })) {
    return new Response("찾을 수 없습니다.", { status: 404 });
  }

  const { file } = await context.params;
  // **아는 이름만 연다.** 주소에서 받은 값을 경로에 붙이면 `../../.env` 가 들어온다.
  if (!isCostLabDoc(file)) return new Response("찾을 수 없습니다.", { status: 404 });

  try {
    /*
      셋을 함께 읽는다.

        ① 도구 문서
        ② 글꼴 선언 — 창 안은 다른 문서라 부모의 `@font-face` 가 안 내려간다
        ③ 시스템 토큰 — 같은 이유로 `--foreground` 같은 값도 안 내려간다

      ②③ 은 **읽어서 넣는다.** 베껴 적으면 두 벌이 되고, 디자인이 바뀌는 날
      한쪽만 낡는다.
    */
    const [html, fontCss, tokenCss] = await Promise.all([
      readFile(costLabDocPath(file), "utf8"),
      readFile(costLabFontPath(), "utf8"),
      readFile(costLabTokenPath(), "utf8"),
    ]);
    return new Response(costLabDocument(html, fontCss, tokenCss), { headers: COST_LAB_HEADERS });
  } catch {
    /*
      여기로 빠지는 경우는 하나다 — `next.config.mjs` 의 추적 목록에서 파일이
      빠져 꾸러미에 안 담긴 것. 빈 화면을 주면 도구가 고장 난 줄 알고 계산을
      의심하게 된다.
    */
    return new Response("비용 전략실 파일을 찾지 못했습니다. 배포 꾸러미를 확인해 주세요.", {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
