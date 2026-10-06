import "server-only";

import { IMAGE_MODELS } from "@fixup/sns-core";
import { requireActiveMember } from "../../../lib/membership/server";
import { easyStoreForUser } from "../../../lib/easy/store";
import { posterStoresForUser } from "../../../lib/poster/stores";
import { cardnewsProject, type EasyCardnewsProject } from "../../../lib/easy/cardnews-steps";
import { unfinishedPosterRequests } from "../../../lib/easy/pending-requests";
import { markDeletedWork } from "../deleted-work";
import { editedRequestIds, pendingJobRowIds, pickRowImage, rowJobRequestIds } from "../row-image";
import type { EasyMessage } from "../turn";
import { easyRoleSummary, type EasyImageOptions } from "../options";

/**
 * 화면 둘이 함께 쓰는 **읽기**.
 *
 * `page.tsx`(새 대화)와 `[id]/page.tsx`(지난 대화)가 같은 것을 준비한다. 두 곳에
 * 적으면 하나는 곧 낡는다.
 */

/**
 * 비율. **고를 것을 없앴으므로 여기서 정한다**(설계 §9).
 *
 * `api/easy/generate` 의 `RATIO` 와 같아야 한다 — 갈리면 화면이 말하는 값과
 * 실제로 깎이는 값이 다르다. 시험이 그 둘을 맞대 본다.
 */

/**
 * 이미지 모델 목록.
 *
 * **진짜 이름을 낸다**(설계 §5-1). 모델 표의 `label` 은 우리 이름(「표준형」)이라
 * 이름 자리에는 `id` 를 쓴다 — 예외는 이 화면 하나다.
 *
 * **글 모델과 같은 모양으로 준다**(2026-09-21 사용자). 이름만 늘어놓으면
 * `gpt-image-2.5-flare` 와 `nano-banana-pro` 중 무엇을 골라야 할지 알 수 없다.
 * 우리 이름(「표준형」)을 등급 자리에 두고, 한 줄 설명을 붙인다.
 *
 * **거르지 않는다**(2026-09-21 사용자 — 「gpt-image-2 모델들도 추가해주세요」).
 *
 * 한 번 걸렀었다. `gpt-image-2` 를 「이전 판이라 새로 고를 까닭이 없다」고 보고
 * 뺐는데, 그 판이 **한글 글자가 가장 정확하다.** 고를 까닭이 있는 것을 우리가
 * 판단해서 감췄던 것이다. 표에 있는 것은 다 낸다.
 */
export function easyImageModels() {
  return IMAGE_MODELS
    .map((model) => ({
      id: model.id,
      label: model.id,
      // 우리 이름이 곧 등급이다 — 「표준형」·「정밀형 플러스」·「경제형」.
      tier: model.label,
      note: model.note ?? "",
      family: model.family ?? "gpt-image",
    }));
}

export function defaultEasyImageModel(): string {
  return IMAGE_MODELS.find((model) => model.isDefault)?.id ?? IMAGE_MODELS[0]!.id;
}

/**
 * 지난 대화의 줄들과 **그림 주소 · 만든 조건**.
 *
 * 그림 줄은 포스터 작업을 가리킬 뿐이다(`work_id`). 다시 열 때 보이게 하려면
 * 그 작업의 그림을 찾아 주소를 붙여야 한다 — **대화 표에 그림을 넣지 않기로 한
 * 대가**다(설계 §4-1). 두 곳에 두면 하나는 곧 어긋난다.
 *
 * **조건도 같은 자리에서 읽는다**(2026-09-21 사용자). 어느 모델로 어느 비율로
 * 만들었는지는 그 작업이 갖고 있다. 대화 표에 베껴 두면 같은 까닭으로 어긋난다.
 */
export async function loadEasyConversation(id: string) {
  const membership = await requireActiveMember();
  const store = easyStoreForUser(membership.user.id);

  const conversation = await store.getConversation(id);
  if (!conversation) return undefined;

  const rows = await store.listMessages(id);
  const projectIds = [...new Set(rows.map((row) => row.workId).filter(Boolean) as string[])];
  /*
   * **아직 결과를 안 받은 그림 줄**(2026-10-06 설계 B3, 최종 리뷰). 화면은 이 줄만 이어
   * 받는다 — 끝난 요청을 다시 물으면 `status` 가 결과를 또 저장하고 또 정산한다.
   */
  const pending = pendingJobRowIds(rows, await unfinishedPosterRequests(membership.user.id, rowJobRequestIds(rows)));

  /*
   * 골라 둔 것이 있으면 그것을, 없으면 첫 장을 보인다. 04 가 없는 모드라
   * 「고른 변형」이 대개 비어 있다.
   */
  const urls: Record<string, string> = {};
  const options: Record<string, EasyImageOptions> = {};
  // 카드뉴스 원고 줄(2단계 §8). 줄 id → 그 작업. 원고 · 진행 · 결과를 여기서 그린다.
  const cardnews: Record<string, EasyCardnewsProject> = {};
  // 찾은 작업. 포스터에도 카드뉴스에도 없는 줄은 지운 작업이다(`deleted-work.ts`).
  let 아는작업 = new Set<string>();
  if (projectIds.length) {
    const stores = posterStoresForUser(membership.user.id);
    const images = await stores.images.byProjects(projectIds);
    /*
      작업마다 한 번씩 묻는다. 한 대화의 그림은 많아야 몇 장이라 묶어 묻는 길을
      새로 낼 값어치가 없다 — **없는 길을 만들면 그 길도 지켜야 한다.**
    */
    const projects = new Map(
      (await Promise.all(projectIds.map((id) => stores.projects.get(id))))
        .filter(Boolean)
        .map((project) => [project!.id, project!]),
    );
    /*
     * **포스터에서 못 찾은 작업만 카드뉴스에서 찾는다**(2단계 §8). 그림 줄은
     * 둘 중 하나를 가리킨다. 포스터가 먼저라 1단계 대화는 지금과 같게 열린다.
     */
    const 카드작업 = new Map(
      (await Promise.all(
        projectIds
          .filter((workId) => !projects.has(workId))
          .map((workId) => cardnewsProject(membership.user.id, workId)),
      ))
        .filter(Boolean)
        .map((project) => [project!.id, project!]),
    );
    아는작업 = new Set([...projects.keys(), ...카드작업.keys()]);

    for (const row of rows) {
      if (!row.workId) continue;
      const mine = images.filter((image) => image.projectId === row.workId);
      // 고친 줄은 그 요청의 그림, 처음 줄은 고친 그림을 뺀 나머지에서 고른다(2026-10-06).
      // 고친 줄이 없는 대화는 예전 규칙(골라 둔 것, 없으면 첫 장) 그대로다(`row-image.ts`).
      const pick = pickRowImage(row, mine, editedRequestIds(rows, row.workId));
      if (pick?.url) urls[row.id] = pick.url;

      const 카드 = 카드작업.get(row.workId);
      if (카드) cardnews[row.id] = 카드;

      const project = projects.get(row.workId);
      if (!project) continue;
      options[row.id] = {
        model: project.modelId,
        ratio: project.ratio,
        width: pick?.width ?? null,
        height: pick?.height ?? null,
        references:
          (project.data.referenceIds?.length ?? 0) + (project.data.preservedIds?.length ?? 0),
        roles: easyRoleSummary(project.data) || undefined,
      };
    }
  }

  const messages: EasyMessage[] = markDeletedWork(rows.map((row) => ({
    id: row.id,
    role: row.role,
    body: row.body,
    ...(row.workId ? { workId: row.workId } : {}),
  })), 아는작업);

  return { conversation, messages, urls, options, cardnews, pending };
}
