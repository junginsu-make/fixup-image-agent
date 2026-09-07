// sharp 0.35.0 은 lib/index.d.ts 를 담지만 exports 에 types 조건이 없다.
// @ts-expect-error 런타임 export 는 정상. 꾸러미 메타데이터가 선언을 가린다.
import sharp from "sharp";
import { IMAGE_MODELS, MATCH_SOURCE, chooseModelForRatio } from "@fixup/sns-core";
import { uploadUniqueReferences } from "../../../../../../lib/fal/upload";
import { authenticateApiMember } from "../../../../../../lib/membership/api";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import { createPosterFalClients, PosterProviderConfigurationError } from "../../../../../../lib/poster/providers";
import { submitPoster } from "../../../../../../lib/poster/flow";
import { referenceBytes } from "../../../../../../lib/poster/asset-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 첨부한 그림의 실제 크기를 잰다.
 *
 * 표에도 width·height 칸이 있지만 비어 있을 때가 많다 — 옛 데이터에는 안
 * 채워져 있다. 파일을 직접 읽는 쪽이 확실하다.
 */
async function measure(
  reference: { storagePath: string } | undefined,
): Promise<{ width: number; height: number } | undefined> {
  if (!reference) return undefined;
  try {
    const { bytes } = await referenceBytes(reference.storagePath);
    const meta = await sharp(bytes).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : undefined;
  } catch {
    // 못 읽으면 아래에서 "크기를 읽지 못해" 로 거절된다.
    return undefined;
  }
}

/**
 * 같은 클릭의 복제본이 도착할 수 있는 시간.
 *
 * **「생성이 얼마나 걸리는가」가 아니다.** 그것을 기준으로 잡으면 실패한 작업이
 * 그만큼 잠긴다. 더블클릭과 재전송을 덮을 만큼만 두고, 지나면 푼다.
 */
const RESUBMIT_WINDOW_MS = 60_000;

function justSubmitted(updatedAt: string): boolean {
  const at = Date.parse(updatedAt);
  // 날짜를 못 읽으면 막지 않는다 — 막는 쪽으로 틀리면 다시 만들 길이 없어진다.
  return Number.isFinite(at) && Date.now() - at < RESUBMIT_WINDOW_MS;
}

export async function POST(_request: Request, context: Context) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    /**
     * **같은 클릭이 두 번 오면 돈이 두 번 나간다.**
     *
     * 이 라우트는 `project.status` 를 안 봤고 상태 갱신도 제출 뒤였다. 더블클릭·
     * 네트워크 재전송이 그대로 fal 작업 둘이 된다(설계 §11).
     *
     * **단순히 「생성 중이면 거절」로 두면 안 된다.** `status` 가 `"failed"` 로
     * 가는 코드가 이 저장소에 없다 — `"generating"` 으로 가는 곳 하나,
     * `"done"` 으로 가는 곳 하나뿐이다. 실패하거나 창을 닫으면 작업은
     * `"generating"` 에 영원히 남고, 그것을 잠그면 **다시 만들 길이 사라진다.**
     *
     * 그래서 **짧은 창**만 본다. 막으려는 것은 같은 클릭의 복제본이지 한참 뒤의
     * 재시도가 아니다. 창이 지나면 언제나 다시 만들 수 있다.
     */
    if (project.status === "generating" && justSubmitted(project.updatedAt)) {
      return Response.json(
        { ok: false, message: "방금 만들기를 시작했습니다. 잠시 뒤에 다시 눌러 주세요." },
        { status: 409 },
      );
    }

    /**
     * **돈 쓰기 전에 자리를 잡는다.**
     *
     * 초판은 이 갱신을 제출이 **전부 끝난 뒤**에 했다. 그 사이가 fal 업로드와
     * 제출이라 수백 ms~수 초인데, 더블클릭의 두 번째 요청은 그 구간에 도착해
     * **아직 `"ready"` 인 프로젝트를 읽고 그냥 통과했다.** 위 자물쇠가 실제로
     * 막던 것은 「첫 요청이 갱신까지 마친 뒤의 재클릭」뿐이었다.
     *
     * 여기로 올리면 창이 **DB 왕복 한 번**으로 줄어든다. 완전히 닫으려면
     * 조건부 갱신(갱신된 행이 0이면 409)이 필요한데 그것은 `PosterProjectStore`
     * 를 늘리는 일이라 별건이다.
     */
    const previousStatus = project.status;
    await stores.projects.update(id, { status: "generating" });

    try {
    const fal = createPosterFalClients();
    // 따라 만들 것과 그대로 지킬 것을 함께 올린다. 순서가 프롬프트의
    // Image 번호와 같아야 하므로 레퍼런스를 먼저 둔다.
    const references = await stores.references.byIds(project.data.referenceIds);
    const preserved = await stores.references.byIds(project.data.preservedIds ?? []);
    // 같은 배치에서 같은 파일은 한 번만 올린다.
    const urls = await uploadUniqueReferences(
      [...references, ...preserved],
      (reference) => reference.id,
      async (reference) => {
        const { bytes, contentType } = await referenceBytes(reference.storagePath);
        return fal.uploader.uploadReference(bytes, contentType);
      },
    );

    /**
     * 비율이 모델보다 우선한다.
     *
     * 모델마다 만들 수 있는 비율이 다르다. 사용자가 고른 모델이 그 비율을
     * 못 만들면 거절하는 대신 **만들 수 있는 모델로 바꾼다.** 원하는 모양이
     * 먼저이고 모델은 그것을 만들 도구다.
     *
     * 조용히 바꾸지는 않는다. 바꾼 이유를 응답에 실어 화면이 말하게 한다 —
     * 모델마다 값이 다르고 결과의 결도 다르다.
     */
    const choice = chooseModelForRatio(project.ratio, project.modelId, IMAGE_MODELS);

    /**
     * 첨부한 그림을 따라가는 비율이면 그 그림의 실제 크기를 읽는다.
     *
     * **광고 마스터가 실려 있으면 재지 않는다.** 광고 규격은 정해진 크기의
     * 마스터에서 파생되는데 그 크기를 지정할 길이 달리 없었다(설계 §4.2).
     * 서버가 마스터 id 를 픽셀로 바꿔 넣은 값이라 밖에서 온 자유 픽셀이 아니다.
     *
     * **없으면 지금까지의 경로 그대로다** — `undefined ?? measure(…)` 는
     * 이전 식과 완전히 같다.
     */
    const sourceSize = project.ratio === MATCH_SOURCE
      ? project.data.adMaster ?? await measure(references[0] ?? preserved[0])
      : undefined;

    const submission = await submitPoster(
      {
        projectId: id,
        modelId: choice.model.id,
        ratioId: project.ratio,
        sourceSize,
        variants: project.data.variants,
        slots: project.data.slots,
        // 사용자가 친 말과 고른 결. 옛 작업에는 없다 — 없으면 프롬프트가
        // 지금까지처럼(추가 지시 없음 · 레퍼런스의 결을 따라감) 조립된다.
        userInstruction: project.data.userInstruction,
        look: project.data.look,
        referenceUrls: references.map((reference) => urls[reference.id]!).filter(Boolean),
        preservedUrls: preserved.map((reference) => urls[reference.id]!).filter(Boolean),
        // 사람은 지키는 방법이 다르고, 얼굴이 둘이면 제3의 인물이 나온다.
        personUrls: preserved
          .filter((reference) => (project.data.personIds ?? []).includes(reference.id))
          .map((reference) => urls[reference.id]!)
          .filter(Boolean),
      },
      { queue: fal.queue, requests: stores.requests, images: stores.images, // 제출만 하는 길이라 저장이 일어나지 않는다. 빈 값을 돌려주면 언젠가
        // 불렸을 때 `asset_path: ""` 가 조용히 들어가므로, 시끄럽게 실패한다.
        saveImage: async () => { throw new Error("제출 경로에서는 결과를 저장하지 않습니다."); } },
    );

    return Response.json({
      ok: true,
      submission,
      // 바꿨으면 화면이 그대로 보여준다. 사용자는 자기가 고른 모델로 만든 줄 안다.
      ...(choice.switched ? { modelSwitchedTo: choice.model.id, notice: choice.reason } : {}),
    });
    } catch (cause) {
      /**
       * **자리를 돌려준다.** 안 그러면 제출이 실패했을 때 프로젝트가
       * `"generating"` 에 남아 **창이 지날 때까지 다시 못 누른다** — 지금까지는
       * `"ready"` 로 남아 바로 다시 누를 수 있었다. 기존 사용자에게 없던 제약을
       * 만들지 않는다.
       *
       * 되돌리기 자체가 실패해도 원래 오류를 덮지 않는다. 창이 지나면 풀린다.
       */
      await stores.projects.update(id, { status: previousStatus }).catch(() => {});
      throw cause;
    }
  } catch (error) {
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "생성을 시작하지 못했습니다." },
      { status: 500 },
    );
  }
}
