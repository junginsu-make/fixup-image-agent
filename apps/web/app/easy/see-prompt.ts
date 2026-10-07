import { doneImageNumbers, type EasyResultEntry } from "./image-numbers";

/**
 * **이미지를 보고 답하기 — 볼 것 고르기 · 프롬프트**(2026-10-07 2차 설계 D5 · §3-5).
 *
 * 판단 모델이 적은 `see`(이 대화의 이미지 번호 「2」 · 붙인 사진 「p1」)에서 실제로 볼 수 있는 것만
 * 고른다 — 다 만든 이미지(카드뉴스 · 지운 것 · 못 읽은 것 · 만드는 중은 안 본다) · 지금 붙은 사진.
 * 같은 것은 한 번만(「1」 · 「01」), 한 턴 네 장까지(값 · 기다림을 묶어 둔다).
 */
export type EasySeeTarget = { kind: "image"; n: number } | { kind: "photo"; index: number };

/**
 * 보고 답하기가 실패했을 때 판단의 답 대신 남길 말(2차 최종 리뷰 10). 판단의 답은 「살펴볼게요」처럼 볼 것을
 * 기대한 글일 수 있다 — 못 봤으면 못 봤다고 사실대로 말한다.
 */
export const SEE_FAILED = "지금은 이미지를 볼 수 없었습니다. 잠시 뒤 다시 물어봐 주세요.";

const 최대 = 4;

export function seeTargets(see: readonly string[], entries: readonly EasyResultEntry[], photoCount: number): EasySeeTarget[] {
  const 다만든 = new Set(doneImageNumbers(entries));
  const 고른 = see.flatMap((one): EasySeeTarget[] => {
    if (one.startsWith("p")) {
      const index = Number(one.slice(1));
      return Number.isInteger(index) && index >= 1 && index <= photoCount ? [{ kind: "photo", index }] : [];
    }
    const n = Number(one);
    return 다만든.has(n) ? [{ kind: "image", n }] : [];
  });
  return 고른.filter((one, at) => 고른.findIndex((other) => seeLabel(other) === seeLabel(one)) === at).slice(0, 최대);
}

export function seeLabel(target: EasySeeTarget): string {
  return target.kind === "image" ? `이 대화의 이미지 ${target.n}번` : `사용자가 붙인 사진 ${target.index}`;
}

export function easySeePrompt(input: { history: readonly string[]; prompt: string; labels: readonly string[] }): string {
  return [
    "당신은 이미지를 만들어 주는 도우미입니다. 한국어로 답합니다.",
    "사용자가 이미지에 대해 물었습니다. 함께 보낸 이미지를 **직접 보고** 답하세요. 보이지 않는 것을 지어내지 마세요.",
    "",
    "── 보낸 이미지 (보낸 차례) ──",
    ...input.labels.map((label, at) => `${at + 1}번째: ${label}`),
    "",
    ...(input.history.length ? ["── 지난 대화 ──", ...input.history, ""] : []),
    "── 사용자의 마지막 말 ──",
    input.prompt,
    "",
    "`reply` 에 2~4문장으로 답하세요. 보이는 것을 근거로 말하고, 고치고 싶은 점이 있으면 「이미지 2 배경만 파랗게」처럼",
    "말해 달라고 안내해도 됩니다. 「그림」이라 하지 말고 「이미지」라고 쓰세요.",
  ].join("\n");
}
