import type { Locale } from "../landing-content";
import { CS_EMAIL } from "../../../lib/cs/contact";

/**
 * 푸터에 고정으로 거는 사업자 정보.
 *
 * 전자상거래법 제10조는 상호·대표자·주소·전화번호·사업자등록번호·통신판매업
 * 신고번호를 **이용자가 쉽게 볼 수 있는 곳에** 표시하라고 한다. 첫 화면에서
 * 늘 닿는 자리가 푸터라서 여기 둔다.
 *
 * 값은 **국세청 사업자등록증명**(발급번호 4324-174-0754-293, 2026-07-22 발급)
 * 에서 그대로 옮겼다. 기억으로 적지 않는다 — 한 글자만 달라도 허위 표시가 된다.
 *
 * 고칠 때는 이 파일만 고친다. 화면 쪽(`BusinessInfo.tsx`)에는 값이 없다.
 */

/** 사업자등록증명에 적힌 그대로. 줄이거나 다듬지 않는다. */
export const BUSINESS = {
  companyName: "주식회사 픽스업",
  ceo: "정해민",
  registrationNumber: "856-88-03150",
  /**
   * 통신판매업 신고번호는 **사업자등록증명에 실리지 않는다**(관할 시·군·구가
   * 따로 내주는 번호다). 그래서 오래 「신고 준비중」이었다.
   *
   * 2026-09-28 에 번호를 받아 채웠다. **공정거래위원회 통신판매사업자 조회의
   * 값을 그대로 옮겼다** — 신고일자 2025-11-30, 신고기관 경기도 김포시.
   */
  mailOrderNumber: "제 2025-경기김포-10474 호",
  address: "경기도 김포시 고촌읍 고송로 8, 4층",
  /**
   * 대표 전화번호. 2026-09-28 에 임시 번호(개인 휴대전화)에서 바꿨다.
   *
   * 전자상거래법이 요구하는 것은 **실제로 연결되는 번호**다. 받지 않는 번호를
   * 걸어 두면 표시한 것으로 치지 않는다.
   */
  contact: "02-1666-8467",
  /**
   * 전자우편주소(2026-09-29). 전자상거래법 제10조가 전화번호와 함께 요구한다.
   * 문의 창구와 **같은 값**을 쓴다 — 갈라지면 한쪽은 아무도 안 본다.
   */
  email: CS_EMAIL,
} as const;

export type BusinessField = keyof typeof BUSINESS;

/** 푸터에 늘어놓는 차례. 증명서의 차례를 따른다. */
export const BUSINESS_ORDER = [
  "companyName",
  "ceo",
  "registrationNumber",
  "mailOrderNumber",
  "address",
  "contact",
  "email",
] as const satisfies readonly BusinessField[];

const LABELS: Record<Locale, Record<BusinessField, string>> = {
  ko: {
    companyName: "상호",
    ceo: "대표자",
    registrationNumber: "사업자등록번호",
    mailOrderNumber: "통신판매업 신고번호",
    address: "주소",
    contact: "연락처",
    email: "이메일",
  },
  en: {
    companyName: "Company",
    ceo: "CEO",
    registrationNumber: "Business registration",
    mailOrderNumber: "Mail-order registration",
    address: "Address",
    contact: "Contact",
    email: "Email",
  },
};

export interface BusinessLine {
  field: BusinessField;
  label: string;
  value: string;
}

/**
 * 화면에 그릴 줄들을 만든다.
 *
 * 값은 두 언어에서 같다 — 등록된 상호와 번호는 번역 대상이 아니다. 이름표만
 * 언어를 따른다.
 */
export function businessLines(locale: Locale): readonly BusinessLine[] {
  const labels = LABELS[locale];
  return BUSINESS_ORDER.map((field) => ({
    field,
    label: labels[field],
    value: BUSINESS[field],
  }));
}
