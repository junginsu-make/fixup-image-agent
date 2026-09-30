"use client";

import type { EasyKind } from "../cardnews-state";
import { EasyKindAsk } from "./kind-ask";
import { EasyReferenceAsk } from "./reference-ask";
import type { EasyLibrary } from "./library-attach";

/**
 * **카드뉴스 갈래의 물음 줄 둘**(2단계 설계 §4 · §5-3). 답하면 처음 말 그대로
 * 다시 보낸다. 화면에만 있고 대화 표에는 안 남는다(비율 물음과 같다).
 */
export function EasyCardnewsAsks({
  kindAsking, referenceAsking, library, attachedIds, disabled, onAttach, onSend,
}: {
  kindAsking: string | null;
  referenceAsking: string | null;
  library: EasyLibrary;
  attachedIds: string[];
  disabled?: boolean;
  onAttach: (picked: Array<{ id: string; url: string; title: string }>) => void;
  onSend: (again: { prompt: string; kind: EasyKind; photoSlots?: Array<{ id: string; role: string }> }) => void;
}) {
  return (
    <>
      {kindAsking ? (
        <EasyKindAsk disabled={disabled} onPick={(kind) => onSend({ prompt: kindAsking, kind })} />
      ) : null}
      {referenceAsking ? (
        <EasyReferenceAsk
          library={library}
          attachedIds={attachedIds}
          onAttach={onAttach}
          disabled={disabled}
          onSubmit={(photoSlots) => onSend({ prompt: referenceAsking, kind: "cardnews", photoSlots })}
        />
      ) : null}
    </>
  );
}
