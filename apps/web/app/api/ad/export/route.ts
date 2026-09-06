import { z } from "zod";
import { authenticateApiMember } from "../../../../lib/membership/api";
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
const RequestSchema = z.object({
  itemId: z.string().trim().min(1),
  position: z.number().int().min(0),
  specIds: z.array(z.string().trim().min(1)).min(1).max(MAX_SPECS_PER_REQUEST),
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

    const results = await exportBatch(file.bytes, parsed.data.specIds);

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
    // 상한을 넘긴 요청 등은 사용자가 고칠 수 있는 것이라 400 으로 돌려준다.
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "뽑지 못했습니다." },
      { status: 400 },
    );
  }
}
