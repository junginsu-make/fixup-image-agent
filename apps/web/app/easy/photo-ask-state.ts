import { EASY_PHOTO_ROLES, photoAskReason, type EasyPhotoRole, type PhotoRow } from "./photo-roles";

/**
 * **사진을 어떻게 쓸지 묻는 동안의 상태**(설계 §2-5).
 *
 * 화면에만 있고 대화 표에는 안 남는다 — 답 없이 떠나면 아무 일도 안 일어난 것이
 * 맞다(비율 물음과 같다).
 */
export interface PhotoAskState {
  /** 물음을 부른 말. 말로 답하면 그 앞에 붙인다. */
  words: string;
  reason: "unclear" | "people";
  /** 서버가 준 줄. `role` 은 판단이 정한 것 — 「그림체만」 표시를 이것으로 가른다. */
  rows: PhotoRow[];
  /** 지금 골라져 있는 것. 판단이 정한 줄은 처음부터 골라져 있다. */
  picked: Record<string, EasyPhotoRole>;
  /** 사용자가 직접 누른 줄. 말로 답할 때는 이것만 보낸다. */
  touched: string[];
}

export function startPhotoAsk(
  words: string,
  reason: PhotoAskState["reason"],
  rows: readonly PhotoRow[],
): PhotoAskState {
  return {
    words,
    reason,
    rows: [...rows],
    picked: Object.fromEntries(
      rows.filter((row) => row.role !== "unclear").map((row) => [row.id, row.role as EasyPhotoRole]),
    ),
    touched: [],
  };
}

/** 한 줄을 고른다. 다른 줄은 건드리지 않는다. */
export function pickPhoto(state: PhotoAskState, id: string, role: EasyPhotoRole): PhotoAskState {
  return {
    ...state,
    picked: { ...state.picked, [id]: role },
    touched: state.touched.includes(id) ? state.touched : [...state.touched, id],
  };
}

/** 모든 줄이 골라졌고 인물이 한 줄 이하인가. 서버와 같은 셈이다. */
export function photoAskReady(state: PhotoAskState): boolean {
  return photoAskReason(state.rows.map((row) => ({ id: row.id, role: state.picked[row.id] ?? "unclear" }))) === null;
}

/**
 * 보낼 것.
 *
 * - **단추로 답하면** 처음 말 그대로, 모든 줄의 고른 값을 보낸다 — 서버는 고른
 *   사진을 안 읽는다
 * - **말로 답하면** 처음 말과 답을 잇는다(묻는 동안 대화 표에 아무것도 안 남으므로,
 *   답만 보내면 처음 말이 사라진다). 고른 값은 사용자가 **직접 누른 줄만** 보낸다 —
 *   나머지는 이어진 말로 다시 판단한다
 */
export function photoAnswer(
  state: PhotoAskState,
  answer?: string,
): { prompt: string; photoRoles: Array<{ id: string; role: EasyPhotoRole }> } {
  const 말 = answer?.trim();
  const ids = 말 ? state.touched : state.rows.map((row) => row.id);
  return {
    prompt: 말 ? `${state.words}\n${말}` : state.words,
    photoRoles: ids.flatMap((id) => (state.picked[id] ? [{ id, role: state.picked[id]! }] : [])),
  };
}

/**
 * **지난 역할을 기억한다**(설계 §2-4 차례 3).
 *
 * 그림 턴이 끝나면 서버가 사진마다 최종 역할을 돌려준다. 사진 id 별로 들고 있다가
 * 다음 그림 턴에 보낸다 — 「좀 더 밝게」처럼 이어 말할 때 같은 물음이 또 뜨지
 * 않게 한다. 화면에만 있다. 서버가 다시 검사하므로 여기서는 모양만 거른다.
 */
export function rememberRoles(
  last: Readonly<Record<string, EasyPhotoRole>>,
  roles: unknown,
): Record<string, EasyPhotoRole> {
  if (!Array.isArray(roles)) return { ...last };
  const known = new Set<string>(EASY_PHOTO_ROLES);
  const fresh = roles
    .map((entry) => entry as { id?: unknown; role?: unknown } | null)
    .filter((one): one is { id: string; role: EasyPhotoRole } =>
      one !== null && typeof one.id === "string" && typeof one.role === "string" && known.has(one.role));
  return { ...last, ...Object.fromEntries(fresh.map((one) => [one.id, one.role])) };
}

/** 지금 붙은 사진 중 기억한 것. 이번에 단추로 고른 사진은 뺀다 — 고른 것이 이긴다. */
export function previousRolesFor(
  last: Readonly<Record<string, EasyPhotoRole>>,
  attachmentIds: readonly string[],
  chosen: ReadonlyArray<{ id: string; role: EasyPhotoRole }> = [],
): Array<{ id: string; role: EasyPhotoRole }> {
  const 고른것 = new Set(chosen.map((one) => one.id));
  return attachmentIds.flatMap((id) => (last[id] && !고른것.has(id) ? [{ id, role: last[id]! }] : []));
}
