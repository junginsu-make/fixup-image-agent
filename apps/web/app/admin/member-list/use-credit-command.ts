"use client";
import { invalidateAccount } from "../../../lib/membership/account-events";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { changeCredits, type CreditCommand } from "../members/actions";
import { randomId } from "../../../lib/browser-safe";

type Draft<T> = T extends { action: string } ? Omit<T, "action"> & { action?: string } : T;
export type CreditCommandDraft = Draft<CreditCommand>;

/**
 * 크레딧·플랜 변경 한 벌. **바로 보내지 않고 한 번 보여 준 뒤 보낸다** — 돈이
 * 오가는 일이라 숫자를 잘못 친 것을 반영 전에 잡는다.
 *
 * 실패하면 같은 명령을 그대로 다시 보낼 수 있게 들고 있는다. 명령마다 action id 가
 * 박혀 있어서 재시도해도 두 번 지급되지 않는다.
 */
export function useCreditCommand(onDone?: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [review, setReview] = useState<CreditCommand | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [retry, setRetry] = useState<CreditCommand | null>(null);

  const submit = (command: CreditCommandDraft) => {
    if (inFlight.current) return;
    setNotice(null); setRetry(null); setReview(null);
    try {
      // HTTP에서도 안전한 UUID를 만들고, 확인·재시도 동안 같은 값을 유지한다.
      const needsAction = ["grant", "activate", "resolve", "subscription", "status"].includes(command.kind);
      setReview((needsAction ? { ...command, action: ("action" in command && command.action) || randomId() } : command) as CreditCommand);
    } catch (error) {
      setNotice({ ok: false, text: error instanceof Error ? error.message : "요청을 준비하지 못했습니다. 다시 시도해 주세요." });
    }
  };
  const cancel = () => {
    if (inFlight.current) return;
    setReview(null); setRetry(null); setNotice(null);
  };
  const execute = async (command: CreditCommand) => {
    // React 18의 transition은 비동기 요청이 끝날 때까지 pending을 유지하지 않는다.
    if (inFlight.current) return;
    inFlight.current = true; setPending(true); setNotice(null);
    try {
      let result: { ok: boolean; message: string };
      try {
        result = await changeCredits(command);
      } catch {
        result = { ok: false, message: "처리 결과를 확인하지 못했습니다. 연결 상태를 확인하고 같은 요청으로 재시도해 주세요. 이미 반영된 요청은 중복 지급되지 않습니다." };
      }
      setNotice({ ok: result.ok, text: result.message });
      setReview(null);
      setRetry(result.ok ? null : command);
      if (result.ok) { invalidateAccount(); router.refresh(); onDone?.(); }
    } finally {
      inFlight.current = false; setPending(false);
    }
  };

  return { pending, review, notice, retry, submit, cancel, execute };
}

export type CreditCommandState = ReturnType<typeof useCreditCommand>;
