import { readLlmMeter, withLlmMeter } from "../../../../../../lib/llm/meter";
import { mergeGrammar, planPoster, readAttachments } from "@fixup/poster-core";
import { planReferences, resolveTextModel } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../../../lib/membership/api";
import { posterReferencesByIds } from "../../../../../../lib/poster/references";
import { teamIdOf } from "../../../../../../lib/teams/store";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import {
  createPosterAttachmentReader,
  createPosterPlanningProviders,
  PosterProviderConfigurationError,
} from "../../../../../../lib/poster/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 레퍼런스에서 문법을 읽고 슬롯 초안을 채운다.
 *
 * 둘 다 실패해도 던지지 않는다. 빈 슬롯과 이유를 저장하고 사람이 채운다.
 */
export async function POST(request: Request, context: Context) {
  /*
   * **본문을 여기서 한 번만 읽는다.** `Request` 의 몸은 한 번만 읽을 수 있어
   * 아래에서 또 읽으면 빈 값이 온다.
   *
   * **고른 글 모델은 Easy 모드만 보낸다**(설계 §5-4). 다른 화면 넷은 본문이
   * 비어 있고, 그때는 `undefined` 라 지금까지대로 간다.
   */
  const 고른글모델 = await request.json()
    .then((body) => (typeof body?.textModel === "string" ? body.textModel : undefined))
    .catch(() => undefined);
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 문법 읽기·사람 읽기·기획이 모두 여기로 모인다.
  return withLlmMeter(() => plan(request, context, 고른글모델));
}

async function plan(request: Request, context: Context, 고른글모델?: string) {
  /**
   * **`catch` 에서도 봐야 한다.** 안에서 선언하면 실패했을 때 예약을 못 풀고,
   * 묶인 장이 만료될 때까지 그 사람 한도에서 빠져 있는다.
   */
  let reservation: { userId: string; requestId: string } | null = null;
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const stores = posterStoresForUser(auth.member.userId);
    const project = await stores.projects.get(id);
    if (!project) return Response.json({ ok: false, message: "포스터 작업을 찾을 수 없습니다." }, { status: 404 });

    /**
     * **쓴 그대로 보낼 작업은 기획을 안 돌린다.**
     *
     * 사용자가 완성된 프롬프트를 들고 왔고 「쓴 그대로 생성」을 골랐다.
     * 여기서 AI 를 돌리면 그 프롬프트를 슬롯 11칸으로 요약하게 되는데,
     * 그것이 바로 이 갈래가 막으려던 일이다(2026-09-16 사용자 보고).
     *
     * **값도 안 든다.** 안 돌면 LLM 호출이 없으니 예약도 안 잡는다.
     *
     * 화면이 안 부르는 것이 정상이지만, 옛 화면이나 직접 호출도 있다.
     * 조용히 돌려보내지 않고 왜 안 돌았는지 말한다 — `ok: true` 라야
     * 화면이 오류로 읽지 않는다.
     */
    if (project.data.promptMode === "verbatim") {
      return Response.json({
        ok: true,
        project,
        skipped: "쓴 그대로 보내는 작업이라 기획을 돌리지 않았습니다.",
      });
    }

    /**
     * 문법은 「따라 만들기」에서만 읽는다 — 지킬 그림에는 레이아웃 문법이 없다.
     * 기획에는 **첨부한 것 전부**를 넘긴다. 지켜야 할 인물이 있는지도 알아야
     * 칸을 제대로 채운다.
     */
    /*
      **라이브러리와 같은 규칙으로 읽는다**(2026-09-17). 목록에서 보이는데
      여기서 안 읽히면, 고른 그림이 조용히 빠진 채로 만들어진다.
    */
    const viewer = {
      userId: auth.member.userId,
      role: auth.member.profile.role,
      teamId: await teamIdOf(auth.member.userId),
    };
    const references = await posterReferencesByIds(viewer, project.data.referenceIds);
    const preserved = await posterReferencesByIds(viewer, project.data.preservedIds ?? []);

    /*
     * **붙인 것을 역할과 무관하게 한 번씩 읽는다**(설계 §5-1).
     *
     * 전에는 역할이 읽기를 갈랐다 — 「따라 만들기」면 색·글자만, 「인물
     * 지키기」면 사람만, 「제품 지키기」면 아무도 안 읽었다. **그림을 보기도
     * 전에 고른 버튼 하나가 그 그림에서 배울 수 있는 것을 잘라 버렸다.**
     *
     * 2026-09-17 실측에서 드러났다 — 손 여섯이 핸드폰으로 인물을 둘러싸 찍는
     * 표지를 붙였는데 기획이 그 연출을 볼 방법이 없어 「배경은 거의 무지에
     * 가깝게」라고 쓰고 「다른 인물 추가」를 금지했다.
     */
    const read = await readAttachments(
      [...references, ...preserved]
        .filter((reference) => Boolean(reference.url))
        .map((reference) => ({ id: reference.id, title: reference.title ?? "첨부", url: reference.url! })),
      createPosterAttachmentReader(),
    );

    /**
     * **여기서 쓴 글 모델 값을 장부에 적는다**(2026-09-08 사용자 결정).
     *
     * 기획은 그림보다 싸지만 공짜가 아니다 — 기획 한 번에 첨부를 넉 장 읽으면
     * nano-banana 그림 한 장보다 비싸다. 지금까지는 이 화면이 장부에 한 줄도
     * 안 남겼다.
     *
     * **읽기가 끝난 뒤에 센다.** 실제로 몇 장을 읽었는지는 그때 알 수 있고,
     * 실패한 읽기는 세지 않는다(`read.issues` 로 빠진다).
     *
     * 저절로 도는 것이 걱정되지 않는다 — 자동 기획은 **칸이 전부 빈 첫 회에만**
     * 돈다. 다시 채우려면 사람이 눌러야 한다.
     */
    const visionReads = Object.keys(read.reads).length;
    const units = creditUnits(llmCostUsd({ planCalls: 1, visionReads }));
    const reserved = await reserveAiUsage(request, "poster_image", units);
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    /*
     * **고른 글 모델로 기획한다**(Easy 모드의 드롭다운, 설계 §5-4).
     *
     * 다른 화면은 이 칸을 안 보낸다 — 그때는 지금까지대로 환경변수·기본값으로
     * 간다. `resolveTextModel` 이 목록에 없는 id 를 기본으로 떨어뜨린다.
     */
    const providers = createPosterPlanningProviders(process.env, resolveTextModel(고른글모델));
    const plan = await planPoster(
      {
        instruction: project.data.instruction,
        ratio: project.ratio,
        references: planReferences(
          project.data, [...references, ...preserved], read.summaries, read.people,
        ),
        attachmentIntent: project.data.attachmentIntent,
        // 붙인 그림에 글자가 있으면 지어난 글자도 안 지워진다.
        // 그때는 「장면에서 글자 얘기를 하지 말라」고 시키면 안 된다.
        referenceHasText: Object.values(read.reads).some((one) => one.hasText),
      },
      providers.primary,
      providers.backup,
    );

    /*
     * **레퍼런스에서 읽은 값이 기획의 추측을 이긴다.**
     *
     * 전에는 반대였다. 그래서 2026-09-17 사고에서 레퍼런스를 실제로 읽어
     * 「가림」을 얻어 놓고도 기획이 추측한 「통과」가 프롬프트로 갔다. 그림을
     * 읽는 비전 호출은 돈을 내고 하는 일인데 그 결과가 버려지고 있었다.
     *
     * 합치는 규칙은 `mergeGrammar` 가 갖는다 — 라우트 안에 두면 값으로 못 잰다.
     */
    const 레퍼런스 = project.data.referenceIds.map((id) => read.reads[id]).find(Boolean);
    const slots = mergeGrammar(plan.slots, 레퍼런스);

    const saved = await stores.projects.update(id, {
      status: "ready",
      data: {
        ...project.data,
        slots,
        /*
         * **기획이 근거 없이 채운 칸.** 04 가 여기에 표를 붙인다.
         *
         * 문법에서 깔아 준 값(`seed`)은 지어낸 것이 아니다 — 붙인 그림을 실제로
         * 읽어서 나온 값이다. 기획이 안 채워 `seed` 가 들어간 칸은 기획도
         * `invented` 에 안 적으므로 저절로 빠진다.
         */
        inventedSlots: plan.invented,
        /*
         * **붙인 그림에 글자가 있나.** 글자를 넣을지는 규칙이 아니라 이 값이
         * 정한다(2026-09-17 사용자 판단). 한 장이라도 글자가 있으면 넣는다 —
         * 사용자가 따라 만들라고 한 그림의 핵심이 글자일 수 있다.
         */
        referenceHasText: Object.values(read.reads).some((one) => one.hasText),
        grammarIssues: [...read.issues, ...plan.issues],
      },
    });
    /**
     * **어림 대신 실측으로 닫는다.** 예약은 부르기 전이라 어림일 수밖에 없지만,
     * 확정은 이미 다 부른 뒤다. 못 쟀으면(계량기 밖) 어림값을 그대로 쓴다.
     */
    const 잰값 = readLlmMeter();
    const 실제 = 잰값.metered && 잰값.usd > 0 ? 잰값.usd : llmCostUsd({ planCalls: 1, visionReads });
    await finalizeAiUsage(reservation, true, creditUnits(실제), undefined, {
      model: "",
      billableImages: 0,
      llmUsd: 실제,
    });
    return Response.json({ ok: true, project: saved, issues: [...read.issues, ...plan.issues] });
  } catch (error) {
    // 실패했으면 묶어 둔 장을 돌려준다. 안 풀면 만료될 때까지 한도에서 빠져 있다.
    if (reservation) await finalizeAiUsage(reservation, false, 0, "poster_plan_failed");
    if (error instanceof PosterProviderConfigurationError) {
      return Response.json({ ok: false, message: error.message, missing: error.missing }, { status: 503 });
    }
    return Response.json(
      { ok: false, message: error instanceof Error ? error.message : "기획하지 못했습니다." },
      { status: 500 },
    );
  }
}
