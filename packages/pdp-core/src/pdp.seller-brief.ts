/**
 * 사진 경로에서 **파는 사람만 아는 것**을 받는다.
 *
 * ## 왜 필요한가
 *
 * 판매 원칙이 요구하는 것은 사진으로 알 수 없다.
 *
 * - "대상이 좁을수록 잘 팔린다" → 누구에게 파는지는 사진에 없다
 * - "문제는 증상이 아니라 장면으로" → 고객이 겪는 장면은 사진에 없다
 * - "차별점은 경쟁자가 못 하는 말" → 무엇을 포기했는지는 사진에 없다
 *
 * 제품을 먼저 읽게 해도(`pdp.product-reading.ts`) 여기까지는 못 간다. 사진은
 * **형태·색·재질·구조**를 말해줄 뿐, 누구의 어떤 불편을 어떻게 푸는지는 모른다.
 * 그래서 모델이 그 자리를 그럴듯한 일반론으로 메운다.
 *
 * ## 왜 자유 입력 한 칸으로는 부족한가
 *
 * 예전에는 "추가 정보" 한 칸이었다. 무엇을 적어야 할지 알려주지 않으니 대개
 * "20대 여성, 여름" 처럼 조각만 들어왔다. 칸을 나누면 **무엇을 물어보는지가 곧
 * 안내**가 된다.
 *
 * ## 비워도 된다
 *
 * 전부 선택 입력이다. 사진 경로의 미덕은 빠른 것인데, 다 채워야 시작할 수 있으면
 * 텍스트 경로와 다를 게 없어진다. 채운 칸만 프롬프트에 실린다.
 */

export interface SellerBrief {
  /** 누구에게 파는가. 좁을수록 좋다. */
  audience?: string;
  /** 그 사람이 겪는 불편. 장면이면 더 좋다. */
  problem?: string;
  /**
   * 제품의 특징. 성분·소재·규격·사용법처럼 **사진으로는 알 수 없는 사실.**
   *
   * 이 칸이 없어서 「남과 다른 점」 하나에 다 몰아넣어야 했다. 둘은 다른
   * 것이다 — 특징은 사실이고 차별점은 그중 경쟁자가 못 하는 말이다.
   */
  features?: string;
  /** 남과 다른 점. 방식·포기한 것·검증 가능한 숫자. */
  differentiator?: string;
  /**
   * 꼭 넣고 싶은 말. 상호·인증·수상처럼 반드시 페이지에 남아야 하는 것.
   *
   * 근거 없는 숫자를 막는 규칙에 걸리지 않게 **판매자가 보증한 사실**로 다룬다.
   */
  emphasis?: string;
}

const FIELDS: ReadonlyArray<{
  key: keyof SellerBrief;
  label: string;
  /** 이 값이 원칙의 어느 대목에 쓰이는지. 모델에게 용도를 알려준다. */
  use: string;
}> = [
  { key: "audience", label: "누구에게", use: "이 사람 한 명을 떠올리고 쓴다. 대상을 넓히지 않는다" },
  { key: "problem", label: "겪는 불편", use: "문제 섹션은 이 장면에서 출발한다" },
  {
    key: "features",
    label: "제품의 특징",
    use: "사진으로 알 수 없는 사실이다. 성분·소재·규격은 여기 적힌 대로만 쓰고, 없는 것을 보태지 않는다",
  },
  { key: "differentiator", label: "남과 다른 점", use: "차별점 섹션의 근거다. 이것 말고 다른 우위를 지어내지 않는다" },
  {
    key: "emphasis",
    label: "꼭 넣고 싶은 말",
    use: "판매자가 보증한 사실이다. 페이지 어딘가에 반드시 남기고, 근거 없는 주장으로 취급하지 않는다",
  },
];

/** 빈 문자열·공백만 있는 값을 걷어낸다. 화면에서 넘어오는 값을 믿지 않는다. */
export function normalizeSellerBrief(input: SellerBrief | undefined): SellerBrief {
  if (!input) return {};
  const clean = (value: string | undefined) => {
    const trimmed = String(value ?? "").trim();
    // 너무 길면 프롬프트를 밀어낸다. 한 칸에 필요한 만큼만 받는다.
    return trimmed ? trimmed.slice(0, 500) : undefined;
  };
  return {
    audience: clean(input.audience),
    problem: clean(input.problem),
    features: clean(input.features),
    differentiator: clean(input.differentiator),
    emphasis: clean(input.emphasis),
  };
}

/** 채운 칸이 하나라도 있는가. */
export function hasSellerBrief(brief: SellerBrief): boolean {
  return FIELDS.some((field) => Boolean(brief[field.key]));
}

/**
 * 프롬프트에 실을 문장을 만든다.
 *
 * **채운 칸만** 넣는다. 빈 칸을 "(없음)"으로 채워 보내면 모델이 그 빈칸을
 * 채워야 할 자리로 읽고 지어낸다.
 *
 * @returns 채운 칸이 없으면 빈 문자열.
 */
export function buildSellerBriefPrompt(input: SellerBrief | undefined): string {
  const brief = normalizeSellerBrief(input);
  if (!hasSellerBrief(brief)) return "";

  const lines = [
    "# 파는 사람이 알려준 것 (사진으로는 알 수 없는 것)",
    "",
    "아래는 사진이 아니라 **판매자가 직접 적은 사실**이다. 사진에서 읽어낸 것보다",
    "우선한다. 여기 적힌 내용과 어긋나는 카피를 쓰지 않는다.",
    "",
  ];

  for (const field of FIELDS) {
    const value = brief[field.key];
    if (!value) continue;
    lines.push(`- ${field.label}: ${value}`);
    if (field.use) lines.push(`  → ${field.use}`);
  }

  return lines.join("\n");
}
