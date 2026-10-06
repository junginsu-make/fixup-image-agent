"use client";

import { Button, buttonVariants } from "@fixup/ui";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE, consentFrom, readCookie } from "../../lib/analytics/consent";

/**
 * **방문 통계 쿠키 동의 띠**(계획 2026-10-06 site-analytics, 섞어 쓰기).
 *
 * 정한 적이 없으면 뜬다. 「동의」와 「거부」는 **같은 모양**이다 — 한쪽만 눈에 띄게 하지 않는다.
 * 거부해도 모든 기능을 쓸 수 있다. 「방문 통계 설정」(첫 화면 아래·「계정」 화면)으로 다시 연다.
 * 저장에 실패하면 닫지 않는다 — 거부가 저장되지 않았는데 닫히면 거부한 줄 안다.
 */
export const OPEN_CONSENT_EVENT = "fx:open-consent";

export function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (consentFrom(readCookie(document.cookie, CONSENT_COOKIE)) === "unset") setOpen(true);
    const reopen = () => {
      setFailed(false);
      setOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  async function choose(consent: boolean) {
    setBusy(true);
    try {
      const response = await fetch("/api/track/consent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent }),
      });
      if (!response.ok) throw new Error(String(response.status));
      setFailed(false);
      setOpen(false);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-label="방문 통계 쿠키"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:right-4 sm:max-w-sm sm:rounded-lg sm:border"
    >
      <p className="text-sm font-medium">방문 통계 쿠키</p>
      <p className="mt-1 text-sm text-muted-foreground">
        서비스를 고치는 데 쓰려고, 이 브라우저가 다시 방문했는지 알아보는 쿠키(fx_vid)를 저장해도 될까요?
        거부해도 모든 기능을 그대로 쓸 수 있습니다. 자세한 내용은 개인정보 처리방침 제11조에 있습니다.
      </p>
      {failed ? <p className="mt-2 text-sm text-destructive">저장하지 못했습니다. 잠시 뒤 다시 눌러 주세요.</p> : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void choose(false)}>거부</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void choose(true)}>동의</Button>
      </div>
    </div>
  );
}

/**
 * 동의 띠를 다시 연다. `outlined` 는 「계정」 화면용 단추 모양 — 서버 컴포넌트가 단추 모양 함수를
 * 직접 부르지 않게 여기서 고른다. 기본은 둘러싼 자리(첫 화면 아래 법률 링크)의 모양을 따른다.
 */
export function ConsentSettingsButton({ outlined = false }: { outlined?: boolean }) {
  return (
    <button
      type="button"
      className={outlined ? buttonVariants({ variant: "outline" }) : undefined}
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
    >
      방문 통계 설정
    </button>
  );
}
