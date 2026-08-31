import { Type } from "@google/genai";
import type { GapPolicy } from "./types";

/**
 * 사진에서 **제품을 먼저 읽는다.** 그리고 그것만 근거로 카피를 쓴다.
 *
 * ## 왜 필요한가
 *
 * 사진 경로는 사진 한 장에서 곧바로 섹션 카피로 건너뛰었다. 그래서 모델이
 * 제품을 보긴 하되 **무엇을 확인했는지 스스로 정리하지 않은 채** 판매 문장을
 * 지어냈다. 결과는 아무 제품에나 붙는 일반론이다 —
 * "사용 후 일상이 조금 더 가벼워집니다" 같은 문장을 금지 목록으로 하나씩 막아 온
 * 흔적이 프롬프트에 남아 있다. 증상을 막았을 뿐 원인은 그대로였다.
 *
 * 상세페이지는 **제품을 강조하고 설명하는 것**이다. 제품에서 출발하지 않으면
 * 강조할 것이 없다.
 *
 * ## 왜 호출을 늘리지 않는가
 *
 * 분석을 한 번 더 부르면 가장 느린 단계(구성안 생성)가 두 배가 된다. 대신
 * **같은 응답의 맨 앞 필드**로 받는다. JSON 은 앞에서부터 만들어지므로, 먼저 적은
 * 제품 사실이 뒤에 쓰는 카피의 조건이 된다. 비용도 시간도 늘지 않는다.
 *
 * ## 확인된 것과 모르는 것을 갈라 적게 한다
 *
 * 이 구분이 핵심이다. "모르는 것"을 적게 하면 모델이 그 자리를 **사실로 단정하지
 * 않는다.** 효능·가격·원료 출처처럼 사진으로 알 수 없는 것을 지어내는 일이 여기서 막힌다.
 */

export interface ProductReading {
  /** 무엇인가. 범주를 먼저 못 박는다 — 이게 흔들리면 카피 전체가 흔들린다. */
  category: string;
  /** 사진에서 실제로 보이는 것. 형태·색·재질·용량·질감. */
  visibleFacts: string[];
  /** 패키지에 적힌 글자를 **그대로**. 브랜드·성분·인증 표기. */
  labelText: string[];
  /** 남과 다르다고 사진으로 말할 수 있는 것. 없으면 빈 배열. */
  distinctiveTraits: string[];
  /** 사진으로는 알 수 없는 것. 여기 있는 것은 사실로 쓰지 않는다. */
  unknowns: string[];
}

/** 응답 스키마 조각. 구성안 스키마의 **맨 앞**에 둔다. */
export const PRODUCT_READING_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    category: { type: Type.STRING },
    visibleFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
    labelText: { type: Type.ARRAY, items: { type: Type.STRING } },
    distinctiveTraits: { type: Type.ARRAY, items: { type: Type.STRING } },
    unknowns: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
} as const;

/**
 * 제품을 먼저 읽으라는 지시.
 *
 * 프롬프트의 **앞쪽**에 둔다. 섹션 규칙 뒤에 붙이면 이미 카피를 다 구상한 뒤라
 * 형식만 채우게 된다.
 */
export const PRODUCT_READING_RULES = `# 먼저 제품을 읽는다 (productReading)

카피를 쓰기 전에 productReading 을 먼저 채운다. **이후 모든 판매 문장은 여기 적은
것만 근거로 쓴다.** 이 순서를 지키지 않으면 아무 제품에나 붙는 일반론이 나온다.

- category: 이것이 무엇인지 한 줄. 범주를 좁게 잡을수록 뒤 문장이 구체해진다.
  "화장품"이 아니라 "펌프형 유리병에 든 수분 세럼".
- visibleFacts: 사진에서 **실제로 보이는 것**만. 형태·색·재질·마감·용량감·질감.
  보이지 않는 것을 추측해 넣지 않는다. 3~8개.
- labelText: 패키지·라벨에 적힌 글자를 **그대로 옮긴다.** 브랜드명, 제품명, 성분,
  용량, 인증 표기. 읽을 수 없으면 빈 배열. **읽히지 않는 글자를 지어내지 않는다.**
- distinctiveTraits: 이 제품이 같은 범주의 다른 제품과 다르다고 **사진으로 말할 수
  있는 것**. 원목 캡, 불투명 유리, 스포이트 등 형태·재질·구조의 특징. 없으면 빈 배열.
- unknowns: 사진으로 알 수 없는 것. 효능, 성분 함량, 가격, 사용 대상, 원료 출처,
  제조 방식, 후기, 인증 여부 등 중 이 사진에서 확인되지 않는 것. 3개 이상.

**unknowns 에 적은 것은 카피에서 사실로 단정하지 않는다.** 필요하면 질문형이나
가치 제안으로 돌려 쓰되, 확정된 사실처럼 쓰지 않는다.`;

/**
 * 읽어낸 제품 사실을 카피 규칙으로 바꾼다.
 *
 * 프롬프트에 **두 번** 나오게 하는 셈인데(스키마 지시 + 이 문장) 의도한 것이다.
 * 앞에서는 "무엇을 적어라", 여기서는 "적은 것을 어떻게 써라"를 말한다.
 */
export const PRODUCT_GROUNDING_RULES = `# 카피는 제품에서 나와야 한다 (강제)

이 페이지는 **이 제품을 강조하고 설명하는** 상세페이지다. 카테고리 일반론이 아니다.

- 모든 headline·subheadline·bullets 는 productReading 의 visibleFacts /
  labelText / distinctiveTraits 중 **하나 이상에 붙어 있어야** 한다.
- **바꿔치기 시험**: 그 문장을 같은 범주의 다른 제품 페이지에 그대로 붙여도 말이
  되면 실패다. 다시 쓴다. "촉촉함을 오래" 는 아무 세럼에나 붙는다.
  "원목 캡을 열면" 은 이 제품에만 붙는다.
- 제품의 **형태·재질·구조**를 카피에 적극적으로 끌어들인다. 사진에 보이는 것이
  가장 확실한 근거이고, 읽는 사람도 사진에서 바로 확인할 수 있다.
- unknowns 에 있는 것을 사실로 주장하지 않는다. 효능·수치·인증·후기를 지어내지 않는다.
- labelText 에 있는 브랜드명·제품명은 **그 표기 그대로** 쓴다. 새 이름을 만들지 않는다.`;

/**
 * 읽어낸 제품 사실이 실제로 쓸 만한지 본다.
 *
 * 빈 껍데기(모든 배열이 비었거나 category 가 한 낱말)면 뒤 카피도 일반론이 된다.
 * 지금은 판단만 하고 막지는 않는다 — 사진이 정말 단순할 수도 있고, 카피를 아예
 * 못 만드는 것보다는 낫다.
 */
export function isProductReadingUsable(reading: ProductReading | undefined): boolean {
  if (!reading) return false;
  if (reading.category.trim().length < 4) return false;
  return reading.visibleFacts.filter((fact) => fact.trim()).length >= 2;
}

/** 저장된 초안이나 구버전 응답에 없을 수 있다. 없으면 빈 값으로 채운다. */
export function normalizeProductReading(raw: unknown): ProductReading | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

  const category = typeof source.category === "string" ? source.category.trim() : "";
  const reading: ProductReading = {
    category,
    visibleFacts: list(source.visibleFacts),
    labelText: list(source.labelText),
    distinctiveTraits: list(source.distinctiveTraits),
    unknowns: list(source.unknowns),
  };

  // 전부 비었으면 없는 것과 같다. 빈 껍데기를 들고 다니면 화면이 헛돈다.
  const empty =
    !reading.category &&
    reading.visibleFacts.length === 0 &&
    reading.labelText.length === 0 &&
    reading.distinctiveTraits.length === 0;
  return empty ? undefined : reading;
}

/**
 * 근거가 없는 자리를 어떻게 할 것인가 — **사진 경로용**.
 *
 * 텍스트 경로의 `gapPolicyRules` 와 뜻은 같지만 기준이 다르다. 저쪽은 "원문에
 * 있는가"를 묻는데, 사진 경로에는 원문이 없다. 여기서는 **사진에서 확인되는가
 * (productReading) 와 판매자가 알려줬는가** 가 기준이다.
 *
 * 그래서 문구를 따로 쓴다. 원문을 말하는 규칙을 그대로 가져오면 모델이 없는
 * 원문을 찾다가 아무 근거나 원문이라고 부른다.
 */
export function photoGapPolicyRules(policy: GapPolicy): string {
  const base =
    "근거가 있는 자리란 productReading 의 visibleFacts·labelText·distinctiveTraits 이거나, 파는 사람이 알려준 것이다.";

  switch (policy) {
    case "omit":
      return `[근거가 부족한 자리: 빼기]
${base}
- 근거가 없으면 그 문장을 쓰지 않는다. 문장 수가 줄어도 괜찮다.
- 빈자리를 그럴듯한 표현으로 메우지 않는다.`;
    case "sample":
      return `[근거가 부족한 자리: 예시로 채우기]
${base}
- 판매 문장을 이해하는 데 구체적인 값이 필요하면 현실적인 예시를 채운다.
- 다만 **수익·성과 보장, 의학적 효능, 인증·수상·순위, 배송·재고·마감 조건**은
  예시로 채우지 않는다. 이것들은 지어내면 표시광고법 문제가 된다.
- 사용자가 확인하고 고칠 것을 전제로 쓴다.`;
    default:
      return `[근거가 부족한 자리: 물어보기]
${base}
- 근거가 없는 사실 주장은 쓰지 않는다.
- 대신 그 자리를 확인 가능한 것(형태·재질·구조·사용 장면)으로 바꿔 쓴다.
- 효능·성분·인증·수치를 확인 없이 단정하지 않는다.`;
  }
}
