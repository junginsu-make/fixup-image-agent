"use client";

import { ChevronLeft, Loader2 } from "lucide-react";
import { cn } from "@fixup/ui";

/**
 * 닫아 둔 패널로 돌아가는 손잡이.
 *
 * 만드는 데 몇 십 초가 걸리는 패널은, 그 사이 다른 곳을 누르면 닫힌다.
 * 그때 **돌아갈 길이 없으면** 끝났는지조차 알 수 없다 — 크레딧을 쓴 결과가
 * 만들어져 있는데 화면에서는 아무 일도 없었던 것처럼 보인다.
 *
 * 페이지 안이 아니라 **화면에 붙인다.** 어디로 굴려도 늘 보여야 한다.
 *
 * 닫아 둔 사이에 끝났으면 두어 번 뛴다(`alert`). 계속 뛰지는 않는다 — 멈추지
 * 않는 움직임은 화면 구석에서 계속 신경을 긁는다. 여섯 번만 뛰고 서고, 그
 * 사이에 못 봤으면 글자가 대신 말한다.
 */
export function PanelHandle({
  label,
  busy = false,
  alert = false,
  onOpen,
}: {
  /** 지금 무엇을 하는 자리인지. 「다 됐습니다 · 열기」처럼 상태까지 말한다. */
  label: string;
  /** 만드는 중인가. 도는 표시를 함께 낸다. */
  busy?: boolean;
  /** 닫아 둔 사이에 끝났는가. 참이면 눈에 띄게 하고 두어 번 뛴다. */
  alert?: boolean;
  onOpen(): void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "fixed right-0 top-1/2 z-40 flex -translate-y-1/2 items-center gap-1.5",
        "rounded-l-lg border border-r-0 py-3 pl-3 pr-2 shadow-[var(--shadow-ring)] transition-colors",
        alert
          ? "fixup-attention border-primary bg-primary text-primary-foreground"
          : "border-border bg-background hover:bg-muted",
      )}
    >
      <ChevronLeft className="size-4" />
      <span className="text-xs font-bold [writing-mode:vertical-rl]">{label}</span>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
    </button>
  );
}
