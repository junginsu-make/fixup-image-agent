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
   * 원본 상세페이지를 잘라 글 모델에게 받아쓰게 하는 호출(전사).
   *
   * **크레딧은 0 이다.** 새로 그리는 것이 없다. 그래도 값은 작지 않다 —
   * 스트립 마흔 장까지 올라가고 배치당 여덟 장이라, 한 번 돌면 호출이 다섯
   * 번까지 간다. 2026-09-21 까지 그 돈이 장부에 한 줄도 없었다(F-7-9).
   */
  | "redesign_transcribe"
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
  pricingPolicy?: "cost-v1" | "image-v2";
  balance?: number;
  settlementPending?: boolean;
  subscription?: { units: number; expiresAt: string | null };
  purchased?: { units: number; expiresAt: string | null };
  bonus?: { units: number; expiresAt: string | null };
  used: number;
  reserved: number;
  quota: number;
  remaining: number;
  periodStart: string;
  periodEnd: string;
  /**
   * **원가를 장부에 적었는가**(N-6, 설계 §8.4).
   *
   * 「정산만 완료됐다고 원가 기록까지 완료됐다고 하지 않는다」. 전에는 기록
   * 실패를 로그에만 남기고 사용량 결과를 그대로 돌려줬다 — 부르는 쪽은
   * 그것으로 「정산 끝」을 판정하므로 **돈이 새는 요청이 닫힌 것으로**
   * 표시됐다.
   *
   * 비용을 안 넘긴 요청에는 이 칸이 없다. 적을 것이 없었다는 뜻이다.
   */
  costRecorded?: boolean;
};

export type MembershipContext = {
  user: { id: string; email?: string };
  profile: MemberProfile;
};
