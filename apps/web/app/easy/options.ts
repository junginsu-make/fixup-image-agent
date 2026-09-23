/**
 * **이 이미지가 어떤 조건으로 만들어졌나** (2026-09-21 사용자 — 「결과물 밑에
 * 바로 보이게해서 해당 이미지가 어떤 조건으로 만들어졌는지 쉽게 알게」).
 *
 * ── 왜 화면 밖에 있나 ────────────────────────────────────────
 *
 * 무엇을 적고 무엇을 뺄지가 판단이다. `.tsx` 안에 두면 값으로 못 잰다 — 이
 * 저장소가 계속 지켜 온 방식이다(`turn.ts` · `title.ts` · `cost.ts` · `chat.ts`).
 *
 * ── 지어내지 않는다 ─────────────────────────────────────────
 *
 * 전에는 크게 보기 창이 「글 모델 · 이미지 모델 · 비율」을 **입력창 위 드롭다운의
 * 지금 값**으로 적었다. 그래서 어제 만든 그림을 오늘 열면 **오늘 골라 둔 모델
 * 이름**이 붙었다. 틀린 값을 자신 있게 적고 있었다.
 *
 * 이제 만든 작업에서 읽는다. 그래서 **글 모델은 빠졌다** — 어디에도 안 남는
 * 값이라 되살릴 길이 없다. 모르는 것을 비우는 편이 지어내는 것보다 낫다.
 */

export interface EasyImageOptions {
  /** 어느 모델로 만들었나. 이 화면은 진짜 이름을 낸다(설계 §5-1). */
  model?: string;
  /** 어느 비율로. */
  ratio?: string;
  /** 실제로 나온 크기(px). */
  width?: number | null;
  height?: number | null;
  /** 붙였던 참고 이미지 장수. */
  references?: number;
}

/**
 * 결과 밑에 한 줄로 적을 말들.
 *
 * **모르는 칸은 아예 안 적는다.** 「모델 —」처럼 빈 채로 두면 읽는 사람이 그
 * 대시가 무슨 뜻인지 한 번 더 생각하게 된다. 없으면 없는 것이다.
 *
 * 값만 적고 이름표를 안 붙인다. 「gpt-image-2.5-flare」·「1:1」·「1200 × 1200」은
 * **그 자체로 무엇인지 알아볼 수 있는 값**이라 이름표가 자리만 차지한다.
 * 참고 장수만 숫자 홀로는 뜻이 안 서서 말을 붙인다.
 */
export function easyOptionLines(options: EasyImageOptions | undefined): string[] {
  if (!options) return [];

  const lines: string[] = [];
  if (options.model) lines.push(options.model);
  if (options.ratio) lines.push(options.ratio);
  if (options.width && options.height) lines.push(`${options.width} × ${options.height}`);
  // 0장은 「안 붙이고 만들었다」는 뜻이라 적을 값어치가 있다. 모르면 안 적는다.
  if (typeof options.references === "number") lines.push(`참고 ${options.references}장`);

  return lines;
}

/**
 * 크게 보기 창의 오른쪽 칸에 걸 **이름표와 값**.
 *
 * 밑줄(`easyOptionLines`)과 **같은 값을 다르게 낸다.** 결과 밑은 좁아서 값만
 * 늘어놓지만, 크게 보기 창은 설명을 읽는 자리라 이름표가 있어야 무엇을 보는지
 * 안다.
 *
 * 두 곳이 서로 다른 것을 말하면 안 되므로 **한 자리에서 같이 정한다.**
 */
export function easyOptionMeta(options: EasyImageOptions | undefined): Array<[string, string]> {
  if (!options) return [];

  const rows: Array<[string, string]> = [];
  if (options.model) rows.push(["이미지 모델", options.model]);
  if (options.ratio) rows.push(["비율", options.ratio]);
  if (options.width && options.height) rows.push(["크기", `${options.width} × ${options.height}`]);
  if (typeof options.references === "number") rows.push(["참고 이미지", `${options.references}장`]);

  return rows;
}
