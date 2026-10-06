import { POST as submitEdit } from "../../app/api/poster/projects/[id]/edit/route";
import { editRowBody, editTargetImage, withRowJob } from "../../app/easy/row-image";
import { posterStoresForUser } from "../poster/stores";
import { read, relay } from "./relay";
import type { easyStoreForUser } from "./store";

/**
 * **마지막으로 만든 이미지를 이어서 고친다** (2026-10-06).
 *
 * 2026-10-06 사용자 — 「쉽게 모드에서는 최종 마지막 대화 또는 결과물에서 계속
 * 이어서 작업이 되어야 합니다.」 그전에는 이미지를 만든 뒤 「로고를 바꿔줘」라고
 * 하면 「무엇을 만들어 드릴까요?」만 되풀이됐다 — 고치기가 카드뉴스 원고에만
 * 붙어 있었다.
 *
 * ── 새 생성 길을 만들지 않는다 ──────────────────────────────────
 *
 * 포스터 「이 장만 고치기」 라우트를 **그대로 부른다**(`generate/route.ts` 가 세
 * 라우트를 부르는 것과 같은 까닭). 예약 · 모델 · 크기 · 고치기 조립 · 정산이 그
 * 라우트 하나에 있다. 처음 만들기 경로는 건드리지 않는다.
 *
 * 화면은 처음 만들기와 **같은 모양의 답**(`projectId` · `submission`)을 받아 같은
 * `status` 로 결과를 받는다 — 화면 코드를 고칠 일이 없다.
 */

type Row = { role: string; workId?: string | null; body?: string | null; createdAt?: string };

export interface EasyImageTarget {
  projectId: string;
  ratio: string;
  /**
   * 그 작업의 **지킬 사진**(제품 · 인물 그대로). 고치기 라우트가 알아서 다시 붙이므로 새로 안 넣는다.
   * 그 밖에 붙어 있는 사진은 이번에 일부러 붙인 새 재료다 첨부는 쓴 뒤 입력창에서 내려가므로
   * (2026-10-07 2차 D3) 예전 고치기에 넣은 로고 · 따라 만들 사진도 다시 붙였으면 넣는다.
   */
  keptIds: ReadonlySet<string>;
}

/**
 * 이 대화의 **마지막 결과**가 포스터 작업이면 그것.
 *
 * 마지막 결과가 카드뉴스면 없다고 답한다 — 앞의 이미지로 거슬러 가면 사용자가
 * 바라보는 것(방금 만든 카드뉴스)과 다른 것을 고친다.
 */
export async function lastEasyImage(userId: string, rows: readonly Row[]): Promise<EasyImageTarget | null> {
  const row = [...rows].reverse().find((one) => one.role === "image" && one.workId);
  if (!row?.workId) return null;
  const project = await posterStoresForUser(userId).projects.get(row.workId).catch(() => undefined);
  if (!project) return null;
  const data = project.data;
  return {
    projectId: project.id,
    ratio: project.ratio,
    keptIds: new Set([...(data.preservedIds ?? []), ...(data.personIds ?? [])]),
  };
}

/**
 * 이 대화에서 만든 **이미지 수**(규격 안내용, 최종 리뷰 2026-10-06).
 *
 * 그림 줄을 그대로 세면 고친 줄(같은 작업) · 카드뉴스 줄 · 지운 작업까지 센다 — 안내가
 * 「만든 이미지가 5장」이라 하고 「광고소재」에서는 2장만 보인다. 그림 줄이 가리키는 **서로
 * 다른 작업** 가운데 **포스터 작업**만 센다. 카드뉴스 작업 · 지운 작업은 포스터 저장소에 없다.
 *
 * 작업마다 한 번씩 읽으므로 **규격 안내 턴에서만** 부른다.
 */
export async function countEasyImages(userId: string, rows: readonly Row[]): Promise<number> {
  const ids = [...new Set(rows.flatMap((one) => (one.role === "image" && one.workId ? [one.workId] : [])))];
  if (!ids.length) return 0;
  const projects = posterStoresForUser(userId).projects;
  const found = await Promise.all(ids.map((id) => projects.get(id).catch(() => undefined)));
  return found.filter(Boolean).length;
}

/** 고칠 그림이 아직 없을 때. 만드는 중이거나 만들지 못한 그림이다. */
export const IMAGE_NOT_READY =
  "고칠 이미지가 아직 준비되지 않았습니다. 만들기가 끝난 뒤 다시 말씀해 주세요. "
  // 바로 거절된 고치기도 10분 동안은 만드는 중으로 보인다(`row-image.ts`) — 그때 할 일도 알린다.
  + "앞의 이미지를 만들지 못했다면 약 10분 뒤 다시 말씀해 주시거나 새로 만들어 주세요.";

export async function imageEditTurn(ctx: {
  request: Request;
  userId: string;
  store: ReturnType<typeof easyStoreForUser>;
  conversationId: string;
  prompt: string;
  /** 사용자 줄에 남길 글(단추 답이면 고른 값 표시가 붙는다, 2차 D1). 없으면 `prompt`. */
  userBody?: string;
  textModel: string;
  target: EasyImageTarget;
  rows: readonly Row[];
  /** 지금 붙어 있는 사진(확인을 마친 id). */
  attachments: readonly string[];
}): Promise<Response> {
  const { projectId } = ctx.target;
  /*
   * **본인 그림만.** 고치기 라우트도 본인 것만 고친다 — 여기서 남의 그림을 고르면
   * 그 라우트가 404 로 막는데, 그 전에 말 줄이 남는다.
   */
  const images = await posterStoresForUser(ctx.userId).images.byProject(projectId, { lineage: false, ownOnly: true });
  // 마지막 줄의 그림. 앞의 고치기가 실패했으면 그 앞의 그림으로 거슬러 간다(`row-image.ts`).
  const found = editTargetImage(ctx.rows, projectId, images, Date.now());

  // 사용자가 친 말을 남긴다. 아래가 실패해도 대화에는 그 말이 있어야 한다.
  await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "user", body: ctx.userBody ?? ctx.prompt });

  if (!("image" in found)) {
    // 값이 나가기 전이다. 안내만 남긴다.
    const saved = await ctx.store.appendMessage({ conversationId: ctx.conversationId, role: "assistant", body: IMAGE_NOT_READY });
    return Response.json({ ok: true, talked: true, message: saved, textModel: ctx.textModel });
  }

  /*
   * **이번에 붙인 사진은 넣는다**(2026-10-07 2차 D3). 첨부는 만들기 · 고치기에 쓴 뒤 입력창에서
   * 내려가므로, 붙어 있다면 사용자가 이번에 일부러 붙인 것이다. 원래 작업의 지킬 사진만 뺀다
   * 고치기 라우트가 알아서 다시 붙인다.
   */
  const added = ctx.attachments.filter((id) => !ctx.target.keptIds.has(id));
  const submitted = await read(
    await submitEdit(
      relay(ctx.request, `/api/poster/projects/${projectId}/edit`, {
        instruction: ctx.prompt,
        imageId: found.image.id,
        ...(added.length ? { addedReferenceIds: added } : {}),
      }, "edit"),
      { params: Promise.resolve({ id: projectId }) },
    ),
    "이미지 고치기",
  );

  /*
   * **고친 줄에는 요청 번호를 적는다.** 같은 작업에 그림이 늘어도 줄마다 제 그림을
   * 찾고, 다음 고치기는 이 그림에서 이어진다(`row-image.ts`).
   */
  await ctx.store.appendMessage({
    conversationId: ctx.conversationId,
    role: "image",
    workId: projectId,
    body: withRowJob(editRowBody(submitted.submission.requestRowId, added), submitted.submission),
  });

  return Response.json({
    ok: true,
    projectId,
    submission: submitted.submission,
    textModel: ctx.textModel,
    ratio: ctx.target.ratio,
    photoRoles: [],
  });
}
