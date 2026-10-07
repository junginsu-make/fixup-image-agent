import { POST as createCardnews } from "../../app/api/sns/projects/route";
import { POST as planCardnews } from "../../app/api/sns/projects/[id]/plan/route";
import { POST as generateCardnews } from "../../app/api/sns/projects/[id]/generate/route";
import { PATCH as patchCardCopy } from "../../app/api/sns/projects/[id]/cards/[index]/route";
import { endingPrompt, endingToFill, fallbackEnding, readEnding } from "../../app/easy/cardnews-ending";
import { snsFlowStoreForUser } from "../sns-flow-store";
import { refreshProjectAssetUrls } from "../sns/runtime";
import { EasyStepError, read, relay } from "./relay";
import { READ_BATCH, readInBatches } from "./read-batches";
import type { CardnewsProjectLike } from "../../app/easy/cardnews-view";

/**
 * **카드뉴스 라우트 셋을 함수로 부른다**(2단계 설계 §3). 1단계가 포스터 라우트
 * 셋을 부르는 것과 같다. 새 생성 경로를 만들지 않는다.
 */

export type EasyCardnewsProject = CardnewsProjectLike & { title: string };

/** 마지막 장 정리 문장을 쓰는 함수. 구조화 응답 `{ headline, body }` 를 돌려준다. */
export type WriteEnding = (prompt: string) => Promise<unknown>;

/**
 * 만들기 → 원고 → **마지막 장 채우기**. 원고는 공짜다(크레딧은 `generate` 가 잡는다).
 *
 * 마지막 장은 기존 흐름이 한 줄만 넣으므로 「쉽게」가 채운다(`app/easy/cardnews-ending.ts`).
 */
export async function draftCardnews(
  request: Request,
  input: unknown,
  writeEnding?: WriteEnding,
): Promise<{ projectId: string; project: CardnewsProjectLike }> {
  const created = await read(await createCardnews(relay(request, "/api/sns/projects", input, "cardnews-project")), "원고 준비");
  const projectId = created.project?.id as string | undefined;
  if (!projectId) throw new EasyStepError("원고 준비", "카드뉴스 작업을 만들지 못했습니다.", 500);
  const planned = await read(
    await planCardnews(
      relay(request, `/api/sns/projects/${projectId}/plan`, {}, "cardnews-plan"),
      { params: Promise.resolve({ id: projectId }) },
    ),
    "원고 쓰기",
  );
  const project = planned.project as CardnewsProjectLike;
  return { projectId, project: await fillEnding(request, projectId, project, writeEnding) };
}

/**
 * 빈 마지막 장을 정리 문장으로 채운다. AI 가 못 쓰면 앞 장 제목 목록으로 채운다.
 * **저장이 실패해도 원고는 돌려준다.** 마지막 장 하나 때문에 쓴 원고를 잃지 않는다.
 */
async function fillEnding(
  request: Request,
  projectId: string,
  project: CardnewsProjectLike,
  writeEnding?: WriteEnding,
): Promise<CardnewsProjectLike> {
  const index = endingToFill(project);
  if (index === undefined) return project;
  const written = writeEnding ? readEnding(await writeEnding(endingPrompt(project)).catch(() => undefined)) : undefined;
  try {
    const saved = await read(
      await patchCardCopy(
        relay(request, `/api/sns/projects/${projectId}/cards/${index}`, written ?? fallbackEnding(project), "cardnews-ending"),
        { params: Promise.resolve({ id: projectId, index: String(index) }) },
      ),
      "마지막 장",
    );
    return saved.project as CardnewsProjectLike;
  } catch (error) {
    console.warn(`[easy] 마지막 장을 채우지 못했습니다 project=${projectId}`, error instanceof Error ? error.message : error);
    return project;
  }
}

/** 「이대로 만들기」. 크레딧은 카드뉴스 `generate` 가 잡는다. */
export async function startCardnews(request: Request, projectId: string): Promise<void> {
  await read(
    await generateCardnews(
      relay(request, `/api/sns/projects/${projectId}/generate`, {}, "cardnews-generate"),
      { params: Promise.resolve({ id: projectId }) },
    ),
    "카드 만들기",
  );
}

/** 이 회원의 카드뉴스 작업 하나. 없으면 `null`: 포스터 작업이거나 남의 것이다. */
export async function cardnewsProject(userId: string, projectId: string): Promise<EasyCardnewsProject | null> {
  const project = await (await snsFlowStoreForUser(userId)).get(projectId);
  // 저장소는 팀 읽기 규칙으로 팀원 것도 준다. 잠든 팀 기능 때문에 남의 것이 끼지 않게 막는다.
  if (!project || project.userId !== userId) return null;
  return (await refreshProjectAssetUrls(project)) as unknown as EasyCardnewsProject;
}

/**
 * 이 회원의 카드뉴스 작업인 id(2026-10-07 2차 D2 — 결과물 번호의 갈래). 턴마다 부르므로 **있는지만** 보고
 * 그림 주소는 서명하지 않는다. 못 읽어도 턴을 깨지 않는다 — `null`(모름). 빈 모음을 돌려주면 그 번호들이
 * 「지운 결과」로 읽힌다(리뷰 1차 수정 2). 같은 id 는 한 번, 한꺼번에 몇 개씩만 읽는다(최종 수정 10).
 */
export async function cardnewsProjectIds(userId: string, ids: readonly string[]): Promise<Set<string> | null> {
  if (!ids.length) return new Set();
  try {
    const store = await snsFlowStoreForUser(userId);
    const found = await readInBatches([...new Set(ids)], READ_BATCH, (id) => store.get(id));
    return new Set(found.flatMap((one) => (one && one.userId === userId ? [one.id] : [])));
  } catch (error) {
    console.warn("[easy] 카드뉴스 작업을 읽지 못했습니다", error instanceof Error ? error.message : error);
    return null;
  }
}

/** 다시 쓰기 대상을 찾을 최근 그림 줄 수. 그보다 앞의 원고를 고치려면 새로 부탁한다. */
const 찾을줄수 = 20;

/**
 * 대화의 마지막 카드뉴스 작업(다시 쓰기 대상). 이 대화의 **모든 턴**이 부른다.
 *
 * - 최근 그림 줄만 **한꺼번에** 찾고, 그림 주소 서명은 고른 한 개에만 한다. 전에는 줄마다
 *   차례로 찾고 서명해, 포스터가 많은 대화에서 턴마다 늦어졌다
 * - **찾다 실패해도 턴을 깨지 않는다.** 원고가 없는 것으로 보고 이미지 주문은 그대로 간다
 */
export async function lastCardnewsProject(
  userId: string,
  rows: ReadonlyArray<{ role: string; workId?: string | null }>,
): Promise<EasyCardnewsProject | null> {
  const ids = [...rows].reverse()
    .flatMap((row) => (row.role === "image" && row.workId ? [row.workId] : []))
    .slice(0, 찾을줄수);
  if (!ids.length) return null;
  try {
    const store = await snsFlowStoreForUser(userId);
    const found = await Promise.all(ids.map((id) => store.get(id)));
    const project = found.find((one) => one && one.userId === userId);
    return project ? (await refreshProjectAssetUrls(project)) as unknown as EasyCardnewsProject : null;
  } catch (error) {
    console.warn("[easy] 고칠 카드뉴스 원고를 찾지 못했습니다", error instanceof Error ? error.message : error);
    return null;
  }
}
