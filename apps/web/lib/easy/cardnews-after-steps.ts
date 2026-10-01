import { PATCH as patchCardCopy } from "../../app/api/sns/projects/[id]/cards/[index]/route";
import { POST as writeCaptionRoute } from "../../app/api/sns/projects/[id]/caption/route";
import { cardAt, cardEditPrompt, readCardEdit, type AfterProject, type CopyPatch } from "../../app/easy/cardnews-after";
import type { CardnewsProjectLike } from "../../app/easy/cardnews-view";
import { EasyStepError, read, relay } from "./relay";

/**
 * **만든 카드뉴스 손보기의 서버 일**(3단계 설계 §6). 카드뉴스 라우트를 함수로 부른다 —
 * 2단계와 같다. 새 생성 경로를 만들지 않고, 기존 코드는 고치지 않는다.
 */

export type ProjectWithId = AfterProject & { id: string };

/** 말로 한 장 글을 고칠 때 부르는 글 모델. 구조화 응답 `{ headline, body, accent, footnote }`. */
export type WriteEdit = (prompt: string) => Promise<unknown>;

/**
 * **한 장 글 고치기**(설계 §6-2). 칸으로 온 글은 그대로, 말로 오면 고른 글 모델이 고친다.
 * 빈 칸은 안 바꾼다. 저장은 카드뉴스 원고 고치기 라우트(`PATCH cards/[n]`).
 *
 * `needsRedraw`: 그림이 있는 장이면 글만 바뀌고 그림은 그대로다 — 화면이 「그림에도
 * 반영할까요?」를 연다.
 */
export async function editCard(
  request: Request,
  project: ProjectWithId,
  index: number,
  change: { copy?: CopyPatch; words?: string },
  writeEdit?: WriteEdit,
): Promise<{ project: CardnewsProjectLike; needsRedraw: boolean }> {
  const card = cardAt(project, index);
  if (!card) throw new EasyStepError("글 고치기", "그 번호의 장이 없습니다.", 400);
  const patch = change.copy
    ? readCardEdit(change.copy)
    : change.words?.trim() && writeEdit
      ? readCardEdit(await writeEdit(cardEditPrompt(project, index, change.words.trim())))
      : undefined;
  if (!patch) throw new EasyStepError("글 고치기", "고칠 글을 찾지 못했습니다. 어떻게 바꿀지 조금 더 적어 주세요.", 400);
  const saved = await read(
    await patchCardCopy(
      relay(request, `/api/sns/projects/${project.id}/cards/${index}`, patch, `card-edit-${index}`),
      { params: Promise.resolve({ id: project.id, index: String(index) }) },
    ),
    "글 고치기",
  );
  return { project: saved.project as CardnewsProjectLike, needsRedraw: Boolean(card.assetPath || card.assetUrl) };
}

/** **게시글**(설계 §6-4). 카드뉴스 게시글 라우트가 쓰고 작업에 저장한다. 크레딧 없음. */
export async function captionCard(request: Request, projectId: string): Promise<CardnewsProjectLike> {
  const saved = await read(
    await writeCaptionRoute(
      relay(request, `/api/sns/projects/${projectId}/caption`, {}, "caption"),
      { params: Promise.resolve({ id: projectId }) },
    ),
    "게시글",
  );
  return saved.project as CardnewsProjectLike;
}
