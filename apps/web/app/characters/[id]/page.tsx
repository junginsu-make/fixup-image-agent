import { requireActiveMember } from "../../../lib/membership/server";
import { CharacterOpenClient } from "./open-client";

export const dynamic = "force-dynamic";

/**
 * 캐릭터 하나를 여는 화면.
 *
 * 내 캐릭터면 캐릭터 도구가 그 값으로 열리고, 남의 것이면 보기 전용 화면이다
 * (`open-client.tsx`). 서버에서 미리 담지 않고 화면에서 가져온다 — 카드뉴스·
 * 포스터와 같은 방식이다.
 *
 * **셸은 `characters/layout.tsx` 가 씌운다.** 여기서 또 감싸면 대시보드 안에
 * 대시보드가 보인다(2026-10-02).
 */
export default async function CharacterDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  await requireActiveMember();
  const { id } = await params;
  return <CharacterOpenClient characterId={id} />;
}
