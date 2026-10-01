import { randomUUID } from "node:crypto";
import { PATCH as patchCardCopy, POST as redoCardRoute } from "../../app/api/sns/projects/[id]/cards/[index]/route";
import { POST as writeCaptionRoute } from "../../app/api/sns/projects/[id]/caption/route";
import { archiveTitle, cardAt, cardEditPrompt, readCardEdit, type AfterProject, type CopyPatch } from "../../app/easy/cardnews-after";
import type { CardnewsProjectLike } from "../../app/easy/cardnews-view";
import { isLocalStoreEnabled, localStoreRoot, readLocalSnsResultFile } from "../local-store";
import { saveReferenceImage } from "../reference-images";
import { createSupabaseAdminClient } from "../supabase/admin";
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

/** 카드뉴스 그림 창고 이름(`lib/sns/runtime.ts` 의 `BUCKET` 과 같다 — 그쪽은 고치지 않는다). */
const 그림창고 = "library";
/** 한 장 다시 만들기에 붙이는 말의 상한(`app/sns/[id]/result-rules.ts` 의 `CARD_NOTE_MAX` 와 같다). */
const 바라는점상한 = 500;

const 형식 = (path: string) => (/\.jpe?g$/i.test(path) ? "image/jpeg" : /\.webp$/i.test(path) ? "image/webp" : "image/png");

/** 앞 그림 보관에 쓰는 것들. 시험이 바꿔 끼운다. */
export interface ArchiveDeps {
  readFile(path: string): Promise<{ bytes: Uint8Array; mimeType: string }>;
  save(input: { userId: string; id: string; title: string; purpose: "cardnews"; bytes: Uint8Array; mimeType: string }): Promise<unknown>;
  newId(): string;
}

const 기본보관: ArchiveDeps = {
  async readFile(path) {
    if (isLocalStoreEnabled()) {
      return { bytes: new Uint8Array(await readLocalSnsResultFile(localStoreRoot(), path)), mimeType: 형식(path) };
    }
    const { data, error } = await createSupabaseAdminClient().storage.from(그림창고).download(path);
    if (error || !data) throw new Error(error?.message ?? "그림을 읽지 못했습니다.");
    return { bytes: new Uint8Array(await data.arrayBuffer()), mimeType: 형식(path) };
  },
  save: (input) => saveReferenceImage(input),
  newId: () => randomUUID(),
};

/**
 * **앞 그림을 라이브러리 참고 이미지로 보관한다**(설계 §6-3). 그림이 없던 장이면 `null`.
 *
 * 카드뉴스의 한 장 다시 만들기는 같은 자리에 덮어쓴다(`lib/sns/runtime.ts:100-102`).
 * 「삭제가 아니라 새로 생성」(2026-09-30 사용자 결정)을 한 장에도 지키려고 먼저 옮겨 둔다.
 */
export async function archiveCard(
  userId: string,
  project: ProjectWithId,
  index: number,
  deps: ArchiveDeps = 기본보관,
): Promise<{ id: string; title: string } | null> {
  const card = cardAt(project, index);
  if (!card?.assetPath) return null;
  const file = await deps.readFile(card.assetPath);
  const title = archiveTitle(project.title ?? "", index);
  const id = deps.newId();
  await deps.save({ userId, id, title, purpose: "cardnews", bytes: file.bytes, mimeType: file.mimeType });
  return { id, title };
}

/**
 * **한 장 다시 만들기**(설계 §6-3). 앞 그림을 보관한 뒤 카드뉴스 한 장 다시 만들기
 * 라우트(`POST cards/[n]`)를 부른다. 크레딧은 그 라우트가 그 장만큼 잡는다.
 *
 * **보관이 실패하면 다시 만들지 않는다.** 앞 그림을 잃지 않고, 값도 안 나간다.
 */
export async function redoCard(
  request: Request,
  userId: string,
  project: ProjectWithId,
  index: number,
  note?: string,
  deps: ArchiveDeps = 기본보관,
): Promise<{ project: CardnewsProjectLike; archived: { id: string; title: string } | null }> {
  if (!cardAt(project, index)) throw new EasyStepError("다시 만들기", "그 번호의 장이 없습니다.", 400);
  let archived: { id: string; title: string } | null;
  try {
    archived = await archiveCard(userId, project, index, deps);
  } catch (error) {
    console.error(`[easy] 앞 그림 보관 실패 project=${project.id} card=${index}`, error);
    throw new EasyStepError("다시 만들기", "앞 그림을 보관하지 못해 다시 만들지 않았습니다. 잠시 뒤 다시 해 주세요.", 409);
  }
  const 말 = note?.trim().slice(0, 바라는점상한);
  const saved = await read(
    await redoCardRoute(
      relay(request, `/api/sns/projects/${project.id}/cards/${index}`, 말 ? { note: 말 } : {}, `card-redo-${index}`),
      { params: Promise.resolve({ id: project.id, index: String(index) }) },
    ),
    "다시 만들기",
  );
  return { project: saved.project as CardnewsProjectLike, archived };
}
