import { CS_EMAIL } from "../../lib/cs/contact";

/**
 * **탈퇴 카드의 안내 문장**(2026-09-29).
 *
 * 약관 제11조가 「탈퇴 전에 잔여 크레딧, 환불 방법, 저장 자료의 삭제와
 * 다운로드 방법을 안내」한다고 약속한다. 넷을 이 한 문장이 맡는다.
 *
 * 전에는 「남은 크레딧도 함께 사라집니다」뿐이었다. 쓰지 않은 **구매 크레딧은
 * 환불 대상**이라(약관 제7조), 그 말 없이 「사라진다」에 동의받으면 환불받을
 * 길을 모르고 탈퇴하게 된다.
 *
 * 단위(「크레딧」·「장」)는 부르는 쪽이 `useCreditUnit()` 으로 넘긴다.
 */
export function withdrawNotice({ availableCredits, unit }: { availableCredits: number; unit: string }): string {
  const credits =
    availableCredits > 0
      ? ` 남은 크레딧 ${availableCredits}${unit}도 함께 사라집니다. 쓰지 않은 구매 크레딧과 이번 달에 한 번도 쓰지 않은 구독은 환불받으실 수 있으니, 탈퇴 전에 ${CS_EMAIL} 로 먼저 신청하시길 권합니다.`
      : "";

  return (
    "탈퇴하면 로그인할 수 없게 되고 만든 작업물과 라이브러리가 모두 사라집니다. 되돌릴 수 없습니다." +
    " 필요한 작업물은 탈퇴하기 전에 라이브러리에서 내려받아 주세요." +
    credits +
    " 결제·크레딧 기록은 법령에 따라 보관됩니다."
  );
}
