import { readLlmMeter, withLlmMeter } from "../../../../../../lib/llm/meter";
import { planPoster, readPeople, readReferenceGrammar } from "@fixup/poster-core";
import { planReferences } from "@fixup/shared";
import { authenticateApiMember, finalizeAiUsage, reserveAiUsage } from "../../../../../../lib/membership/api";
import { creditUnits, llmCostUsd } from "@fixup/shared";
import { posterStoresForUser } from "../../../../../../lib/poster/stores";
import {
  createPosterGrammarReader,
  createPosterPeopleReader,
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
  // 이 요청에서 글 모델에 쓴 돈을 잰다. 문법 읽기·사람 읽기·기획이 모두 여기로 모인다.
  return withLlmMeter(() => plan(request, context));
}

async function plan(request: Request, context: Context) {
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
    const references = await stores.references.byIds(project.data.referenceIds);
    const preserved = await stores.references.byIds(project.data.preservedIds ?? []);
    const grammar = await readReferenceGrammar(
      references
        .filter((reference) => Boolean(reference.url))
        .map((reference) => ({ id: reference.id, title: reference.title ?? "레퍼런스", url: reference.url! })),
      createPosterGrammarReader(),
    );

    /**
     * **지킬 사람의 사진에서 누가 있는지 읽는다.**
     *
     * 전에는 기획이 사람을 볼 방법이 아예 없었다. 문법 읽기는 「어떻게 보이나」만
     * 읽고 「따라 만들기」 그림에만 도는데, 지킬 사람의 사진은 아무도 안 봤다.
     * 그래서 기획이 인물을 한 줄로 뭉뚱그렸고 — 「1번 사진에 등장하는 사람들(흰색
     * 티셔츠 착용)」 — 그 요약에 없는 안경이 몇 번을 돌려도 안 나왔다
     * (2026-09-08 실측).
     *
     * **실패해도 계속한다.** 사람 묘사가 없어도 포스터는 만들 수 있고, 그림
     * 모델은 사진 자체를 여전히 본다.
     */
    const personIds = new Set(project.data.personIds ?? []);
    const crowd = await readPeople(
      preserved
        .filter((reference) => Boolean(reference.url) && personIds.has(reference.id))
        .map((reference) => ({ id: reference.id, title: reference.title ?? "사진", url: reference.url! })),
      createPosterPeopleReader(),
    );

    /**
     * **여기서 쓴 글 모델 값을 장부에 적는다**(2026-09-08 사용자 결정).
     *
     * 기획은 그림보다 싸지만 공짜가 아니다 — 기획 한 번에 첨부를 넉 장 읽으면
     * nano-banana 그림 한 장보다 비싸다. 지금까지는 이 화면이 장부에 한 줄도
     * 안 남겼다.
     *
     * **읽기가 끝난 뒤에 센다.** 실제로 몇 장을 읽었는지는 그때 알 수 있고,
     * 실패한 읽기는 세지 않는다(`grammar.issues`·`crowd.issues` 로 빠진다).
     *
     * 저절로 도는 것이 걱정되지 않는다 — 자동 기획은 **칸이 전부 빈 첫 회에만**
     * 돈다. 다시 채우려면 사람이 눌러야 한다.
     */
    const visionReads = Object.keys(grammar.grammars).length + Object.keys(crowd.people).length;
    const units = creditUnits(llmCostUsd({ planCalls: 1, visionReads }));
    const reserved = await reserveAiUsage(request, "poster_image", units);
    if (!reserved.ok) return reserved.response;
    reservation = { userId: reserved.userId, requestId: reserved.requestId };

    const providers = createPosterPlanningProviders();
    const plan = await planPoster(
      {
        instruction: project.data.instruction,
        ratio: project.ratio,
        references: planReferences(
          project.data, [...references, ...preserved], grammar.summaries, crowd.people,
        ),
        attachmentIntent: project.data.attachmentIntent,
      },
      providers.primary,
      providers.backup,
    );

    // 문법에서 읽은 "어떻게 보이나" 를 초기값으로 깔고, 기획이 채운 값이 이긴다.
    const seed = Object.values(grammar.grammars)[0];
    const slots = {
      ...plan.slots,
      typeInteraction: plan.slots.typeInteraction ?? seed?.typeInteraction ?? null,
      dominantColor: plan.slots.dominantColor || seed?.dominantColor || "",
      accentColor: plan.slots.accentColor || seed?.accentColor || "",
    };

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
        grammarIssues: [...grammar.issues, ...crowd.issues, ...plan.issues],
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
    return Response.json({ ok: true, project: saved, issues: [...grammar.issues, ...crowd.issues, ...plan.issues] });
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
