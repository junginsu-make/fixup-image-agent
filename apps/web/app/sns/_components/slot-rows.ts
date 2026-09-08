import {
  selectReferencesForRole,
  type Attachment, type GroupedAttachments, type StyleRole,
} from "@fixup/sns-core";

const SLOTS: StyleRole[] = ["cover", "body", "ending"];

/**
 * 자리마다 보여줄 그림과 그 차례.
 *
 * **밖으로 뺀 이유는 값으로 재기 위해서다.** 컴포넌트 안에 두면 소스 문자열
 * 대조밖에 못 하는데, 그건 `picks.map` 을 `[...picks].reverse().map` 으로
 * 바꿔도 통과한다 — 이 기능의 유일한 약속(화면 번호 = 프롬프트 번호)이
 * 정면으로 깨지는데도(2026-09-08 리뷰 실측).
 *
 * **엔딩 이미지를 올렸으면 엔딩 자리를 빼야 한다.** 그 카드는 AI 를 안 거치고
 * 원본을 그대로 넣으므로, 거기 적은 글은 아무 데도 안 간다.
 */
export function slotRows(
  grouped: GroupedAttachments,
): Array<{ slot: StyleRole; picks: Attachment[] }> {
  return SLOTS
    .map((slot) => ({ slot, picks: selectReferencesForRole(grouped, slot) }))
    .filter((row) => row.picks.length > 0)
    .filter((row) => !(row.slot === "ending" && grouped.ending));
}

/**
 * 보내기 전에 **화면에 없는 자리의 글을 지운다.**
 *
 * 표지 칸에 글을 적은 뒤 표지 레퍼런스를 빼면 그 줄이 화면에서 사라지는데
 * 값은 남아 제출된다. 지금은 무해하지만(그림이 없으면 분기를 안 탄다),
 * **사용자가 못 보는 값이 서버에 남는 것 자체가 나중에 물린다**
 * (2026-09-08 리뷰).
 */
export function visibleIntents<T extends Record<StyleRole, string>>(
  grouped: GroupedAttachments,
  intents: T,
): T {
  const shown = new Set(slotRows(grouped).map((row) => row.slot));
  const next = { ...intents };
  for (const slot of SLOTS) if (!shown.has(slot)) next[slot] = "" as T[StyleRole];
  return next;
}
