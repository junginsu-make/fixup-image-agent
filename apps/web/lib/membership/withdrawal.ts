import type { MembershipStatus } from "./types";

/**
 * **회원 탈퇴 — 무엇을 할 수 있고 무엇을 말하나**(2026-09-23 사용자 요청).
 *
 * 「모든 사용자는 계정(개인페이지)에서 탈퇴 할 수 있어야 합니다.」
 *
 * ── 왜 두 갈래인가 ─────────────────────────────────────────
 *
 * 데이터베이스가 **돈 기록이 있는 회원의 삭제를 막는다**
 * (`credit_member_has_records`, 202609220003). 「돈 기록은 회원과 함께 지우지
 * 않는다」는 그때의 결정이고 이번에 뒤집지 않는다.
 *
 *   기록 없음 → 인증 계정까지 **지운다**
 *   기록 있음 → 로그인을 막고 개인정보를 지우되 **돈 기록은 남긴다**
 *
 * **사용자에게는 둘 다 「탈퇴」다.** 어느 쪽인지는 시스템이 정한다. 다만
 * **무엇이 남는지는 정확히 말한다.**
 *
 * ── 여기는 판단만 한다 ─────────────────────────────────────
 *
 * 지우는 일도 닫는 일도 서버가 한다. 이 파일은 **어느 길로 갈지와 뭐라고
 * 말할지**만 정한다 — 그래야 값으로 잴 수 있다.
 */

/** 탈퇴가 실제로 무엇을 하는가. */
export type WithdrawalPath =
  /** 인증 계정까지 지운다. 되돌릴 수 없다. */
  | "delete"
  /** 계정을 닫는다. 돈 기록은 남는다. */
  | "close";

export interface WithdrawalState {
  /** 돈 기록(크레딧 지급·구독·작업)이 있는가. */
  hasMoneyRecords: boolean;
  /** 지금 만들고 있는 것이 있는가(크레딧이 잡혀 있다). */
  hasWorkInProgress: boolean;
  /** 남은 크레딧. 사라지는 양을 숫자로 보여 주려고 받는다. */
  availableCredits: number;
  status: MembershipStatus | string;
}

export type WithdrawalCheck =
  | { ok: true; path: WithdrawalPath; notice: string }
  | { ok: false; reason: string };

/**
 * **만들고 있는 중에는 못 떠난다.**
 *
 * 크레딧이 잡혀 있다는 것은 지금 그림을 만들고 있다는 뜻이다. 그 사이에
 * 계정을 닫으면 결과가 갈 곳이 없어지고, 잡힌 크레딧도 풀 데가 없다.
 */
const IN_PROGRESS = "지금 만들고 있는 작업이 있습니다. 끝난 뒤에 다시 시도해 주세요.";

/** 이미 떠난 계정. 여기 닿을 일이 없지만 닿으면 조용히 끝낸다. */
const ALREADY = "이미 탈퇴한 계정입니다.";

export function checkWithdrawal(state: WithdrawalState): WithdrawalCheck {
  if (state.status === "withdrawn") return { ok: false, reason: ALREADY };
  if (state.hasWorkInProgress) return { ok: false, reason: IN_PROGRESS };

  return state.hasMoneyRecords
    ? { ok: true, path: "close", notice: closeNotice(state.availableCredits) }
    : { ok: true, path: "delete", notice: deleteNotice(state.availableCredits) };
}

/**
 * **남은 크레딧을 숫자로 말한다.**
 *
 * 「사라집니다」만으로는 얼마가 사라지는지 모른다. 42장이 적혀 있으면 한 번
 * 더 생각한다. 0 장이면 그 말을 안 한다 — 없는 것을 아깝다고 말하지 않는다.
 */
function 크레딧말(available: number): string {
  return available > 0 ? ` 남은 크레딧 ${available}장도 함께 사라집니다.` : "";
}

function deleteNotice(available: number): string {
  return (
    "탈퇴하면 계정과 만든 작업물이 모두 사라집니다. 되돌릴 수 없습니다." +
    크레딧말(available)
  );
}

/**
 * **무엇이 남는지 정확히 말한다.**
 *
 * 「다 지웁니다」라고 해 놓고 돈 기록이 남으면 그것은 거짓말이다. 남기는
 * 까닭까지 적는다 — 그래야 「왜 안 지우냐」는 물음이 안 생긴다.
 */
function closeNotice(available: number): string {
  return (
    "탈퇴하면 로그인할 수 없게 되고 만든 작업물이 모두 사라집니다. 되돌릴 수 없습니다." +
    크레딧말(available) +
    " 결제·크레딧 기록은 법령에 따라 보관됩니다."
  );
}

/**
 * 탈퇴를 마친 뒤 사용자에게 할 말.
 *
 * **어느 길로 갔는지 숨기지 않는다.** 기록이 남았는데 「모두 삭제했습니다」
 * 라고 하면 나중에 문의가 온다.
 */
export function withdrawalDone(path: WithdrawalPath): string {
  return path === "delete"
    ? "탈퇴가 완료되었습니다. 계정이 모두 삭제되었습니다."
    : "탈퇴가 완료되었습니다. 결제·크레딧 기록은 법령에 따라 보관됩니다.";
}

/**
 * **확인 글자가 맞는가.**
 *
 * 관리자가 회원을 지울 때 이미 이메일을 그대로 치게 한다. 같은 무게의
 * 일이니 같은 문턱을 둔다.
 */
export function confirmsWithdrawal(typed: unknown, email: string): boolean {
  return String(typed ?? "").trim().toLowerCase() === String(email).trim().toLowerCase();
}
