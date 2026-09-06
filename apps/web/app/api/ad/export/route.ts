import { z } from "zod";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { RenderBusyError, withRenderSlot } from "../../../../lib/layout/render-gate";
import { getLibraryImageFile } from "../../../../lib/server-library";
import { exportBatch, isAdExportEnabled, MAX_SPECS_PER_REQUEST } from "../../../../lib/ad/batch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 라이브러리 그림 한 장에서 고른 광고 규격들을 뽑아 준다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §10 2단계
 *
 * **생성을 부르지 않는다.** 이미 만들어 둔 결과물만 읽는다 — 격리 계약 6
 * (기존 저장물을 읽기만 한다)이 이 길에서 저절로 지켜진다.
 *
 * **ZIP 을 만들지 않는다.** 바이트를 그대로 돌려주고 화면이 `jszip` 으로 묶는다
 * (`app/library/ResultViewer.tsx:153` 과 같은 방식). 그래야 **미리보기와 내려받기가
 * 같은 바이트를 쓴다** — 설계 §5.2 가 경계한 「같은 파생을 두 번 돌리기」다.
 *
 * 소유권은 `getLibraryImageFile` 이 본다. 경로를 여기서 조립하지 않는다.
 */
/**
 * **문자열마다 상한을 건다.**
 *
 * 이 저장소는 본문 크기 상한이 어느 층에도 없다 — Caddy 에도, Next 설정에도,
 * 라우트 핸들러 기본값에도. 그래서 스키마가 마지막 문이다.
 *
 * 상한이 없으면 4MB 짜리 문자열 24개(본문 100MB)가 들어오고, 본문 문자열 +
 * 파싱 결과 + `trim()` 사본 + 되비추는 사본 + 직렬화 출력이 동시에 살아
 * **6.4배로 부푼다**(독립 리뷰 실측: rss 251MB → 640MB). sharp 는 한 번도
 * 안 타는데 프로세스가 죽는다.
 *
 * 같은 저장소의 `api/sns/layout/preview/route.ts:13` 이 이미 그 본을 보인다.
 */
const RequestSchema = z.object({
  // 라이브러리 item id 는 uuid 다. 넉넉히 잡아도 64 면 충분하다.
  itemId: z.string().trim().min(1).max(64),
  // 한 작업의 그림 수에는 상한이 있다(`api/library/route.ts`).
  position: z.number().int().min(0).max(1_000),
  // 규격 id 는 `naver-smartchannel` 이 가장 길다(19자).
  specIds: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_SPECS_PER_REQUEST),
}).strict();

export async function POST(request: Request) {
  // **꺼져 있으면 없는 길이다** (계약 5). 401 이 아니라 404 다 — 켜져 있는지
  // 여부까지 알려 줄 이유가 없다.
  if (!isAdExportEnabled()) return new Response("찾을 수 없습니다.", { status: 404 });

  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "요청을 확인해 주세요." },
      { status: 400 },
    );
  }

  try {
    const file = await getLibraryImageFile(
      { userId: auth.member.userId, role: auth.member.profile.role },
      parsed.data.itemId,
      parsed.data.position,
    );
    if (!file) return new Response("찾을 수 없습니다.", { status: 404 });

    /**
     * **동시 실행을 막는다.**
     *
     * 규격 전부를 요청하면 sharp 인코드가 20회 돌고 12MP 마스터에서 4.4초가
     * 걸린다. 진짜 희소 자원은 **libuv 스레드풀(기본 4)** 이라, 이런 요청이
     * 넷만 겹쳐도 다른 모든 요청의 파일 읽기·DNS 까지 함께 굶는다.
     *
     * 이 저장소는 같은 판단을 이미 했다 — `lib/layout/render-gate.ts` 가
     * 카드뉴스 합성 미리보기에 회원당 1·전체 2 를 걸고 있다. **막아야 하는 것은
     * 요청의 크기가 아니라 빈도**라는 그 머리말이 이 경로에도 그대로 맞는다.
     *
     * **일부러 그 게이트를 나눠 쓴다.** 광고 전용 게이트를 따로 두면 전체 동시
     * 실행이 2 + 2 = 4 가 되어, 스레드풀 넷을 정확히 채운다 — 게이트가 막으려던
     * 바로 그 상태다. 지키는 자원이 기능별이 아니라 **프로세스 전체에 하나**이니
     * 상한도 하나여야 한다.
     *
     * 대가는 있다. 광고를 뽑는 동안 카드뉴스 미리보기가 429 를 더 자주 받는다
     * (광고 한 요청이 2.6초를 쓴다). 줄을 세우지 않고 바로 거절하는 것이 이
     * 게이트의 설계라, 사용자는 기다리지 않고 다시 누르면 된다.
     */
    const results = await withRenderSlot(
      auth.member.userId,
      () => exportBatch(file.bytes, parsed.data.specIds),
    );

    /**
     * 바이트를 base64 로 실어 보낸다.
     *
     * 33% 가 붙지만, **미리보기와 ZIP 이 같은 바이트를 쓰게 하는 값**이다.
     * 파일로 따로 내려주면 화면이 규격마다 다시 요청하게 되고, 그때마다 서버가
     * 파생을 다시 돌린다.
     */
    return Response.json({
      ok: true,
      results: results.map(({ bytes, ...rest }) => ({
        ...rest,
        // **형식을 못 박지 않는다.** 규격마다 다르다 — jpg 로 고정하면 PNG 규격이
        // 열리는 날 화면이 조용히 잘못된 그림을 그린다.
        ...(bytes
          ? { dataUrl: `data:image/${rest.format === "jpg" ? "jpeg" : "png"};base64,${bytes.toString("base64")}` }
          : {}),
      })),
    });
  } catch (error) {
    // 붐비는 것은 사용자 잘못이 아니다. 다시 누르면 되는 상황이라 429 다.
    if (error instanceof RenderBusyError) {
      return Response.json({ ok: false, message: error.message }, { status: error.status });
    }
    // 상한을 넘긴 요청 등은 사용자가 고칠 수 있는 것이라 400 으로 돌려준다.
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "뽑지 못했습니다." },
      { status: 400 },
    );
  }
}
