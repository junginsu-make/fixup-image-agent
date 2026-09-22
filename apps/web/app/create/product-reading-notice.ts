import type { CopyGapOutcome, ProductReadingStatus } from "@fixup/pdp-core";

/**
 * 판독 상태를 **사용자가 할 수 있는 말**로 바꾼다.
 *
 * 그리기와 떼어 둔다. 붙여 두면 「쓸 만할 때 아무 말도 안 하는가」, 「한 일만
 * 말하는가」를 화면을 띄우지 않고는 잴 수 없다 — 이 저장소에는 jsdom 이 없다.
 */

export interface ProductReadingNoticeView {
  tone: "warning" | "info";
  title: string;
  body: string;
  /** 고른 정책을 내렸고 **그래서 실제로 비운 칸이 있을 때만.** */
  policyNote?: string;
}

export function productReadingNoticeOf(input: {
  status?: ProductReadingStatus;
  /** 서버가 **실제로 무엇을 했는지**. 화면의 현재 토글값이 아니다. */
  gapOutcome?: CopyGapOutcome;
}): ProductReadingNoticeView | null {
  /*
    **쓸 만할 때는 아무 말도 하지 않는다.**

    멀쩡한 결과에 「확인하세요」를 붙이면 모든 화면에 붙는 것과 같아진다. 그러면
    정말 위험한 화면에서도 사용자가 그 문구를 넘긴다.
  */
  if (!input.status || input.status === "usable") return null;

  if (input.status === "thin") {
    return {
      tone: "info",
      title: "사진에서 제품을 충분히 읽지 못했습니다",
      body: "카피는 직접 적어주신 정보에 기대고 있습니다. 사진에서 확인되지 않은 내용이 섞일 수 있으니 아래에서 확인해주세요.",
    };
  }

  const outcome = input.gapOutcome;
  /*
    **정한 것이 아니라 한 것을 말한다.**

    정책을 내려도 한 칸도 안 비워질 수 있다 — 모델이 근거 딱지를 안 붙인 섹션은
    검사가 통째로 건너뛴다. 그때 「치웠습니다」라고 하면 사용자는 위험한 문장이
    사라진 줄 알고 그대로 발행한다. 원래 문제보다 나쁘다.

    내렸는지도 **서버가 적은 것**으로 판단한다. 화면의 현재 토글값은 그 실행에
    쓰인 값이 아니다 — 사용자는 결과를 본 뒤에도 그 값을 바꿀 수 있다.
  */
  const 내렸고비웠다 = Boolean(outcome && outcome.applied !== outcome.requested && outcome.cleared > 0);

  return {
    tone: "warning",
    title: "사진에서 제품을 읽지 못했습니다",
    body: "카피가 딛고 설 근거가 없습니다. 제품이 크게 보이는 사진으로 바꾸거나, 아래 판매자 정보에 제품 설명을 적어주세요.",
    ...(내렸고비웠다
      ? {
          policyNote: `「예시로 채우기」를 고르셨지만, 근거가 없으면 페이지 전체가 지어낸 문장이 됩니다. 근거를 확인할 수 없는 ${outcome!.cleared}곳을 비웠습니다.`,
        }
      : {}),
  };
}
