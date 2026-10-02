/**
 * 회원 전화번호 — **선택 항목**(2026-10-02 사용자 결정).
 *
 * 적으면 수집·이용 동의(선택)를 받아야 저장한다. 목적은 문의 응대와 서비스 운영
 * 안내 연락이고 광고 문자는 보내지 않는다. 동의 시각은 `profiles.phone_consented_at`.
 *
 * **형식 규칙은 DB 의 `public.profile_phone` 과 같다**(마이그레이션 202610020001).
 * 둘이 다르면 앱이 받은 번호를 DB 제약이 거절한다 — `__tests__/phone-cases.json` 을
 * 앱 시험과 DB 시험이 함께 쓴다.
 */
export const PHONE_MAX_INPUT = 20;

/** 동의 칸 옆에 그대로 보이는 말. 처리방침의 「연락처(선택)」 줄과 같은 내용이다. */
export const PHONE_CONSENT = {
  purpose: "문의 응대 및 서비스 변경·장애 등 운영 안내 연락",
  items: "휴대폰 또는 전화번호",
  retention: "회원 탈퇴 또는 동의 철회(번호 삭제) 시까지",
  refusal: "동의하지 않아도 가입과 서비스 이용에 제한이 없습니다.",
} as const;

/** 받는 형식이면 하이픈을 넣은 꼴로, 아니면 null. 빈 값도 null 이다. */
export function normalizePhone(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  if (!text || text.length > PHONE_MAX_INPUT || !/^[0-9 -]+$/.test(text)) return null;
  const d = text.replace(/[^0-9]/g, "");
  const group = (head: number) => `${d.slice(0, head)}-${d.slice(head, d.length - 4)}-${d.slice(-4)}`;
  if (/^1[5-9][0-9]{6}$/.test(d)) return `${d.slice(0, 4)}-${d.slice(4)}`;
  // 010 은 11자리뿐이다(옛 011 등은 010 으로 옮겨지며 자리를 더했다).
  if (/^010/.test(d)) return d.length === 11 ? group(3) : null;
  if (/^02[0-9]{7,8}$/.test(d)) return group(2);
  if (/^050[0-9]{8,9}$/.test(d)) return group(4);
  if (/^0[0-9]{9,10}$/.test(d)) return group(3);
  return null;
}

/** 저장 전 검사. 비워 두면 문제없다. */
export function phoneInputError(phone: string, consent: boolean): string | null {
  if (!String(phone ?? "").trim()) return null;
  if (!normalizePhone(phone)) return "전화번호는 010-1234-5678 처럼 숫자와 하이픈(-)으로 적어 주세요.";
  if (!consent) return "전화번호를 저장하려면 전화번호 수집·이용에 동의해 주세요. 원하지 않으면 칸을 비워 두세요.";
  return null;
}

/**
 * 이메일 가입이 가입 정보(`raw_user_meta_data`)에 싣는 값. DB 트리거
 * `capture_signup_phone`(202610020002)이 `fixup_phone_consent` 가 true 일 때만 프로필로
 * 옮기고, **인증 정보에서는 키를 지운다** — 번호를 지우거나 탈퇴하면 정말 사라져야 한다.
 * 키 이름은 같은 Supabase 를 쓰는 다른 서비스와 겹치지 않게 `fixup_` 을 붙인다.
 * 동의가 없거나 형식이 틀리면 아무것도 싣지 않는다.
 */
export function signupPhoneMetadata(phone: string, consent: boolean): { fixup_phone?: string; fixup_phone_consent?: true } {
  const normalized = normalizePhone(phone);
  return normalized && consent ? { fixup_phone: normalized, fixup_phone_consent: true } : {};
}
