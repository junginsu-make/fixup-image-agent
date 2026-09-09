/**
 * 만들기가 실패했을 때 화면이 무엇을 해야 하는가.
 *
 * **409 는 오류가 아니라 「네가 모르는 사이에 이미 돌고 있다」는 통보다.**
 * 서버는 `hasActiveQueuedGeneration` 으로 그것을 알고 있는데, 화면은 자기가
 * 들고 있는 옛 흐름만 보고 「안 돌고 있다」고 판단한다. 둘이 갈리면 사용자는
 * **영원히 눌리지 않는 버튼**을 계속 누른다 — 실제로 그렇게 됐다(운영,
 * 2026-09-09: 같은 409 가 세 번).
 *
 * 갈리는 것은 흔한 일이다. 만들기 요청이 서버에는 닿았는데 응답이 화면까지
 * 못 온 경우(배포 재시작·네트워크·탭 닫힘)가 전부 여기에 해당한다.
 *
 * **import 가 한 줄도 없는 잎 모듈이다.** 화면 파일은 시험이 못 읽는다.
 */

/** 서버가 「이미 생성 중」이라고 답하는 코드. */
export const ALREADY_RUNNING = 409;

export type GenerateFailureAction = "resync" | "show-error";

/**
 * **409 면 다시 읽는다.** 화면이 서버 상태를 따라가면 진행 중인 것이 보이고,
 * 그때부터 결과를 받아 오기 시작한다.
 *
 * 그 밖의 실패는 그대로 말한다 — 다시 읽어 봐야 달라질 것이 없고, 읽는 동안
 * 오류 문구가 지워지면 무엇이 잘못됐는지 알 길이 없어진다.
 */
export function afterGenerateFailure(status?: number): GenerateFailureAction {
  return status === ALREADY_RUNNING ? "resync" : "show-error";
}
