import "server-only";

import { IMAGE_MODELS } from "@fixup/sns-core";
import { requireActiveMember } from "../../../lib/membership/server";
import { easyStoreForUser } from "../../../lib/easy/store";
import { posterStoresForUser } from "../../../lib/poster/stores";
import type { EasyMessage } from "../turn";

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
export const EASY_RATIO = "1:1";

/**
 * 그림 모델 목록.
 *
 * **진짜 이름을 낸다**(설계 §5-1). 모델 표의 `label` 은 우리 이름(「표준형」)이라
 * 여기서는 `id` 를 쓴다 — 예외는 이 화면 하나다.
 */
export function easyImageModels() {
  return IMAGE_MODELS.map((model) => ({ id: model.id, label: model.id }));
}

export function defaultEasyImageModel(): string {
  return IMAGE_MODELS.find((model) => model.isDefault)?.id ?? IMAGE_MODELS[0]!.id;
}

/**
 * 지난 대화의 줄들과 **그림 주소**.
 *
 * 그림 줄은 포스터 작업을 가리킬 뿐이다(`work_id`). 다시 열 때 보이게 하려면
 * 그 작업의 그림을 찾아 주소를 붙여야 한다 — **대화 표에 그림을 넣지 않기로 한
 * 대가**다(설계 §4-1). 두 곳에 두면 하나는 곧 어긋난다.
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
  if (projectIds.length) {
    const images = await posterStoresForUser(membership.user.id).images.byProjects(projectIds);
    for (const row of rows) {
      if (!row.workId) continue;
      const mine = images.filter((image) => image.projectId === row.workId);
      const pick = mine.find((image) => image.selected) ?? mine[0];
      if (pick?.url) urls[row.id] = pick.url;
    }
  }

  const messages: EasyMessage[] = rows.map((row) => ({
    id: row.id,
    role: row.role,
    body: row.body,
    ...(row.workId ? { workId: row.workId } : {}),
  }));

  return { conversation, messages, urls };
}
