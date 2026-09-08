export type UserRole = "member" | "admin";
export type MembershipStatus = "pending" | "active" | "suspended";
export type GenerationOperation =
  | "pdp_analyze"
  | "pdp_image"
  | "redesign_generate"
  | "redesign_edit"
  // 이미지 만들기·카드뉴스. **2026-09-08 까지 장부에 한 줄도 없었다** —
  // 여기에 값이 없어서 예약 자체를 부를 수 없었다.
  | "poster_image"
  | "sns_image";

export type MemberProfile = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  role: UserRole;
  status: MembershipStatus;
  monthly_quota: number;
  approved_at: string | null;
  approval_notified_at: string | null;
  created_at: string;
};

export type UsageSummary = {
  used: number;
  reserved: number;
  quota: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
};

export type MembershipContext = {
  user: { id: string; email?: string };
  profile: MemberProfile;
};
