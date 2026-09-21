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
