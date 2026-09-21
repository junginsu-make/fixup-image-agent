"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@fixup/ui";
import type { EasyMessage } from "../turn";

/**
 * 대화 한 줄 (설계 §4).
 *
 * ── 채팅처럼 보이게 ──────────────────────────────────────────
 *
 * 처음에는 시스템 말이 **가운데 옅은 글**이었고 그림은 맨몸으로 왼쪽에 떴다.
 * 그래서 「채팅 같지 않다」는 말을 들었다(2026-09-18 사용자).
 *
 * 채팅으로 읽히려면 **주고받는 두 쪽이 보여야** 한다.
 *
 *   내 말    오른쪽, 색 있는 말풍선
 *   AI 말    왼쪽, 표식이 붙은 말풍선 — 그림도 그 말풍선 안에 담긴다
 *
 * 그림을 말풍선 안에 담는 것이 핵심이다. 맨몸으로 두면 「대화에 끼어든 그림」이
 * 아니라 「대화가 끊기고 나온 결과물」로 보인다.
 */

/** AI 쪽 표식. 말풍선 왼쪽에 붙어 누가 한 말인지 알린다. */
function AssistantMark() {
  return (
    <span
      aria-hidden
      className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft text-primary"
    >
      <Sparkles className="size-3.5" />
    </span>
  );
}

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
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-sm leading-6">
          {message.body}
        </p>
      </div>
    );
  }

  /*
    **AI 쪽 말풍선.** 인사(`system`)와 도우미가 한 답(`assistant`)이 같은
    모양으로 온다 — 읽는 사람에게는 둘 다 「저쪽이 한 말」이다.

    가운데 옅은 글로 두면 「누가 한 말인지 모르는 안내문」이 된다. 인사도
    대화의 한 줄이므로 같은 자리에서 같은 모양으로 온다.
  */
  if (message.role === "system" || message.role === "assistant") {
    return (
      <div className="flex items-start gap-2">
        <AssistantMark />
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-sm leading-6">
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
    <div className="flex items-start gap-2">
      <AssistantMark />
      {imageUrl ? (
        <button
          type="button"
          onClick={onOpenImage}
          className="max-w-[85%] overflow-hidden rounded-2xl rounded-bl-md border border-border transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="만든 이미지" className="block max-h-[55vh] w-auto" />
        </button>
      ) : (
        <div
          className={cn(
            "grid h-56 w-56 place-items-center rounded-2xl rounded-bl-md border border-border bg-muted",
            "animate-pulse text-meta text-subtle-foreground",
          )}
        >
          만들고 있습니다
        </div>
      )}
    </div>
  );
}
