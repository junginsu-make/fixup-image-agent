"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changeCredits, type CreditCommand } from "../members/actions";

/**
 * 크레딧·플랜 변경 한 벌. **바로 보내지 않고 한 번 보여 준 뒤 보낸다** — 돈이
 * 오가는 일이라 숫자를 잘못 친 것을 반영 전에 잡는다.
 *
 * 실패하면 같은 명령을 그대로 다시 보낼 수 있게 들고 있는다. 명령마다 action id 가
 * 박혀 있어서 재시도해도 두 번 지급되지 않는다.
 */
export function useCreditCommand(onDone?: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [review, setReview] = useState<CreditCommand | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [retry, setRetry] = useState<CreditCommand | null>(null);

  const submit = (command: CreditCommand) => { setReview(command); setNotice(null); };
  const cancel = () => setReview(null);
  const execute = (command: CreditCommand) => start(async () => {
    const result = await changeCredits(command);
    setNotice({ ok: result.ok, text: result.message });
    setReview(null);
    setRetry(result.ok ? null : command);
    if (result.ok) { router.refresh(); onDone?.(); }
  });

  return { pending, review, notice, retry, submit, cancel, execute };
}

export type CreditCommandState = ReturnType<typeof useCreditCommand>;
