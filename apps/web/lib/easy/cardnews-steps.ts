import { POST as createCardnews } from "../../app/api/sns/projects/route";
import { POST as planCardnews } from "../../app/api/sns/projects/[id]/plan/route";
import { POST as generateCardnews } from "../../app/api/sns/projects/[id]/generate/route";
import { snsFlowStoreForUser } from "../sns-flow-store";
import { refreshProjectAssetUrls } from "../sns/runtime";
import { EasyStepError, read, relay } from "./relay";
import type { CardnewsProjectLike } from "../../app/easy/cardnews-view";

/**
 * **카드뉴스 라우트 셋을 함수로 부른다**(2단계 설계 §3). 1단계가 포스터 라우트
 * 셋을 부르는 것과 같다. 새 생성 경로를 만들지 않는다.
 */

export type EasyCardnewsProject = CardnewsProjectLike & { title: string };

/** 만들기 → 원고. 원고는 공짜다(크레딧은 `generate` 가 잡는다). */
export async function draftCardnews(
  request: Request,
  input: unknown,
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
  return { projectId, project: planned.project as CardnewsProjectLike };
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
  if (!project) return null;
  return (await refreshProjectAssetUrls(project)) as unknown as EasyCardnewsProject;
}

/** 대화의 마지막 카드뉴스 작업(다시 쓰기 대상). 줄을 뒤에서부터 본다. */
export async function lastCardnewsProject(
  userId: string,
  rows: ReadonlyArray<{ role: string; workId?: string | null }>,
): Promise<EasyCardnewsProject | null> {
  for (const row of [...rows].reverse()) {
    if (row.role !== "image" || !row.workId) continue;
    const project = await cardnewsProject(userId, row.workId);
    if (project) return project;
  }
  return null;
}
