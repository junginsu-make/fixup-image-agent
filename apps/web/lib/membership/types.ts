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
  | "sns_image"
  /**
   * 광고 규격 내보내기 (/ad).
   *
   * **새로 그리지 않는다.** 자르기·줄이기는 우리 CPU 만 쓰므로 원가가 0 이고,
   * 밖에 돈을 내는 자리는 투명 배너의 배경 제거 한 번뿐이다. 그래서 대부분의
   * 요청이 0장으로 확정되지만, 예약은 언제나 거친다 — 정지된 계정과 한도
   * 초과는 0장짜리 요청도 막아야 한다.
   */
  | "ad_export";

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
