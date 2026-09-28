import "server-only";
import { createSupabaseAdminClient } from "../supabase/admin";

/**
 * **관리자가 문의를 읽는 곳**(설계 §10.3).
 *
 * ── 왜 서버 키로 읽나 ──────────────────────────────────────
 *
 * 표의 RLS 는 「관리자는 다 읽는다」를 담고 있다(202609280002). 그런데 관리자
 * 화면은 이미 `requireAdmin()` 을 지난 자리이고, 회원 이메일을 함께 보여
 * 주려면 `profiles` 를 이어야 한다. 서버 키로 한 번에 읽는다.
 *
 * ── 왜 던지지 않나 ─────────────────────────────────────────
 *
 * 이 표는 나중에 붙었다. **마이그레이션 전 서버에는 없다.** 못 읽으면 빈
 * 목록을 주고, 화면은 「아직 없습니다」를 그린다 — 관리자 화면 전체가 500 이
 * 되는 것보다 낫다(`listShowcaseForAdmin` 과 같은 판단).
 */

export type InquiryStatus = "new" | "reading" | "done";

export const INQUIRY_STATUS: readonly InquiryStatus[] = ["new", "reading", "done"];

/** 화면에 적는 말. */
export const INQUIRY_STATUS_LABEL: Record<InquiryStatus, string> = {
  new: "안 봄",
  reading: "보는 중",
  done: "끝",
};

export function isInquiryStatus(value: unknown): value is InquiryStatus {
  return typeof value === "string" && (INQUIRY_STATUS as readonly string[]).includes(value);
}

export interface InquiryTurn {
  role: "user" | "bot";
  text: string;
}

export interface InquiryRow {
  id: string;
  userId: string;
  email: string;
  createdAt: string;
  question: string;
  turns: InquiryTurn[];
  /** 봇이 찾은 근거. **빈 배열이면 설명서에 그 글이 없다는 뜻이다.** */
  sources: Array<{ name: string; href: string }>;
  page: string | null;
  status: InquiryStatus;
  /** 메일을 보낸 때. 비어 있으면 **못 보냈다.** */
  mailedAt: string | null;
}

/** 목록의 한 장. 너무 많이 그리면 관리자 화면이 무거워진다. */
const 한번에 = 50;

function 말들(value: unknown): InquiryTurn[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const turn = item as { role?: unknown; text?: unknown };
    if (turn?.role !== "user" && turn?.role !== "bot") return [];
    if (typeof turn.text !== "string") return [];
    return [{ role: turn.role, text: turn.text }];
  });
}

/**
 * **이 안의 주소만 링크로 만든다.**
 *
 * 근거는 본래 앱이 넣는 값이지만, 표에 든 값은 **어디서 왔는지 모른다고
 * 보는 편이 맞다** — `jsonb` 는 무엇이든 담고, 옛 줄은 화면이 보낸 근거를
 * 그대로 실었다(2026-09-28 에 서버 것으로 바꿨다).
 *
 * 관리자가 누르는 링크라 `javascript:` 나 남의 사이트가 들어가면 **관리자를
 * 노리는 자리**가 된다. `/` 로 시작하는 이 사이트의 길만 통과시킨다.
 * `//남의곳` 은 이 사이트가 아니다.
 */
export function safeGuideHref(value: unknown): string {
  if (typeof value !== "string") return "";
  const href = value.trim();
  if (!href.startsWith("/") || href.startsWith("//")) return "";
  return href;
}

function 근거들(value: unknown): Array<{ name: string; href: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const source = item as { name?: unknown; href?: unknown };
    if (typeof source?.name !== "string") return [];
    return [{ name: source.name, href: safeGuideHref(source.href) }];
  });
}

interface 날것 {
  id: string;
  user_id: string;
  created_at: string;
  question: string;
  transcript: unknown;
  evidence: unknown;
  page: string | null;
  status: string;
  mailed_at: string | null;
  profiles?: { email?: string | null } | null;
}

export function inquiryFrom(row: 날것): InquiryRow {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    email: row.profiles?.email ?? "(알 수 없음)",
    createdAt: String(row.created_at),
    question: String(row.question ?? ""),
    turns: 말들(row.transcript),
    sources: 근거들(row.evidence),
    page: row.page ?? null,
    // 모르는 값이 오면 「안 봄」으로 둔다. 조용히 안 보이게 하지 않는다.
    status: isInquiryStatus(row.status) ? row.status : "new",
    mailedAt: row.mailed_at ?? null,
  };
}

/**
 * 안 본 것부터, 그다음 최근 순으로.
 *
 * **안 본 것을 위로 올리지 않는다** — 표의 색인이 `(status, created_at desc)`
 * 이고 `status` 의 글자 순서가 `done` < `new` < `reading` 이라 뜻이 없다.
 * 최근 순으로 주고 화면이 「안 봄」을 표시한다.
 */
export async function listInquiries(limit = 한번에): Promise<InquiryRow[]> {
  const db = createSupabaseAdminClient();
  const { data, error } = await db
    .from("cs_inquiries")
    .select("id,user_id,created_at,question,transcript,evidence,page,status,mailed_at,profiles(email)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return (data as unknown as 날것[]).map(inquiryFrom);
}

/** 탭에 적을 수. 못 읽으면 0 이다 — 없는 수를 지어내지 않는다. */
export async function countNewInquiries(): Promise<number> {
  const db = createSupabaseAdminClient();
  const { count, error } = await db
    .from("cs_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  if (error || typeof count !== "number") return 0;
  return count;
}
