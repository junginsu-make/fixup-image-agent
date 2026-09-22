import type { MemberProfile } from "../../../lib/membership/types";

/** 회원 관리 탭의 한 줄. 서버가 만들어 클라이언트 표로 넘긴다. */
export interface AdminMemberRow {
  profile: Pick<MemberProfile, "id" | "email" | "email_confirmed_at" | "role" | "status" | "approved_at" | "created_at" | "monthly_quota">;
  team?: { teamId: string; teamName: string; role: "leader" | "member" };
  /** 이번 달 성공 이미지 수(생성 기록 기준). 크레딧 차감과 다를 수 있다 — 인쇄용은 2크레딧이다. */
  monthImages: number;
  monthCost: string;
  totalCost: string;
  totalImages: number;
  /** 크레딧 장부가 꺼진 서버(로컬 미리보기)에서는 null. */
  credit: CreditInfo | null;
}

export interface CreditInfo {
  available: number;
  reserved: number;
  used: number;
  unlimited: boolean;
  planId: string | null;
  planStatus: string | null;
  nextExpires: string | null;
  reviewUnits: number;
}

export interface CreditPlan {
  id: string;
  name: string;
  monthly_units: number;
  price_krw: number;
  active: boolean;
}

export const PLAN_STATUS_LABEL: Record<string, string> = { active: "이용 중", canceled: "해지", suspended: "중단" };
