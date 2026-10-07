import { readGuide } from "./row-marks";

/**
 * **상세페이지는 「쉽게」에서 만들지 않는다 — 안내로 끝낸다**
 * (설계 §2-7, 2026-09-30 사용자 결정).
 *
 * 안내 문구는 **코드가 정한 한 문장**이다. 모델이 짓게 두면 매번 다른 길을
 * 알려 준다. 화면은 이 문장과 **똑같은 도우미 줄**에만 단추를 단다 — 대화
 * 표에 갈래를 더하지 않아도 다시 열었을 때 단추가 그대로 보인다.
 *
 * 2026-10-07 2차 D4: 안내 문장은 이제 AI 가 쓰고(비면 이 문장), 줄 글에 `guide:detail:` 표시를 붙여
 * 단추를 단다. 표시 없는 옛 줄(이 문장과 완전일치)도 계속 안내로 본다.
 */
export const DETAIL_PAGE_GUIDE =
  "상세페이지는 「상세페이지 만들기」에서 만듭니다. 섹션마다 문구와 이미지를 확인하면서 만들 수 있어요. 아래 단추로 바로 열 수 있습니다.";

/** 상세페이지 만들기 화면. */
export const DETAIL_PAGE_HREF = "/create";

export function isDetailPageGuide(message: { role: string; body: string }): boolean {
  return message.role === "assistant"
    && (message.body === DETAIL_PAGE_GUIDE || readGuide(message as { role: "assistant"; body: string })?.kind === "detail");
}
