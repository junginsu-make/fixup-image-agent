import { createSupabaseAdminClient } from "./supabase/admin";

/**
 * 실제로 나간 비용.
 *
 * 회원에게 차감하는 '장수'와 우리가 낸 '돈'은 다르다. 모델마다 단가가 다르고,
 * 생성이 실패해 회원에게 안 물린 장도 우리는 이미 값을 치렀다.
 *
 * 단가는 DB(model_prices)에 있고 관리자가 고친다. 처음 넣은 값은 fal 공개
 * 단가라 실제 청구서와 다를 수 있다 — 그래서 화면에 '운영자 설정 단가 기준'
 * 이라고 밝힌다. 없는 정확도를 있는 것처럼 보이면 안 된다.
 */

export interface CostSummary {
  todayUsd: number;
  monthUsd: number;
  totalUsd: number;
  todayImages: number;
  monthImages: number;
  totalImages: number;
  /** 만들어 놓고 회원에게 못 준 것. 우리는 돈을 냈고 회원은 안 썼다. */
  wastedUsd: number;
  wastedImages: number;
  unknownCalls?: number;
  pendingCalls?: number;
}

export interface ModelPrice {
  model: string;
  label: string;
  unitCostUsd: number;
  note: string | null;
}

const OPERATION_LABEL: Record<string, string> = {
  pdp_analyze: "새로 만들기 · 분석",
  pdp_image: "새로 만들기 · 이미지",
  redesign_generate: "리디자인 · 생성",
  redesign_edit: "리디자인 · 수정",
  poster_image: "포스터 · 이미지",
  poster_plan: "포스터 · 기획",
  poster_review: "포스터 · 검수",
  sns_image: "카드뉴스 · 이미지",
  sns_plan: "카드뉴스 · 기획",
  sns_caption: "카드뉴스 · 게시글",
  layout_analyze: "레이아웃 · 분석",
  redesign_transcribe: "리디자인 · 전사",
};

export function operationLabel(operation: string) {
  return OPERATION_LABEL[operation] ?? operation;
}

const n = (value: unknown) => Number(value ?? 0);

/** 환율. 관리자가 넣은 고정값을 쓴다 — 외부 시세에 기대면 숫자가 매일 흔들린다. */
export async function getUsdKrw(): Promise<number> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", "usd_krw")
    .maybeSingle();
  const parsed = Number(data?.value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1380;
}

export async function setUsdKrw(rate: number) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("app_settings")
    .upsert({ key: "usd_krw", value: String(rate), updated_at: new Date().toISOString() });
}

export async function getModelPrices(): Promise<ModelPrice[]> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("model_prices")
    .select("model,label,unit_cost_usd,note")
    .order("unit_cost_usd", { ascending: false });
  return (data ?? []).map((row: Record<string, unknown>) => ({
    model: String(row.model),
    label: String(row.label),
    unitCostUsd: n(row.unit_cost_usd),
    note: (row.note as string | null) ?? null,
  }));
}

export async function setModelPrice(model: string, unitCostUsd: number) {
  const admin = createSupabaseAdminClient();
  await admin
    .from("model_prices")
    .update({ unit_cost_usd: unitCostUsd, updated_at: new Date().toISOString() })
    .eq("model", model);
}

export async function getCostSummary(): Promise<CostSummary> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cost_summary_v2");
  if (error) throw new Error("Cost summary is unavailable.");
  const row = (data?.[0] ?? {}) as Record<string, unknown>;
  return {
    todayUsd: n(row.today_usd),
    monthUsd: n(row.month_usd),
    totalUsd: n(row.total_usd),
    todayImages: n(row.today_images),
    monthImages: n(row.month_images),
    totalImages: n(row.total_images),
    wastedUsd: n(row.wasted_usd),
    wastedImages: n(row.wasted_images),
    unknownCalls: n(row.unknown_calls),
    pendingCalls: n(row.pending_calls),
  };
}

export async function getCostByMember(userIds: string[]) {
  if (!userIds.length) return new Map<string, { monthUsd: number; totalUsd: number; images: number }>();
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cost_by_member_v2", { p_user_ids: userIds });
  if (error) throw new Error("Cost summary is unavailable.");
  const map = new Map<string, { monthUsd: number; totalUsd: number; images: number }>();
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    map.set(String(row.user_id), {
      monthUsd: n(row.month_usd),
      totalUsd: n(row.total_usd),
      images: n(row.total_images),
    });
  }
  return map;
}

export async function getCostByOperation(days = 30) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cost_by_operation_v2", { p_days: days });
  if (error) throw new Error("Cost summary is unavailable.");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    operation: String(row.operation),
    images: n(row.images),
    usd: n(row.usd),
  }));
}

export async function getCostByModel(days = 30) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cost_by_model_v2", { p_days: days });
  if (error) throw new Error("Cost summary is unavailable.");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    model: String(row.model),
    label: String(row.label),
    unitCostUsd: n(row.unit_cost_usd),
    images: n(row.images),
    usd: n(row.usd),
  }));
}

export async function getCostDaily(days = 30) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("admin_cost_daily_v2", { p_days: days });
  if (error) throw new Error("Cost summary is unavailable.");
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    date: String(row.usage_date),
    images: n(row.images),
    usd: n(row.usd),
    wastedUsd: n(row.wasted_usd),
  }));
}

/** 원화 표기. 1원 미만은 반올림한다 — 소수점 원은 읽는 데 방해만 된다. */
export function formatKrw(usd: number, usdKrw: number) {
  return `${Math.round(usd * usdKrw).toLocaleString("ko-KR")}원`;
}

export function formatUsd(usd: number) {
  return `$${usd.toFixed(2)}`;
}
