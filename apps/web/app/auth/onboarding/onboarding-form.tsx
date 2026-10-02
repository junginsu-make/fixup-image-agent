"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Label } from "@fixup/ui";
import { SIGNUP_TERMS_VERSION } from "../../../lib/membership/signup-consent";
import { PROFILE_LIMITS } from "../../../lib/membership/profile-extras";
import { HOME_AFTER_LOGIN } from "../../../lib/routes";
import { completeSocialOnboarding } from "./actions";
import { PhoneField } from "../../_components/phone-field";
import { clearCsChat } from "../../../lib/cs/chat-store";

export function OnboardingForm({ email, name: initialName, referrer: initialReferrer }: { email: string; name: string; referrer: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName), [referrer, setReferrer] = useState(initialReferrer);
  const [phone, setPhone] = useState(""), [phoneConsent, setPhoneConsent] = useState(false);
  const [ageConfirmed, setAge] = useState(false), [termsAgreed, setTerms] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  // React 18 transitions do not stay pending across an awaited server action.
  const begin = () => { if (busy.current) return false; busy.current = true; setPending(true); setMessage(""); return true; };
  const end = () => { busy.current = false; setPending(false); };
  return <form className="space-y-4" onSubmit={async event => {
    event.preventDefault(); if (!begin()) return;
    try {
      const result = await completeSocialOnboarding({ name, referrer, phone, phoneConsent, ageConfirmed, termsAgreed, termsVersion: SIGNUP_TERMS_VERSION });
      if (!result.ok) return setMessage(result.message);
      router.replace(`${HOME_AFTER_LOGIN}?signup=complete`); router.refresh();
    } catch { setMessage("가입 결과를 확인하지 못했습니다. 다시 시도해 주세요."); }
    finally { end(); }
  }}>
    <p className="break-all rounded-md bg-muted p-3 text-sm">인증한 이메일: <strong>{email}</strong></p>
    <div className="space-y-1.5"><Label htmlFor="social-name">이름</Label><Input id="social-name" autoComplete="name" maxLength={PROFILE_LIMITS.name} required value={name} onChange={e => setName(e.target.value)} /></div>
    <div className="space-y-1.5"><Label htmlFor="social-referrer">추천코드 · 선택</Label><Input id="social-referrer" maxLength={PROFILE_LIMITS.referrer} value={referrer} onChange={e => setReferrer(e.target.value)} /></div>
    <PhoneField id="social-phone" phone={phone} onPhone={setPhone} consent={phoneConsent} onConsent={setPhoneConsent} disabled={pending} />
    <fieldset className="space-y-3 rounded-lg border p-4 text-sm">
      <legend className="sr-only">가입 필수 확인</legend>
      <label className="flex items-start gap-2"><input type="checkbox" required className="mt-1" checked={ageConfirmed} onChange={e => setAge(e.target.checked)} /><span>만 14세 이상입니다. (필수)</span></label>
      <label className="flex items-start gap-2"><input type="checkbox" required className="mt-1" checked={termsAgreed} onChange={e => setTerms(e.target.checked)} /><span><a href="/#terms" target="_blank" rel="noopener noreferrer" className="underline">이용약관</a>에 동의합니다. (필수)</span></label>
      <p className="text-xs text-muted-foreground">가입 정보는 <a href="/#privacy" target="_blank" rel="noopener noreferrer" className="underline">개인정보 처리방침</a>에 따라 처리됩니다.</p>
    </fieldset>
    <p className="text-sm text-muted-foreground">가입 시 크레딧은 0입니다. AI 기능은 관리자가 크레딧을 지급한 뒤 이용할 수 있습니다.</p>
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    <Button className="w-full" type="submit" disabled={pending}>{pending ? "가입 완료 중..." : "가입 완료"}</Button>
    <Button type="button" variant="ghost" className="w-full" disabled={pending} onClick={async () => {
      if (!begin()) return;
      try { const response = await fetch("/auth/signout", { method: "POST" }); if (!response.ok) throw new Error(); clearCsChat(); window.location.assign("/login"); }
      catch { setMessage("로그아웃하지 못했습니다. 다시 시도해 주세요."); }
      finally { end(); }
    }}>로그아웃 · 다른 계정으로 진행</Button>
  </form>;
}
