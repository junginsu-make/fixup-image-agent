import { withRowJob } from "../../app/easy/row-image";
import { guideBody, sayBody } from "../../app/easy/row-marks";
import { CANNOT_DO_NOW, type EasyDecision } from "../../app/easy/chat";
import type { EasyAsk } from "../../app/easy/ask";
import { easyTitle } from "../../app/easy/title";
import { DETAIL_PAGE_GUIDE } from "../../app/easy/detail-page";
import type { readChosenRoles } from "../../app/easy/photo-roles";
import { runPhotoTurn, type PhotoTurnInput } from "../../app/easy/photo-turn";
import { easyRoleSummary } from "../../app/easy/options";
import { nextResultNumber, resultLabel } from "../../app/easy/image-numbers";
import { SAY_IMAGE, aiText, photoQuestion, sayText } from "../../app/easy/turn-words";
import { POST as createProject } from "../../app/api/poster/projects/route";
import { POST as runPlan } from "../../app/api/poster/projects/[id]/plan/route";
import { POST as submitGenerate } from "../../app/api/poster/projects/[id]/generate/route";
import { askTurn, type AskTurnContext } from "./ask-turn";
import type { createEasyChatProvider } from "./chat-provider";
import { readEasyPhotos } from "./read-photos";
import { EasyStepError, read, relay } from "./relay";
import { 멈춘다 } from "./stop";
import type { easyStoreForUser } from "./store";

/**
 * 기본값 — 고를 것을 없앴으므로 나머지는 여기서 정한다(설계 §9).
 *
 * **비율은 더 이상 여기서 못 박지 않는다**(2026-09-21 사용자 — 「지금은 무조건
 * 1:1로만 나옵니다」). 말 속에 있으면 그것, 물어서 고르면 그것, 아무것도
 * 없으면 `ask.ts` 의 기본값이다.
 */
export const VARIANTS = 1;

/**
 * **그림 턴의 끝**(2026-10-07 후속 Task 6 — `app/api/easy/generate/route.ts` 에서 동작 그대로 옮겼다).
 *
 * 묻기 · 고치기 · 카드뉴스 갈래를 다 지난 턴이 여기 온다. 사진 역할을 보고(멈추거나 묻거나), 사용자 줄을
 * 남기고, 말 · 상세페이지 안내 · 쓸 수 없게 된 갈래는 답 한 줄로 끝내고, image 갈래만 포스터 라우트 셋을
 * 그대로 불러 제출한다. 여기서 던진 오류는 라우트의 `catch` 가 받는다(실패 줄 · 가림이 그대로다).
 */
export async function imageTurn(ctx: {
  request: Request;
  store: ReturnType<typeof easyStoreForUser>;
  conversation: { title?: string | null };
  conversationId: string;
  prompt: string;
  textModel: string;
  wants: string;
  decision: EasyDecision;
  input: Record<string, unknown>;
  provider: ReturnType<typeof createEasyChatProvider>;
  물음맥락: AskTurnContext;
  사진들: PhotoTurnInput["photos"];
  붙인것: string[];
  붙인수: number;
  지시: string;
  고른역할: ReturnType<typeof readChosenRoles>;
  지난역할: ReturnType<typeof readChosenRoles>;
  고르기: EasyAsk;
  말한것: { ratio?: string; look?: string };
  사용자글: string;
  지난줄: Parameters<typeof nextResultNumber>[0];
}): Promise<Response> {
  const {
    request, store, conversation, conversationId, prompt, textModel, wants, decision, input, provider,
    물음맥락, 사진들, 붙인것, 붙인수, 지시, 고른역할, 지난역할, 고르기, 말한것, 사용자글, 지난줄,
  } = ctx;
  /*
   * ⓒ → ⓐ → ⓑ2 → ⓓ **사진이 붙은 그림 턴**(설계 §2-3).
   *
   * 말을 남기기 **전에** 한다. 멈추면 아무것도 안 남기고, 물으면 사용자 줄 + 물음 줄을 남긴다
   * (2차 D1). 물음 줄에 사진 id 와 그때의 판단을 적어 새로고침 뒤 말로 답해도 이어진다. 사진 물음
   * 문장은 고정이다. 이 판단 뒤에 정해져 AI 가 같은 호출로 못 쓴다(2차 §4). 말 턴 · 상세페이지
   * 안내 턴은 여기 오지 않으므로 사진을 안 읽는다.
   */
  const 사진판단 = wants === "image" && 붙인수
    ? await runPhotoTurn(
      {
        photos: 사진들,
        words: 지시,
        chosen: 고른역할,
        previous: 지난역할,
        ratio: 고르기.ratio,
        imageModel: typeof input.imageModel === "string" ? input.imageModel : undefined,
      },
      { read: (photos) => readEasyPhotos(photos), judge: (text) => provider.decideRoles(text) },
    )
    : undefined;
  if (사진판단?.kind === "stop") return 멈춘다(사진판단.message);
  if (사진판단?.kind === "ask") {
    return await askTurn(물음맥락, {
      kind: "photo",
      text: photoQuestion(사진판단.reason),
      data: { wants: "image", reason: 사진판단.reason, mode: "image", rows: 사진판단.rows, ids: 붙인것, ...말한것 },
    }, { photoAsk: { reason: 사진판단.reason, rows: 사진판단.rows } });
  }
  const 칸 = 사진판단?.fields;

  // 사용자가 친 말을 남긴다. 아래가 실패해도 대화에는 그 말이 있어야
  // 무엇을 하려 했는지 알 수 있다.
  await store.appendMessage({ conversationId, role: "user", body: 사용자글 });

  // 제목이 비어 있으면 이 말로 짓는다. 첫 프롬프트 한 번만이다(설계 §4-1).
  if (!conversation.title) await store.renameConversation(conversationId, easyTitle(prompt));

  if (wants === "talk") {
    /*
     * **답만 적고 끝낸다.** 그림을 안 만들었으므로 값도 거의 안 든다 —
     * 화면이 「약 N장」을 적던 자리도 그래서 「그림을 만들면」으로 바뀌었다.
     */
    const saved = await store.appendMessage({
      conversationId,
      role: "assistant",
      body: decision.reply || "무엇을 만들어 드릴까요?",
    });
    return Response.json({ ok: true, talked: true, message: saved, textModel });
  }

  if (wants === "detail_page") {
    /*
     * **상세페이지는 여기서 안 만든다**(설계 §2-7, 2026-09-30 사용자 결정).
     *
     * 안내 한 줄을 남기고 끝낸다. 사진을 읽지도 값이 나가지도 않는다.
     * 화면은 이 문장이 달린 줄에 「상세페이지 만들기 열기」를 단다.
     */
    // 안내 문장은 AI 가 쓴다(2차 D4) — 비면 고정 안내. 단추는 표시(`guide:detail:`)로 단다.
    const saved = await store.appendMessage({
      conversationId, role: "assistant", body: guideBody("detail", sayText(aiText(decision, wants), DETAIL_PAGE_GUIDE)),
    });
    return Response.json({ ok: true, talked: true, message: saved, textModel });
  }

  /*
   * **만들기는 image 갈래만 간다**(2차 최종 리뷰 1 · Review Focus 7). 쓸 수 없게 된 갈래(고칠 것이 사라진
   * 단추 답 · 원고 없는 장 손보기 등)가 위의 갈래들을 다 지나 여기까지 오면, 사용자가 바라지 않은 새 이미지에
   * 값이 나간다. 사용자 줄은 이미 남았다 — 안내 한 줄로 끝낸다. 값은 안 든다.
   */
  if (wants !== "image") {
    const saved = await store.appendMessage({ conversationId, role: "assistant", body: CANNOT_DO_NOW });
    return Response.json({ ok: true, talked: true, message: saved, textModel });
  }

  /*
   * **일하는 턴에도 AI 가 말한다**(2026-10-07 2차 D4). 판단과 같은 호출의 reply 를 머리말 줄로
   * 남긴다 — 비었거나 다른 갈래로 쓴 글이면(고른 갈래가 이김 등, 최종 리뷰 b) 코드 문장(다시 묻지 않는다,
   * 값이 두 번 나간다). 차례는 사용자 줄 → 머리말 → 그림 줄이고, 머리말 뒤에 실패해도 실패 줄이 남는다
   * (`failure-row.ts` 가 머리말을 답으로 안 친다).
   */
  const 머리말 = await store.appendMessage({
    conversationId, role: "assistant", body: sayBody(sayText(aiText(decision, wants), SAY_IMAGE)),
  });

  // ① 프로젝트
  const created = await read(await createProject(relay(request, "/api/poster/projects", {
    title: easyTitle(지시) || "Easy",
    // 말 속에 있던 것 · 물어서 고른 것 · 기본값 차례다(`ask.ts`).
    ratio: 고르기.ratio,
    look: 고르기.look,
    modelId: typeof input.imageModel === "string" ? input.imageModel : undefined,
    variants: VARIANTS,
    instruction: 지시,
    referenceIds: 칸?.referenceIds ?? [],
    preservedIds: 칸?.preservedIds ?? [],
    personIds: 칸?.personIds ?? [],
    restyledIds: 칸?.restyledIds ?? [],
    // AI 가 다듬는다. 그것이 이 모드의 값어치다(설계 §9).
    promptMode: "assisted",
    // **붙인 순서 그대로**(설계 §2-6). 전에는 따라 만들기를 앞으로 당겼다.
    attachmentOrder: 칸?.attachmentOrder ?? [],
    // 말과 최종 역할이 맞을 때만 말 전체, 아니면 빈 글(설계 §2-6).
    attachmentIntent: 사진판단?.attachmentIntent ?? "",
  }, "project")), "기획 준비");

  const projectId = created.project?.id as string | undefined;
  if (!projectId) throw new EasyStepError("기획 준비", "작업을 만들지 못했습니다.", 500);
  const params = Promise.resolve({ id: projectId });

  // ② 기획 — 붙인 그림을 읽고 칸을 채운다
  /*
   * **고른 글 모델을 넘긴다.** 안 넘기면 드롭다운이 모양만 있고 환경변수가
   * 정한 모델로 간다 — 2026-09-18 에 실제로 그랬다(설계 §5-4).
   */
  await read(
    await runPlan(relay(request, `/api/poster/projects/${projectId}/plan`, { textModel }, "plan"), { params }),
    "기획",
  );

  // ③ 제출 — 그림은 화면이 `status` 로 받아 간다
  const submitted = await read(
    await submitGenerate(relay(request, `/api/poster/projects/${projectId}/generate`, {}, "generate"), { params }),
    "이미지 만들기",
  );

  /*
   * **그림 자리를 대화에 남긴다.** `work_id` 는 포스터 **작업**을 가리킨다 —
   * 라이브러리의 작업물 탭이 세는 단위가 그것이고, 그림은 그 아래 달린다.
   * 그림 id 를 적으면 대화를 다시 열 때 그것만으로 주소를 찾을 길이 없다
   * (`PosterImageStore` 에 `byIds` 가 없다).
   *
   * **제출한 직후에 남긴다.** 결과를 기다려 남기면, 화면을 떠난 사람의 대화에
   * 그 그림이 안 들어간다.
   */
  // 받을 정보를 함께 적는다 — 화면을 떠났다 다시 열어도 이어 받는다(2026-10-06 설계 B3).
  await store.appendMessage({ conversationId, role: "image", workId: projectId, body: withRowJob("", submitted.submission) });

  return Response.json({
    ok: true,
    projectId,
    say: 머리말,
    submission: submitted.submission,
    textModel,
    ratio: 고르기.ratio,
    look: 고르기.look,
    // 만든 조건에 곧바로 적는다. 다시 열 때는 `load.ts` 가 같은 함수로 읽는다.
    roles: 칸 ? easyRoleSummary(칸) : "",
    // 화면이 들고 있다가 다음 그림 턴에 지난 역할로 보낸다(설계 §2-4 차례 3).
    photoRoles: 사진판단?.rows ?? [],
    // 화면의 「이미지 N」(2차 D2). 화면과 같은 함수로 센 결과물 번호다.
    resultLabel: resultLabel("image", nextResultNumber(지난줄)),
    ...(submitted.notice ? { notice: submitted.notice } : {}),
  });
}
