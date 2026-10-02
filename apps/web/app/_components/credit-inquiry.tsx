"use client";
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@fixup/ui";
import { CS_EMAIL } from "../../lib/cs/contact";

type Kind = "크레딧 구매" | "월 구독";
export function CreditInquiry() {
  const pathname = usePathname();
  const [kind, setKind] = useState<Kind | null>(null);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const lock = useRef(false);
  function open(next: Kind) {
    setKind(next); setQuestion(next === "크레딧 구매" ? "크레딧을 추가로 구매하고 싶습니다. 구매 방법을 안내해 주세요." : "월 구독 플랜과 신청 방법을 안내해 주세요.");
    setMessage(""); setSent(false);
  }
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => open("크레딧 구매")}>크레딧 구매 문의</Button>
      <Button type="button" variant="outline" disabled={pending} onClick={() => open("월 구독")}>월 구독 문의</Button>
    </div>
    {kind && <form className="space-y-3 rounded-lg border bg-background p-4" aria-label={kind + " 문의"} onSubmit={async event => {
      event.preventDefault(); if (lock.current || sent || !question.trim()) return;
      lock.current = true; setPending(true); setMessage("");
      try {
        const response = await fetch("/api/cs/inquiry", { method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ question: `[${kind} 문의] ${question.trim()}`, page: pathname }) });
        const result = await response.json();
        if (!response.ok || !result.ok || (!result.saved && !result.duplicate)) throw new Error(result.message || "문의 접수를 확인하지 못했습니다.");
        setSent(true); setMessage(result.message || "문의를 접수했습니다. 담당자가 확인 후 안내합니다.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "문의를 보내지 못했습니다. 다시 시도해 주세요."); }
      finally { lock.current = false; setPending(false); }
    }}>
      <label className="block text-sm font-medium">{kind} 문의 내용
        <textarea className="mt-2 min-h-28 w-full rounded-md border bg-background p-3" value={question} onChange={event => setQuestion(event.target.value)} maxLength={1900} disabled={pending || sent} required />
      </label>
      <p className="text-sm text-muted-foreground">담당자가 확인 후 구매·구독 및 지급 방법을 안내합니다. 문의만으로 결제나 크레딧 지급이 이루어지지 않습니다.</p>
      <div className="flex gap-2"><Button type="submit" disabled={pending || sent || !question.trim()}>{pending ? "보내는 중…" : sent ? "접수 완료" : "문의 보내기"}</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setKind(null)}>닫기</Button></div>
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>}
    <p className="text-xs text-muted-foreground">메일 문의: <a className="underline" href={`mailto:${CS_EMAIL}`}>{CS_EMAIL}</a></p>
  </div>;
}
