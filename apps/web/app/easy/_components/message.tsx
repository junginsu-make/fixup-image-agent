"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@fixup/ui";
import { ElapsedTime } from "../../_components/elapsed-time";
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

/**
 * **점 셋이 차례로 뛴다** (2026-09-21 사용자 — 「모션을 줘서 실제 로딩되는
 * 표시로 해줘」).
 *
 * 전에는 `animate-pulse` 로 글자만 옅어졌다 진해졌다 했다. **멈춘 것과 구분이
 * 안 됐다** — 천천히 바뀌는 데다 글자 자체는 그대로라, 화면이 멎은 것인지
 * 기다리는 것인지 알 수 없었다.
 *
 * 늦추는 몫을 여기서 준다. 셋이 같이 뛰면 그냥 깜빡이는 것이고, **차례로**
 * 뛰어야 흐르는 것으로 읽힌다. 움직임을 줄여 달라는 설정이면 CSS 가 멈춘다.
 */
export function EasyTypingDots() {
  return (
    <span aria-hidden className="flex items-center gap-1 py-1">
      {[0, 160, 320].map((늦출몫) => (
        <span
          key={늦출몫}
          style={{ animationDelay: `${늦출몫}ms` }}
          className="fixup-typing-dot block size-1.5 rounded-full bg-subtle-foreground"
        />
      ))}
    </span>
  );
}

/**
 * **답을 기다리는 줄.**
 *
 * 말일지 이미지일지 가르는 동안은 화면에 아무 일도 안 일어난다. 그 사이가
 * 비어 있으면 보낸 것이 먹혔는지 알 수 없다 — 이미지 자리는 가른 **뒤에**
 * 생긴다.
 */
export function EasyThinkingRow() {
  return (
    <div className="flex items-start gap-2" role="status" aria-live="polite">
      <AssistantMark />
      <span className="rounded-2xl rounded-bl-md bg-muted px-4 py-2.5">
        <span className="sr-only">답을 기다리는 중입니다</span>
        <EasyTypingDots />
      </span>
    </div>
  );
}

/**
 * **이미지를 만드는 중.**
 *
 * 2026-09-21 사용자 — 「이미지 생성 중에도 생성 중이라는 표시를 정확히 알 수
 * 있게 해야해」. 전에는 회색 판이 옅어졌다 진해졌다 할 뿐이라, 무엇을 하는
 * 중인지도 얼마나 걸릴지도 알 수 없었다.
 *
 * 셋을 함께 낸다.
 *
 *   도는 표시  지금 돌고 있다
 *   흐르는 막대 멀리서도 보인다 — 포스터 화면이 쓰는 그 막대다
 *   지난 시간   **살아 있다는 증거.** 이미지는 30초에서 1분이 걸린다
 *
 * **진행률이 아니다.** fal 은 얼마나 갔는지 알려 주지 않는다. 채웠다 비우는
 * 막대를 그리면 거짓말이 된다(`globals.css` 의 같은 주석).
 */
export function EasyImageWorking({ className }: {
  /**
   * 자리에 맞춘 너비.
   *
   * 대화 속에서는 말풍선만 한 판이라 좁고(`w-64`), 결과 칸에서는 그 칸을 다
   * 쓴다. **같은 판을 두 자리에 쓰되 너비만 자리가 정한다** — 판을 둘로 만들면
   * 한쪽만 고쳐질 날이 온다.
   */
  className?: string;
} = {}) {
  /* 이 줄이 생긴 때가 곧 시작한 때다. 줄은 id 로 묶여 있어 다시 안 만들어진다. */
  const 시작 = React.useRef(Date.now());

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "grid gap-3 rounded-2xl rounded-bl-md border border-border bg-muted px-4 py-4",
        className ?? "w-64",
      )}
    >
      <span className="flex items-center gap-2 text-base text-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden />
        이미지를 만들고 있습니다
      </span>

      <span aria-hidden className="fixup-working-track block h-1 rounded-full bg-primary/15">
        <span className="fixup-working-bar block h-full w-1/3 rounded-full bg-primary/70" />
      </span>

      <span className="text-meta text-subtle-foreground">
        <ElapsedTime startedAt={시작.current} /> · 보통 30초에서 1분이 걸립니다
      </span>
    </div>
  );
}

/**
 * AI 쪽 표식. 말풍선 왼쪽에 붙어 누가 한 말인지 알린다.
 *
 * **로봇 캐릭터가 답하는 것처럼**(2026-09-22 사용자 요청). 반짝이 아이콘 대신 캐릭터의
 * 얼굴과 흔드는 손까지만 둥글게 잘라 쓴다 — 온몸이 다 보일 필요는 없다. 원본은
 * `frontend/캐릭터/`, 128px webp 로 줄였다(`public/easy/assistant.webp`).
 *
 * 장식이다. 낭독기가 말풍선마다 「로봇」을 읽으면 대화가 안 들린다.
 */
function AssistantMark() {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 128px 고정 장식. 최적화 서버를 거칠 까닭이 없다.
    <img
      src="/easy/assistant.webp"
      alt=""
      aria-hidden
      width={36}
      height={36}
      className="mt-0.5 size-9 shrink-0 rounded-full border border-border bg-white object-cover"
    />
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
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-primary-soft px-4 py-2.5 text-base leading-7">
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
        <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-muted px-4 py-2.5 text-base leading-7">
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
        /*
          **대화 속 이미지는 작다**(2026-09-21 사용자 — 「채팅 기록이 오히려
          안보입니다… 채팅창에 생성된 결과 이미지 크기를 줄이세요」).

          전에는 화면 높이의 절반(`max-h-[55vh]`)까지 차지해서, 한 장만 나와도
          **오간 말이 위아래로 밀려 안 보였다.** 대화는 말을 읽는 곳이고 크게
          보는 자리는 따로 있다 — 오른쪽 결과 칸과 크게 보기 창이다.

          크기를 **「만들고 있습니다」 판과 같게** 맞춘다(16rem). 만들던 자리에
          그대로 결과가 앉는 것처럼 보여서 줄이 튀지 않는다.
        */
        <button
          type="button"
          onClick={onOpenImage}
          className="max-w-64 overflow-hidden rounded-2xl rounded-bl-md border border-border transition-opacity hover:opacity-90"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="만든 이미지" className="block max-h-64 w-auto" />
        </button>
      ) : (
        <EasyImageWorking />
      )}
    </div>
  );
}
