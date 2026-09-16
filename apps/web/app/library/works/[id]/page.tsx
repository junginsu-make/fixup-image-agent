import { requireActiveMember } from "../../../../lib/membership/server";
import { StudioLayout } from "../../../_components/studio-layout";
import { WorkDetailClient } from "./detail-client";

export const dynamic = "force-dynamic";

/**
 * 계정에 보관된 상세페이지·리디자인 작업 한 건.
 *
 * **도구 화면(`/create`)이 아니라 라이브러리 쪽에 둔다.** 계정 보관분은
 * 브라우저 초안이 아니라 이어서 편집할 수 없다(`library/page.tsx` 의 주석).
 * 도구로 보내면 「저장된 작업을 찾지 못했습니다」가 뜬다 — 예전에 실제로 그랬다.
 *
 * 서버에서 미리 담지 않고 화면에서 가져온다 — 카드뉴스·포스터·캐릭터와 같은
 * 방식이다. 관리자가 남의 것을 볼 때 통로가 달라지는데, 그 갈림을 화면 쪽에
 * 두면 서버 렌더가 남의 자료를 만지지 않는다.
 */
export default async function LibraryWorkPage(
  { params }: { params: Promise<{ id: string }> },
) {
  await requireActiveMember();
  const { id } = await params;
  return <StudioLayout><WorkDetailClient workId={id} /></StudioLayout>;
}
