import { requireActiveMember } from "../../../lib/membership/server";
import { StudioLayout } from "../../_components/studio-layout";
import { CharacterDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

/**
 * 캐릭터 하나를 여는 화면.
 *
 * 서버에서 미리 담지 않고 화면에서 가져온다 — 카드뉴스·포스터와 같은 방식이다.
 * 관리자가 남의 것을 볼 때 통로가 달라지는데, 그 갈림을 화면 쪽에 두면 서버
 * 렌더가 남의 자료를 만지지 않는다.
 */
export default async function CharacterDetailPage(
  { params }: { params: Promise<{ id: string }> },
) {
  await requireActiveMember();
  const { id } = await params;
  return <StudioLayout><CharacterDetailClient characterId={id} /></StudioLayout>;
}
