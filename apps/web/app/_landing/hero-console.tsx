"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { HERO_TIMING } from "./landing-content";

type Step = { label: string; note: string };

/**
 * 히어로의 생성 콘솔. 타이핑 → 5단계 파이프라인 → 결과 공개를 무한 반복한다.
 *
 * 경과 시간을 누적 카운터가 아니라 벽시계(Date.now)로 잰다. 90ms 마다 +90 을
 * 더하는 방식은 탭이 백그라운드로 가면 브라우저가 타이머를 늦춰서 어긋난다.
 */
export function HeroConsole({
  typed,
  steps,
  consoleTitle,
  consoleModel,
  promptLabel,
  rendering,
  qaPass,
  resultAlt,
}: {
  typed: string;
  steps: readonly Step[];
  consoleTitle: string;
  consoleModel: string;
  promptLabel: string;
  rendering: string;
  qaPass: string;
  resultAlt: string;
}) {
  const [clock, setClock] = useState(0);
  const [reduced, setReduced] = useState(false);
  const startedAt = useRef(0);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    // 움직임을 줄이라고 한 사람에게는 루프를 돌리지 않고 완성 상태로 세워 둔다.
    if (reduced) return;
    startedAt.current = Date.now();
    const id = window.setInterval(
      () => setClock(Date.now() - startedAt.current),
      HERO_TIMING.tickMs,
    );
    return () => window.clearInterval(id);
  }, [reduced]);

  const typeEnd = typed.length * HERO_TIMING.typeMs;
  const total = typeEnd + steps.length * HERO_TIMING.stepMs + HERO_TIMING.holdMs;
  const elapsed = clock % total;
  const typing = !reduced && elapsed < typeEnd;

  const shown = reduced ? typed.length : typing ? Math.floor(elapsed / HERO_TIMING.typeMs) : typed.length;
  const active = reduced
    ? steps.length
    : typing
      ? 0
      : Math.min(steps.length, Math.floor((elapsed - typeEnd) / HERO_TIMING.stepMs) + 1);

  const revealed = active >= HERO_TIMING.revealAtStep;
  const passed = active >= HERO_TIMING.badgeAtStep;

  return (
    <div className="mcs-console">
      <div className="mcs-console-bar">
        <i aria-hidden="true" />
        <i aria-hidden="true" />
        <b>{consoleTitle}</b>
        <em>{consoleModel}</em>
      </div>

      <div className="mcs-console-body">
        <div>
          <span className="mcs-label">{promptLabel}</span>
          <p className="mcs-prompt">
            {typed.slice(0, shown)}
            <span className="mcs-caret" aria-hidden="true" />
          </p>
        </div>

        <ol className="mcs-steps">
          {steps.map((step, index) => {
            const state = active > index + 1 ? "done" : active === index + 1 ? "on" : "idle";
            return (
              <li className="mcs-step" data-state={state} key={step.label}>
                <b>{index + 1}</b>
                <span>{step.label}</span>
                {state === "idle" ? null : <em>{step.note}</em>}
              </li>
            );
          })}
        </ol>

        <div className="mcs-frame">
          {revealed ? (
            <Image
              src="/landing/result-cardnews-lease.png"
              alt={resultAlt}
              width={1080}
              height={1080}
              sizes="(min-width: 980px) 40vw, 92vw"
            />
          ) : null}
          <div className="mcs-placeholder" style={{ opacity: revealed ? 0 : 1 }} aria-hidden={revealed}>
            <span className="mcs-spinner" />
            {rendering}
          </div>
          <span className="mcs-qa-badge" style={{ opacity: passed ? 1 : 0 }} aria-hidden={!passed}>
            <i className="mcs-dot mcs-dot--ok" />
            {qaPass}
          </span>
        </div>
      </div>
    </div>
  );
}
