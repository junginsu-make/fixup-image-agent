import type { GenerationOperation } from "./types";

/**
 * **시간당 몇 번까지 부를 수 있는가.**
 *
 * ── 왜 작업마다 다른가 ───────────────────────────────────────
 *
 * 상세페이지 분석은 시간당 열 번이다. 한 번이 몇십 초 걸리고 결과가 길다.
 *
 * 레퍼런스 등록은 다르다. 한자리에서 스무 장을 올리는 일이 정상이고, 한 장에
 * 그림 한 번 읽는 값뿐이다. **같은 칸을 쓰면 레퍼런스를 정리하다가 그날
 * 상세페이지를 못 만들게 된다.**
 *
 * 설계 §7.2: 「현재 시간당 분석 제한 설정은 **재사용**하고 레퍼런스 분석·전사
 * 에도 **명시된 LLM 작업 한도**를 적용한다.」 세는 방식(`reserve_generation`)은
 * 같이 쓰고 칸만 나눈다.
 *
 * ── SQL 과 짝이다 ────────────────────────────────────────────
 *
 * 여기 있는 작업만 `reserve_generation` 이 시간당으로 센다
 * (`202609210001_transcribe_operation.sql`). 한쪽만 늘리면 한도가 없는
 * 채로 돌거나, 앱이 엉뚱한 수를 넣는다.
 */

/** 못 넘는 범위. SQL 도 `least(greatest(…, 1), 1000)` 으로 같게 조인다. */
const MIN = 1;
const MAX = 1000;

export const HOURLY_LIMITS = {
  /** 상세페이지 기획. 한 번이 길고 값이 크다. */
  pdp_analyze: { env: "ANALYZE_HOURLY_LIMIT", fallback: 10 },
  /**
   * 레퍼런스 서술.
   *
   * 60 은 지어낸 수가 아니다. `MAX_USER_REFERENCES`(40)가 글 모델이 한 번에
   * 보는 레퍼런스 수이고, **목록을 통째로 새로 채우는 일이 한 시간 안에 한
   * 번은 되어야 한다.** 그보다 넉넉히 잡았다.
   */
  reference_analyze: { env: "REFERENCE_ANALYZE_HOURLY_LIMIT", fallback: 60 },
  /**
   * 전사.
   *
   * **한 번 전사가 호출 한 번이 아니다.** 화면이 원본을 스트립 마흔 장까지
   * 자르고(`MAX_STRIPS_TOTAL`) 배치당 여덟 장씩 보내므로, 한 페이지를 전사하면
   * 호출이 **다섯 번까지** 간다. 한 시간에 열 번 전사하는 것을 정상으로 보면
   * 50 이고, 거기에 여유를 얹었다.
   *
   * 칸을 `pdp_analyze` 와 나눈 이유도 이것이다 — 전사 한 번이 시간당 열 번짜리
   * 칸의 절반을 먹으면 그날 기획을 못 한다.
   */
  redesign_transcribe: { env: "TRANSCRIBE_HOURLY_LIMIT", fallback: 60 },
} as const satisfies Partial<Record<GenerationOperation, { env: string; fallback: number }>>;

type LimitedOperation = keyof typeof HOURLY_LIMITS;

/**
 * 이 작업의 시간당 한도.
 *
 * 한도를 두지 않는 작업에도 숫자를 하나 준다 — SQL 의 `p_analysis_limit` 은
 * 그 갈래에서 쓰이지 않지만, 인자를 비워 두면 기본값 10 이 조용히 들어간다.
 * 그 수가 어디서 왔는지 모르게 되는 것보다 여기서 정해 주는 쪽이 낫다.
 */
export function hourlyLimitFor(
  operation: GenerationOperation,
  env: Record<string, string | undefined> = process.env,
): number {
  const rule = (HOURLY_LIMITS as Record<string, { env: string; fallback: number } | undefined>)[
    operation as LimitedOperation
  ];
  if (!rule) return HOURLY_LIMITS.pdp_analyze.fallback;

  const configured = Number(env[rule.env] ?? "");
  // 빈 글자는 `Number("")` 가 0 이라 그냥 쓰면 한도가 1 로 주저앉는다.
  if (!env[rule.env] || !Number.isFinite(configured)) return rule.fallback;
  return Math.min(MAX, Math.max(MIN, Math.floor(configured)));
}
