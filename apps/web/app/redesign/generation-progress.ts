/**
 * **리디자인이 기다리는 동안 무엇을 말하는가.**
 *
 * ── 왜 고쳤나 ──────────────────────────────────────────────
 *
 * 전에는 **경과 시간만 보고 퍼센트를 지어냈다.**
 *
 * ```
 * const percent = Math.min(96, Math.max(4, (elapsed / 예상) * 100));
 * ```
 *
 * 그 값으로 막대를 채우고, 남은 시간을 말하고, **단계 이름까지 골랐다.**
 * 실제로 무슨 일이 일어나는지와 아무 상관이 없었다. 늦어지면 96% 에 붙어
 * 「예상 5초 남음」을 영원히 되풀이했다.
 *
 * 상세페이지 쪽은 같은 자리에 **정반대 결정**을 적어 뒀다 — 「진행률을 알 수
 * 없는 작업이라 무한 왕복 막대를 쓴다(가짜 퍼센트 대신)」. 한 서비스 안에서
 * 두 도구가 갈려 있었다.
 *
 * ── 규칙 ───────────────────────────────────────────────────
 *
 * **아는 것만 센다.** 전사는 배치 수를 실제로 안다 — 그때만 진짜 퍼센트를
 * 쓴다. 나머지는 왕복 막대와 경과 시간이다.
 */

/** 리디자인이 지나는 구간. 화면이 넘길 때마다 바꿔 준다. */
export type RedesignPhase = "convert" | "transcribe" | "generate";

export interface RedesignProgressInput {
  phase: RedesignPhase;
  /** 전사에서 끝난 배치 수. 아는 구간에서만 온다. */
  done?: number;
  /** 전사 배치 전체 수. */
  total?: number;
  elapsedSeconds: number;
  /** 이만큼 걸릴 것 같다는 짐작. 없으면 시간 이야기를 안 한다. */
  estimateSeconds?: number;
}

export interface RedesignProgressView {
  /** 퍼센트를 말할 수 있는가. 없으면 왕복 막대를 쓴다. */
  kind: "determinate" | "indeterminate";
  percent?: number;
  /** 지금 하는 일. */
  label: string;
  /** 시간에 대해 할 수 있는 말. 할 말이 없으면 빈 문자열이다. */
  note: string;
}

const PHASE_LABEL: Record<RedesignPhase, string> = {
  convert: "원본을 PNG 로 바꾸는 중입니다.",
  transcribe: "원본 상세페이지를 전사하는 중입니다.",
  generate: "원본 분석과 이미지 생성 중입니다.",
};

function 시간말(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  if (minutes <= 0) return `${rest}초`;
  return `${minutes}분 ${rest}초`;
}

/**
 * **예상을 넘기면 남은 시간을 말하지 않는다.**
 *
 * 넘긴 뒤의 「몇 초 남음」은 근거가 없다. 그때 할 수 있는 정직한 말은
 * 「예상보다 오래 걸리고 있다」뿐이다.
 */
function 시간메모(elapsedSeconds: number, estimateSeconds?: number) {
  if (!estimateSeconds || estimateSeconds <= 0) return "";

  const 남은것 = estimateSeconds - elapsedSeconds;
  if (남은것 <= 0) return "예상보다 오래 걸리고 있습니다. 그대로 두시면 계속 진행됩니다.";
  return `예상 ${시간말(남은것)} 남음`;
}

export function describeRedesignProgress(input: RedesignProgressInput): RedesignProgressView {
  const note = 시간메모(input.elapsedSeconds, input.estimateSeconds);

  /*
    **배치 수를 알 때만 센다.** 전사 중이라도 아직 총 배치 수를 못 받았으면
    모르는 것이다 — 그때 0% 를 띄우면 멈춘 것처럼 보이고, 아무 값이나 띄우면
    거짓말이다.
  */
  if (input.phase === "transcribe" && typeof input.total === "number" && input.total > 0) {
    const done = Math.min(Math.max(input.done ?? 0, 0), input.total);
    return {
      kind: "determinate",
      percent: Math.round((done / input.total) * 100),
      label: `${PHASE_LABEL.transcribe} (${done}/${input.total} 구간)`,
      note,
    };
  }

  return { kind: "indeterminate", label: PHASE_LABEL[input.phase], note };
}
