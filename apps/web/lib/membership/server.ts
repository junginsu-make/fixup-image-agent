import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseAdminClient } from "../supabase/admin";
import { createSupabaseServerClient } from "../supabase/server";
import { devMembership, devUsageSummary, isLocalAuthBypass } from "../dev-auth";
import type { MemberProfile, MembershipContext, UsageSummary } from "./types";

export const getMembership = cache(async (): Promise<MembershipContext | null> => {
  if (isLocalAuthBypass) return devMembership;
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,email_confirmed_at,role,status,monthly_quota,approved_at,approval_notified_at,created_at")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) return null;
  return {
    user: { id: user.id, email: user.email },
    profile: profile as MemberProfile,
  };
});

export async function requireSignedIn() {
  const membership = await getMembership();
  if (!membership) redirect("/login");
  return membership;
}

export async function requireActiveMember() {
  const membership = await requireSignedIn();
  if (!membership.profile.email_confirmed_at || membership.profile.status !== "active") {
    redirect("/access");
  }
  return membership;
}

export async function requireAdmin() {
  const membership = await requireActiveMember();
  if (membership.profile.role !== "admin") redirect("/create");
  return membership;
}

export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  if (isLocalAuthBypass) return devUsageSummary;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("member_usage_summary", { p_user_id: userId });
  if (error || !data?.[0]) throw error ?? new Error("회원 사용량을 찾지 못했습니다.");
  const row = data[0];
  const used = Number(row.used_units);
  const reserved = Number(row.reserved_units);
  const quota = Number(row.quota);
  return {
    used,
    reserved,
    quota,
    remaining: Math.max(0, quota - used - reserved),
    periodStart: String(row.current_period_start),
    periodEnd: String(row.current_period_end),
  };
}
