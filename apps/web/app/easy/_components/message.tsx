"use client";

import * as React from "react";
import { cn } from "@fixup/ui";
import type { EasyMessage } from "../turn";

/**
 * 대화 한 줄 — 내 말 · 시스템 · 그림 (설계 §4).
 *
 * **셋이 다르게 보여야 한다.** 내 말은 오른쪽에 붙은 말풍선, 시스템은 가운데
 * 옅은 글, 그림은 눌러서 크게 볼 수 있는 판이다.
 */

export function EasyMessageRow({
  message,
  imageUrl,
  onOpenImage,
}: {
  message: EasyMessage;
  /** 그림 줄이면 미리보기 주소. 아직 안 왔으면 비어 있다. */
  imageUrl?: string;
  onOpenImage?: () => void;
}) {
  if (message.role === "system") {
    return (
      <p className="mx-auto max-w-prose text-center text-sm text-subtle-foreground">
        {message.body}
      </p>
    );
  }

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary-soft px-4 py-2.5 text-sm">
          {message.body}
        </p>
      </div>
    );
  }

  /*
    **그림.** 아직 안 왔으면 자리를 잡아 둔다 — 자리가 없으면 도착하는 순간
    대화가 아래로 튀어 사용자가 읽던 자리를 잃는다.
  */
  return (
    <div className="flex justify-start">
      {imageUrl ? (
        <button
          type="button"
          onClick={onOpenImage}
          className="overflow-hidden rounded-xl border border-border transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="만든 그림" className="block max-h-[60vh] w-auto" />
        </button>
      ) : (
        <div
          className={cn(
            "grid h-64 w-64 place-items-center rounded-xl border border-border bg-muted",
            "animate-pulse text-meta text-subtle-foreground",
          )}
        >
          만들고 있습니다
        </div>
      )}
    </div>
  );
}
