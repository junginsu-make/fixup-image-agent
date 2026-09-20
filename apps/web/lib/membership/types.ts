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
   * 레퍼런스를 올릴 때 그림을 읽어 서술을 만드는 호출.
   *
   * **크레딧은 0 이다.** 새로 그리는 것이 없다. 그래도 글 모델 값은 나가고,
   * 2026-09-20 까지 그 값이 장부에 한 줄도 없었다(C-4-b).
   *
   * 상세페이지 분석과 **칸을 나눈 이유**는 `lib/membership/hourly-limit.ts` 에
   * 적어 두었다 — 한자리에서 스무 장을 올리는 일이 정상이기 때문이다.
   */
  | "reference_analyze"
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
