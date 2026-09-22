import { redirect } from "next/navigation";

/**
 * 옛 「회원·크레딧 관리」 주소. 2026-09-22 에 회원 관리 탭(`/admin`)으로 합쳤다.
 * 즐겨찾기·이전 안내 링크가 깨지지 않게 거르던 조건을 그대로 들고 옮긴다.
 */
export default async function LegacyMembersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const keep = new URLSearchParams();
  for (const key of ["q", "status", "plan", "balance", "review", "page"]) {
    const value = params[key];
    if (typeof value === "string" && value) keep.set(key, value);
  }
  const query = keep.toString();
  redirect(query ? `/admin?${query}` : "/admin");
}
