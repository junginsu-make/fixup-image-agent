"use client";

import { Button } from "@fixup/ui";
import { readAsk } from "../row-marks";
import type { EasyMessage } from "../turn";
import {
  askNumbers, cardReply, kindReply, photoReply, ratioReply, referenceReply, targetReply, type EasyButtonReply,
} from "../ask-answers";
import { photoAskReady } from "../photo-ask-state";
import type { EasyAsks } from "../use-easy-asks";
import { EasyAskChoice } from "./ask-choice";
import { EasyKindAsk } from "./kind-ask";
import { EasyPhotoAsk } from "./photo-ask";
import { EasyReferenceAsk } from "./reference-ask";
import type { EasyLibrary } from "./library-attach";

type Attachment = { id: string; url: string; title: string };

/**
 * **물음 줄 밑의 단추 · 고르기**(2026-10-07 2차 설계 D1).
 *
 * 화면은 이것을 **지금 답할 수 있는 물음 줄(`answerableAskId`)이고 보내는 중이 아닐 때만** 넘긴다 — 지난
 * 물음의 단추로 지금 맥락과 다른 지시에 값이 나가지 않게(서버도 `answersRowId` 로 다시 막는다, Review
 * Focus 1). 단추 답이 실패한 짝 바로 앞의 물음 줄에는 다시 단다(2차 최종 리뷰 2). 다시 연
 * 대화에서 갈래 · 모양 물음은 단추가 그대로 나오고, 사진 · 레퍼런스 물음은 그 자리에서 고르던 것이
 * 화면에만 있어 글만 보인다 — 말로 이어 답하면 된다.
 */
export function EasyAskControls({ message, asks, attachments, library, onAttach, onAnswer }: {
  message: EasyMessage;
  asks: EasyAsks;
  attachments: readonly Attachment[];
  library: EasyLibrary;
  onAttach: (picked: Attachment[]) => void;
  onAnswer: (reply: EasyButtonReply) => void;
}) {
  const ask = readAsk(message);
  if (!ask) return null;
  if (ask.kind === "kind") return <EasyKindAsk onPick={(kind) => onAnswer(kindReply(message.id, kind))} />;
  if (ask.kind === "ratio") {
    return (
      <EasyAskChoice
        ratio={asks.ratio}
        look={asks.look}
        onRatio={asks.setRatio}
        onLook={asks.setLook}
        onSubmit={() => onAnswer(ratioReply(message.id, { ratio: asks.ratio, look: asks.look }))}
      />
    );
  }
  if (ask.kind === "photo" && asks.photo?.rowId === message.id) {
    const state = asks.photo.state;
    return (
      <EasyPhotoAsk
        mode={state.mode}
        rows={state.rows.map((row) => {
          const 붙인것 = attachments.find((one) => one.id === row.id);
          return { ...row, url: 붙인것?.url, title: 붙인것?.title };
        })}
        picked={state.picked}
        ready={photoAskReady(state)}
        onPick={asks.pickPhoto}
        onSubmit={() => onAnswer(photoReply(message.id, state))}
      />
    );
  }
  if (ask.kind === "reference" && asks.referenceRowId === message.id) {
    return (
      <EasyReferenceAsk
        library={library}
        attachedIds={attachments.map((one) => one.id)}
        onAttach={onAttach}
        onSubmit={(answer) => onAnswer(referenceReply(message.id, answer))}
      />
    );
  }
  if (ask.kind === "target") {
    return (
      <EasyNumberAsk numbers={askNumbers(ask.data.numbers)} label={(n) => `이미지 ${n}`} onPick={(n) => onAnswer(targetReply(message.id, n))} />
    );
  }
  if (ask.kind === "card") {
    const count = typeof ask.data.count === "number" ? Math.min(Math.max(Math.trunc(ask.data.count), 0), 20) : 0;
    return (
      <EasyNumberAsk
        numbers={Array.from({ length: count }, (_, at) => at + 1)}
        label={(n) => `${n}번`}
        onPick={(n) => onAnswer(cardReply(message.id, n))}
      />
    );
  }
  return null;
}

/** 번호 단추(어느 이미지 · 몇 번 장, 2차 D1 · D2). 다시 열어도 그대로 나온다. */
function EasyNumberAsk({ numbers, label, onPick }: {
  numbers: readonly number[];
  label: (n: number) => string;
  onPick: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {numbers.map((n) => (
        <Button key={n} size="sm" variant="secondary" onClick={() => onPick(n)}>{label(n)}</Button>
      ))}
    </div>
  );
}
