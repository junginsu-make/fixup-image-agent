"use client";

import { Badge } from "@fixup/ui";
import type { LandingPageBlueprint } from "@fixup/pdp-core";

/**
 * **구성안을 쓴 호출이 스스로 매긴 점수**(N-4, 설계 §9.3).
 *
 * ── 왜 따로 떼어 왔나 ──────────────────────────────────────
 *
 * 설계 §9.3: 「`scorecard` 의 **작성자 자기평가**를 독립 심사나 판매 효과
 * 점수로 표시하지 않는다」.
 *
 * 이 표는 심사 결과가 **없을 때만** 뜬다. 심사 호출이 실패한 경우다. 그런데
 * 거기 붙은 **A/B 등급 배지**는 사람이 읽으면 검증된 점수로 읽힌다.
 *
 * 「AI 가 스스로 본 결과입니다」라는 문구는 `ReviewPanel` 안에만 있어서
 * **이 갈래에서는 안 떴다.** 등급만 남았다.
 *
 * `PdpEditor` 안에 두면 이 사실을 값으로 잴 수 없다 — 그 파일은 2,800줄이고
 * 문구 한 줄을 지워도 아무 시험이 안 빨개진다. 그래서 여기로 뗀다.
 */

/**
 * **어느 쪽이든 붙는 한 줄.**
 *
 * 등급이 좋을 때만 겸손하면 겸손이 아니다. `ReviewPanel` 의 같은 자리와 결을
 * 맞춘다.
 */
const SELF_SCORE_NOTE =
  "구성안을 쓴 AI 가 스스로 매긴 점수입니다. 따로 받은 심사가 아닙니다. 실제 판매 효과는 확인하지 않았습니다.";

export function ScorecardPanel({ scorecard }: { scorecard: LandingPageBlueprint["scorecard"] }) {
  if (!scorecard?.length) return null;

  return (
    <div className="mt-3 grid gap-2">
      <p className="text-xs text-muted-foreground">{SELF_SCORE_NOTE}</p>
      {scorecard.map((item) => (
        <article
          key={`${item.category}-${item.score}`}
          className="rounded-md bg-background p-2.5 shadow-[var(--shadow-ring)]"
        >
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">{item.category}</strong>
            {/*
              **등급에 색을 입히지 않는다**(N-4).

              A 를 초록으로 칠하면 「검사를 통과했다」로 읽힌다. 스스로 매긴
              점수에 그런 무게를 주면 안 된다. 색은 심사 결과에만 쓴다.
            */}
            <Badge variant="outline">{item.score}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
        </article>
      ))}
    </div>
  );
}
