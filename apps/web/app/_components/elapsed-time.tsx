"use client";

import * as React from "react";

export function ElapsedTime({
  startedAt,
  endedAt,
  prefix = "경과",
}: {
  startedAt: number;
  endedAt?: number;
  prefix?: string;
}) {
  const [now, setNow] = React.useState(() => endedAt ?? Date.now());

  React.useEffect(() => {
    if (endedAt) {
      setNow(endedAt);
      return;
    }
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [endedAt, startedAt]);

  return <span className="tabular-nums">{prefix} {formatElapsed(Math.max(0, now - startedAt))}</span>;
}

function formatElapsed(milliseconds: number) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}분 ${String(seconds).padStart(2, "0")}초` : `${seconds}초`;
}
