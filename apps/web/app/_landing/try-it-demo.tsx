"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEMO_STEP_MS, REFERENCE_THUMBS, type Preset } from "./landing-content";

/** 결과·썸네일 원본 크기. next/image 가 비율을 잡는 데만 쓴다. */
const RESULT_SIZE: Record<string, { w: number; h: number }> = {
  "/landing/result-cardnews-lease.png": { w: 1080, h: 1080 },
  "/landing/result-poster-sports.png": { w: 1024, h: 1536 },
  "/landing/result-winter-trend.png": { w: 1232, h: 2192 },
};
const THUMB_SIZE = [
  { w: 956, h: 955 },
  { w: 683, h: 1210 },
  { w: 684, h: 1217 },
];

const LAST_STEP = 4;

export function TryItDemo({
  presets,
  logs,
  refLabel,
  promptLabel,
  resultLabel,
  qaLine,
  disclaimer,
  runIdle,
  runRunning,
  runDone,
}: {
  presets: readonly Preset[];
  logs: readonly string[];
  refLabel: string;
  promptLabel: string;
  resultLabel: string;
  qaLine: string;
  disclaimer: string;
  runIdle: string;
  runRunning: string;
  runDone: string;
}) {
  const [preset, setPreset] = useState(0);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const choose = (index: number) => {
    stop();
    setPreset(index);
    setStep(-1);
    setRunning(false);
    setDone(false);
  };

  const run = () => {
    if (running) return;
    stop();
    setRunning(true);
    setDone(false);
    setStep(0);
    let current = 0;
    const advance = () => {
      current += 1;
      if (current > LAST_STEP) {
        setRunning(false);
        setDone(true);
        return;
      }
      setStep(current);
      timer.current = window.setTimeout(advance, DEMO_STEP_MS);
    };
    timer.current = window.setTimeout(advance, DEMO_STEP_MS);
  };

  const active = presets[preset];
  const size = RESULT_SIZE[active.src] ?? { w: 1080, h: 1080 };
  // 겹친 이미지를 opacity 로 바꾸지 않는다 — 활성 이미지 하나만 그린다.
  const revealed = done || step >= LAST_STEP;

  return (
    <div className="mcs-demo">
      <div className="mcs-demo-tabs" role="tablist">
        {presets.map((item, index) => (
          <button
            key={item.title}
            type="button"
            role="tab"
            aria-selected={index === preset}
            className="mcs-tab"
            onClick={() => choose(index)}
          >
            <b>{item.kind}</b>
            <span>{item.title}</span>
          </button>
        ))}
      </div>

      <div className="mcs-demo-body">
        <div className="mcs-demo-left">
          <span className="mcs-demo-label">{refLabel}</span>
          <div className="mcs-ref">
            <span className="mcs-ref-thumb">
              <Image
                src={REFERENCE_THUMBS[preset]}
                alt={`${active.title} ${refLabel}`}
                width={THUMB_SIZE[preset].w}
                height={THUMB_SIZE[preset].h}
                sizes="92px"
              />
            </span>
            <div>
              <span className="mcs-role">{active.role}</span>
              <p>{active.refNote}</p>
            </div>
          </div>

          <span className="mcs-demo-label mcs-demo-label--spaced">{promptLabel}</span>
          <p className="mcs-demo-prompt">{active.prompt}</p>

          <div className="mcs-chips">
            {active.chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>

          <button type="button" className="mcs-run" data-running={running} onClick={run}>
            {running ? runRunning : done ? runDone : runIdle}
          </button>

          <ol className="mcs-log">
            {logs.map((line, index) => {
              const state = done || step > index ? "done" : step === index ? "on" : "idle";
              return (
                <li key={line} data-state={state}>
                  <i aria-hidden="true">{state === "done" ? "✓" : "•"}</i>
                  {line}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mcs-demo-right">
          <div className="mcs-result-head">
            <span className="mcs-demo-label">{resultLabel}</span>
            <em>{active.model}</em>
          </div>

          <div className="mcs-result">
            {revealed ? (
              <Image
                src={active.src}
                alt={active.title}
                width={size.w}
                height={size.h}
                sizes="(min-width: 900px) 46vw, 92vw"
              />
            ) : (
              <div className="mcs-placeholder">
                {running ? <span className="mcs-spinner" /> : null}
                {running ? runRunning : runIdle}
              </div>
            )}
          </div>

          <div className="mcs-demo-qa" style={{ opacity: done ? 1 : 0 }} aria-hidden={!done}>
            <i className="mcs-dot mcs-dot--ok" />
            {qaLine}
          </div>

          <p className="mcs-disclaimer">{disclaimer}</p>
        </div>
      </div>
    </div>
  );
}
