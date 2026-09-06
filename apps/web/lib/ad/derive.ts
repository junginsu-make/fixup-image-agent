import { AD_MASTERS, type AdMaster, type AdSpec } from "./specs";

/**
 * 규격 하나를 어떤 마스터에서 어떻게 뽑을지 정한다.
 *
 * 설계: `docs/superpowers/plans/2026-09-06-ad-creative-sizes.md` §3.6
 *
 * **판단을 상수로 적어 두지 않고 계산한다.** 초판이 사람 눈대중으로 표를
 * 적었다가 둘을 틀렸다 — 확대가 필요한 배정과, 세로 규격을 가로 마스터에
 * 붙인 배정. 둘 다 「그럴듯해 보이는 표」였고 계산을 돌려서야 드러났다.
 *
 * **`server-only` 를 붙이지 않는다.** 순수 계산이라 시험에서 직접 부른다.
 */

export type DerivePlan =
  | { kind: "resize"; master: string }
  /** `keep` 은 마스터 면적 중 남는 비율. 1 에 가까울수록 덜 버린다. */
  | { kind: "crop"; master: string; keep: number }
  | { kind: "upload"; reason: string }
  | { kind: "unsupported"; reason: string };

/**
 * 크롭이 사실상 없다고 볼 경계.
 *
 * 마스터와 목표의 비율이 정수 반올림 때문에 소수점 아래에서만 어긋나는 경우가
 * 있다 — `ad-191x1`(1.9104)에서 1200×628(1.9108)을 뽑을 때가 그렇다. 세로
 * 1픽셀을 깎는 것을 「구도를 버렸다」고 부르면 §5.2 미리보기의 경고가 의미를
 * 잃는다.
 */
const RESIZE_EPSILON = 0.999;

/** 마스터를 목표 비율로 중앙 크롭했을 때 남는 크기. */
function croppedTo(master: AdMaster, target: { width: number; height: number }) {
  const aspect = target.width / target.height;
  return master.width / master.height > aspect
    ? { width: master.height * aspect, height: master.height }
    : { width: master.width, height: master.width / aspect };
}

/**
 * 쓸 수 있는 마스터인가 — **확대가 필요하지 않은가**만 본다.
 *
 * 설계 §3.6 은 불변식을 둘 적었다. 확대 금지와 「가로 마스터에서 세로 규격을
 * 뽑지 않는다」. **뒤엣것은 여기서 검사하지 않는다 — 검사할 필요가 없다.**
 *
 * 유지율은 `min(a, m) / max(a, m)` 이다(a = 목표 비율, m = 마스터 비율). 즉
 * 비율이 가까울수록 크다. 세로 목표(a < 1)에 대해 가로 마스터(m > 1)의 유지율은
 * 언제나 `a / m < a` 인데, 정사각 마스터만 있어도 유지율이 `a` 다. **가로
 * 마스터가 세로 목표에서 이길 수 없다.** 계산으로 확인했다 — 목표
 * 0.5·0.8·0.95·0.99 에서 가로 최고는 26%·42%·50%·52%, 최적은 89%·100%·95%·99% 다.
 *
 * 그래서 방향 검사를 코드에 두면 **도달할 수 없는 가지**가 된다. 시험이 못
 * 덮는 코드는 헛된 안심을 준다. 대신 **결과가 그 성질을 지키는지**를
 * `ad-derive.test.ts` 가 검사한다 — 고르는 규칙을 나중에 바꾸면 그 시험이 깨진다.
 *
 * **설계 문서가 적은 「마스터 원본 크기와 비교하면 안 된다」는 틀린 말이다.**
 * 크롭한 결과는 마스터 안에 들어가는 가장 큰 직사각형이므로,
 * `마스터 ≥ 목표` 와 `크롭 후 ≥ 목표` 는 **같은 조건**이다(무작위 20만 건으로
 * 확인했고, 다른 경우는 부동소수점 경계 3건뿐이었다). 초판의 실제 잘못은
 * 비교 대상이 아니라 **아무 검사도 안 하고 표를 손으로 적은 것**이었다.
 * 두 변을 다 보는 것도 같은 이유로 한 변만 보는 것과 동치다 — 그래도 의도가
 * 드러나게 둘 다 적는다.
 */
function usable(master: AdMaster, spec: AdSpec): boolean {
  const after = croppedTo(master, spec.target);
  return after.width >= spec.target.width && after.height >= spec.target.height;
}

export function planDerivation(spec: AdSpec): DerivePlan {
  // **투명 배경을 가장 먼저 본다.** 크롭으로 새어 나가면 투명 없이 만들어져
  // 등록 자체가 거부되는데, 규격 검증(§5.1)은 픽셀만 보므로 통과시킨다.
  if (spec.format === "png-alpha") {
    return { kind: "unsupported", reason: "투명 배경은 조립 엔진이 필요합니다(설계 §3.4)." };
  }
  if (spec.supply === "upload") {
    return { kind: "upload", reason: "브랜드 로고는 모델이 지어내면 안 됩니다. 올려 주세요." };
  }

  let best: { master: AdMaster; keep: number } | null = null;
  for (const master of AD_MASTERS) {
    if (!usable(master, spec)) continue;
    const after = croppedTo(master, spec.target);
    const keep = (after.width * after.height) / (master.width * master.height);
    if (!best || keep > best.keep) best = { master, keep };
  }

  if (!best) {
    return { kind: "unsupported", reason: "확대 없이 이 규격을 덮는 마스터가 없습니다." };
  }
  return best.keep >= RESIZE_EPSILON
    ? { kind: "resize", master: best.master.id }
    : { kind: "crop", master: best.master.id, keep: best.keep };
}
