import "server-only";

import { imageModelName } from "@fixup/shared";
import { IMAGE_MODELS, VISIBLE_IMAGE_MODELS } from "@fixup/sns-core";
import { requireActiveMember } from "../../../lib/membership/server";
import { easyStoreForUser } from "../../../lib/easy/store";
import { posterStoresForUser } from "../../../lib/poster/stores";
import { cardnewsProject, type EasyCardnewsProject } from "../../../lib/easy/cardnews-steps";
import { posterRequestsFinished } from "../../../lib/easy/pending-requests";
import { markDeletedWork } from "../deleted-work";
import { editedRequestIds, jobRowStates, pickRowImage, rowJobRequestIds } from "../row-image";
import { numberEasyResults, resultKindOf, resultLabel } from "../image-numbers";
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
 * 이미지 모델 목록 — **보이는 셋(표준형·디테일형·속도형)만**, 한국어 이름으로 낸다.
 *
 * 예전에는 모델 표 전체를 id 그대로 냈다(2026-09-21). 이제는 다른 화면과 같은 이름을
 * 쓴다(`imageModelName`). 숨긴 모델은 새로 고를 수 없다. 옛 작업의 모델은
 * `options` 에서 `imageModelName` 으로 읽는다.
 */
export function easyImageModels() {
  return VISIBLE_IMAGE_MODELS
    .map((model) => ({
      id: model.id,
      label: imageModelName(model.id),
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
   * 골라 둔 것이 있으면 그것을, 없으면 첫 장을 보인다. 04 가 없는 모드라
   * 「고른 변형」이 대개 비어 있다.
   */
  const urls: Record<string, string> = {};
  const options: Record<string, EasyImageOptions> = {};
  // 카드뉴스 원고 줄(2단계 §8). 줄 id → 그 작업. 원고 · 진행 · 결과를 여기서 그린다.
  const cardnews: Record<string, EasyCardnewsProject> = {};
  // 찾은 작업. 포스터에도 카드뉴스에도 없는 줄은 지운 작업이다(`deleted-work.ts`).
  let 아는작업 = new Set<string>();
  // 포스터 작업(결과물 이름표의 「이미지」, 2차 D2). 아는 작업 가운데 포스터가 아닌 것이 카드뉴스다.
  let 포스터작업 = new Set<string>();
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
    포스터작업 = new Set(projects.keys());

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

  /*
   * **그림이 없는 그림 줄의 처지**(2026-10-06 설계 B3 · B5, 최종 리뷰 · 리뷰 1차). 주소를 다
   * 고른 **뒤에** 그림 없는 줄만 묻는다. 안 끝난 줄은 화면이 이어 받고(`pending`), 끝났는데
   * 그림이 없는 줄은 실패로 보인다(`failed`). 끝난 요청을 다시 물으면 `status` 가 결과를
   * 또 저장하고 또 정산한다. 못 읽은 줄은 어느 쪽도 아니다.
   */
  const 받기 = jobRowStates(rows, urls, await posterRequestsFinished(membership.user.id, rowJobRequestIds(rows, urls)));

  const messages: EasyMessage[] = markDeletedWork(rows.map((row) => ({
    id: row.id,
    role: row.role,
    body: row.body,
    ...(row.workId ? { workId: row.workId } : {}),
  })), 아는작업);

  /*
   * 결과물 이름표(2차 D2) — 이미지 · 카드뉴스 · 지운 것 모두 대화 차례대로 센다. 서버 판단과 같은 함수다.
   * `resultKindOf` 는 포스터를 먼저 보므로 「아는 작업」을 카드뉴스 자리에 넘겨도 된다.
   */
  const labels = Object.fromEntries(numberEasyResults(rows).map((one) => [
    one.rowId, resultLabel(resultKindOf(one.workId, 포스터작업, 아는작업), one.n),
  ]));
  return { conversation, messages, urls, options, cardnews, pending: 받기.pending, failed: 받기.failed, labels };
}
