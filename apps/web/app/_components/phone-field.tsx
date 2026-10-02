"use client";

import { Input, Label } from "@fixup/ui";
import { normalizePhone, PHONE_CONSENT, PHONE_MAX_INPUT } from "../../lib/membership/phone";

/**
 * 휴대폰 또는 전화번호 — **선택 항목**(2026-10-02 사용자 결정). 가입·간편가입 확인·계정
 * 화면이 같은 칸을 쓴다.
 *
 * 번호를 적은 사람에게만 선택 동의를 묻는다. 이미 동의하고 저장한 번호 그대로면 다시 묻지
 * 않는다(`savedPhone`). 동의 문구는 처리방침의 「연락처(선택)」 줄과 같은 내용이다.
 */
export function PhoneField({ id, phone, onPhone, consent, onConsent, savedPhone = null, disabled = false }: {
  id: string;
  phone: string;
  onPhone: (value: string) => void;
  consent: boolean;
  onConsent: (value: boolean) => void;
  savedPhone?: string | null;
  disabled?: boolean;
}) {
  const asksConsent = Boolean(phone.trim()) && (normalizePhone(phone) ?? phone.trim()) !== savedPhone;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>휴대폰 또는 전화번호 <span className="font-normal text-muted-foreground">· 선택</span></Label>
      <Input id={id} type="tel" inputMode="tel" autoComplete="tel" maxLength={PHONE_MAX_INPUT} placeholder="010-1234-5678 (적지 않아도 됩니다)"
        value={phone} disabled={disabled} onChange={(event) => onPhone(event.target.value)} />
      {asksConsent ? (
        <label className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-xs leading-5">
          <input type="checkbox" required className="mt-1" checked={consent} disabled={disabled} onChange={(event) => onConsent(event.target.checked)} />
          <span>
            <strong className="text-sm">[선택] 전화번호 수집·이용 동의</strong>
            <span className="block">목적: {PHONE_CONSENT.purpose}</span>
            <span className="block">항목: {PHONE_CONSENT.items}</span>
            <span className="block">보유: {PHONE_CONSENT.retention}</span>
            <span className="block text-muted-foreground">{PHONE_CONSENT.refusal} 원하지 않으면 번호 칸을 비워 두세요.</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}
