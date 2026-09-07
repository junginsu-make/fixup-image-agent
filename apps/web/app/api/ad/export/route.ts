import { z } from "zod";
import { authenticateApiMember } from "../../../../lib/membership/api";
import { RenderBusyError, withRenderSlot } from "../../../../lib/layout/render-gate";
import { isAiBadgeEnabled } from "../../../../lib/ai-badge-setting";
import { markAsAi } from "../../../../lib/watermark";
import { getLibraryImageFile } from "../../../../lib/server-library";
import { posterStoresForUser } from "../../../../lib/poster/stores";
import { posterImageBytes } from "../../../../lib/poster/asset-bytes";
import { exportBatch, isAdExportEnabled, MAX_SPECS_PER_REQUEST } from "../../../../lib/ad/batch";
import { needsCutout } from "../../../../lib/ad/master-plan";
import { createBackgroundRemover, removeBackground } from "../../../../lib/ad/background";
import { createPosterFalClients } from "../../../../lib/poster/providers";

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
  /**
   * 어디서 그림을 가져오는가.
   *
   * **3단계가 만드는 것은 라이브러리에 없다**(설계 §10 3-e). 광고 마스터는
   * `poster_images` 에 쌓이는데 2단계는 `library_images` 만 읽어서, 마스터를
   * 만들고 이 화면에 오면 **고를 그림이 하나도 없었다.**
   *
   * 기본값이 `library` 라 **2단계 사용자는 안 깨진다** — 안 보내면 지금까지의 길이다.
   */
  source: z.enum(["library", "poster"]).default("library"),
}).strict();

/**
 * 포스터 작업의 그림 한 장.
 *
 * **소유권을 넓히지 않는다.** `poster/…/images/[index]/file` 은 관리자에게
 * 조건을 빼 주는데(첫 화면에 걸 것을 고르려고), **내보내기에는 그 필요가
 * 없다** — 넓히면 관리자가 남의 그림으로 광고를 뽑는다. 세션의 `userId` 로만
 * 조회하는 `posterStoresForUser` 가 그것을 강제한다.
 */
async function posterImageFile(
  userId: string,
  projectId: string,
  position: number,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const images = await posterStoresForUser(userId).images.byProject(projectId);
  const found = images.find((image) => image.variantIndex === position);
  if (!found) return null;
  const { bytes, contentType } = await posterImageBytes(found.assetPath);
  return { bytes, mimeType: contentType };
}

/**
 * 마스터에서 배경을 지워 오브젝트만 남긴다.
 *
 * **올리고 → 지우고 → 내려받는다.** fal 은 URL 로만 받으므로 먼저 올려야 한다.
 * 업로드는 기존 `createFalUploader` 를 그대로 쓴다.
 *
 * **결과 읽기는 `background.ts` 가 한다** — 기존 fal 큐의 `jobResult` 는
 * `data.images`(복수)를 보는데 birefnet 은 `image`(단수)라 **예외 없이 빈
 * 배열**을 준다(설계 §2.3).
 */
async function cutoutForAd(master: Buffer): Promise<Buffer> {
  const { uploader } = createPosterFalClients();
  const url = await uploader.uploadReference(master, "image/png");
  const cutUrl = await removeBackground(url, createBackgroundRemover(process.env.FAL_KEY!));
  const response = await fetch(cutUrl);
  if (!response.ok) throw new Error("배경을 지운 그림을 내려받지 못했습니다.");
  return Buffer.from(await response.arrayBuffer());
}

export async function POST(request: Request) {
  /**
   * **꺼져 있으면 없는 길이다** (계약 5).
   *
   * 스위치를 인증보다 **먼저** 본다. 그래서 로그인하지 않은 요청은 켜져 있을 때
   * 401, 꺼져 있을 때 404 를 받는다 — **스위치 상태가 밖에서 보인다.**
   *
   * 그것을 감추려면 인증을 먼저 통과시켜야 하는데, 그러면 꺼져 있는 기능이
   * 세션 조회 비용을 계속 치른다. **감출 값이 없다** — 이 기능이 있다는 사실은
   * 비밀이 아니고, 켜져 있어도 소유자가 아니면 아무것도 못 뽑는다.
   * (초판 주석은 「켜져 있는지 여부까지 알려 줄 이유가 없다」였는데, 코드가
   * 반대였다. 코드를 그대로 두고 주석을 사실에 맞췄다.)
   */
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
    const file = parsed.data.source === "poster"
      ? await posterImageFile(auth.member.userId, parsed.data.itemId, parsed.data.position)
      : await getLibraryImageFile(
        { userId: auth.member.userId, role: auth.member.profile.role },
        parsed.data.itemId,
        parsed.data.position,
        // **관리자여도 자기 것만.** 역할은 그대로 넘기고 액션으로 가른다 —
        // 역할을 지어내 넘기는 관례는 위 시험이 막으려던 바로 그것이다.
        "export",
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
    /**
     * **AI 표기를 다시 태운다** (격리 계약 7, 설계 §4.3).
     *
     * 원본에 굽힌 배지는 오른쪽 아래에 있어 **크롭이 잘라내고 축소가 뭉갠다** —
     * 214×214 에서 배지 높이는 5px 이하다. 파생 뒤에 태우면 배지 크기가 캔버스
     * 너비에 비례하므로 규격마다 알아서 맞는다.
     *
     * **켤지는 여기서 한 번만 정한다.** `markAsAi` 가 호출마다 설정을 조회하므로,
     * 조건 없이 넘기면 꺼져 있어도 규격 수만큼 조회가 돈다.
     */
    const badge = await isAiBadgeEnabled();

    /**
     * **배경 제거를 자리 밖에서 먼저 한다** (설계 §9.2).
     *
     * `withRenderSlot` 은 「스레드풀이 넷이라」 만든 **CPU** 게이트다. 그런데
     * 배경 제거는 fal 이 일하는 4초 동안 **우리 CPU 를 안 쓴다** — 그 4초를
     * 자리 안에서 기다리면 카드뉴스 미리보기가 이유 없이 429 를 받는다.
     * **게이트가 지키기로 한 자원과 실제로 쥐는 자원이 다르다.**
     *
     * 대가: 자리를 못 잡으면 이 호출값($0.003)이 버려진다. 잃는 것이 0.4원이고
     * 애초에 자리를 못 잡을 만큼 붐비는 것은 드물다.
     *
     * **조립 규격을 안 골랐으면 아예 안 부른다** — 돈과 4초를 헛되이 쓴다.
     *
     * **실패해도 여기서 안 던진다.** 조립 규격만 실패로 두면 되는데 통째로
     * 던지면 **파생 규격까지 못 받는다**(설계 §9.3).
     */
    let cutout: Buffer | undefined;
    let cutoutFailed: string | undefined;
    if (needsCutout(parsed.data.specIds)) {
      try {
        cutout = await cutoutForAd(file.bytes);
      } catch (error) {
        cutoutFailed = error instanceof Error ? error.message : "배경을 지우지 못했습니다.";
      }
    }

    const results = await withRenderSlot(
      auth.member.userId,
      () => exportBatch(file.bytes, parsed.data.specIds, {
        ...(badge ? { finish: markAsAi } : {}),
        /**
         * **이미 지워 둔 것을 준다.** 자리 안에서는 조립·인코딩만 한다.
         * 실패했으면 그 사유를 그대로 던져 그 규격만 실패로 남긴다.
         */
        ...(cutout || cutoutFailed
          ? { cutout: async () => {
              if (cutout) return cutout;
              throw new Error(cutoutFailed);
            } }
          : {}),
      }),
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
    /**
     * **`exportBatch` 가 스스로 던지는 두 문장만 그대로 돌려준다.**
     *
     * 「규격을 하나 이상 고르세요」·「한 번에 N개까지」는 사용자가 고칠 수 있는
     * 말이다. 그 밖의 것 — sharp 동적 import 실패, Supabase 클라이언트 생성
     * 실패 — 은 내부 사정이라 문구를 감춘다.
     */
    const sayable = error instanceof Error
      && (error.message.includes("고르세요") || error.message.includes("한 번에"));
    if (sayable) {
      return Response.json({ ok: false, message: (error as Error).message }, { status: 400 });
    }
    console.error("[ad-export] 뽑기 실패", { userId: auth.member.userId, error });
    return Response.json({ ok: false, message: "뽑지 못했습니다." }, { status: 500 });
  }
}
