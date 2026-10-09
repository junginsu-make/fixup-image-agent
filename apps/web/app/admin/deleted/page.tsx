import { requireAdmin } from "../../../lib/membership/server";
import { DeletedPanel } from "./deleted-panel";
import { loadDeletedMaterials } from "./load";

export const dynamic = "force-dynamic";

/**
 * 삭제 보관 탭(`/admin/deleted`, 2026-10-08 계획 2단계). 회원이 지운 캐릭터·참고 이미지·쉽게 대화를 보고 완전히
 * 지운다. 회원이 지운 생성 결과(카드뉴스·상세페이지 등)는 라이브러리 「전체 회원 보기」에 「회원이 삭제함」으로 뜬다.
 *
 * 못 읽으면 화면은 열고 이유를 적는다 — 마이그레이션(202610090002) 전 서버에는 지운 때 칸이 없다.
 */
export default async function AdminDeletedPage() {
  const { user, profile } = await requireAdmin();
  try {
    const loaded = await loadDeletedMaterials({ userId: user.id, role: profile.role });
    return <DeletedPanel {...loaded} />;
  } catch (error) {
    console.error("[admin:deleted]", error instanceof Error ? error.message : error);
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
        회원이 지운 자료를 읽지 못했습니다. <code>supabase/migrations/202610090002_soft_delete_materials.sql</code> 을 아직 안 돌린
        서버일 수 있습니다.
      </p>
    );
  }
}
