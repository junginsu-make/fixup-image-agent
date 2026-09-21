import { Type } from "./pdp.llm";
import type { LandingPageBlueprint, SectionBlueprint } from "./types";

/**
 * 구성안 심사.
 *
 * 구성안을 만든 호출과 **다른 호출**로 심사한다. 같은 호출 안에서 매기는 점수는
 * 방금 쓴 글을 스스로 칭찬하는 것에 가깝다(기존 scorecard 가 그랬다).
 *
 * 심사자에게는 구성안과 판매 원칙만 준다. 브리프 원문은 주지 않는다.
 * 브리프를 주면 "이 브리프로는 이 정도면 잘 쓴 것"이라는 변호를 하게 된다.
 * 사는 사람은 브리프를 못 본다. 심사자도 못 봐야 같은 조건에서 읽는다.
 */

export type ReviewRating = "pass" | "weak" | "fail";

export interface ReviewCriterion {
  id: string;
  label: string;
  /** 심사자에게 그대로 전달하는 판단 기준. */
  question: string;
}

/**
 * 심사 응답 스키마. 사진 경로와 텍스트 경로가 함께 쓴다.
 *
 * 예전에는 텍스트 경로 안에만 있었다. 사진 경로에도 심사를 붙이면서 옮겼다 —
 * 두 벌 두면 항목이 늘 때 한쪽만 고치게 된다.
 */
export const REVIEW_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          criterion: { type: Type.STRING },
          rating: { type: Type.STRING },
          evidence: { type: Type.STRING },
          fix: { type: Type.STRING },
        },
      },
    },
  },
} as const;

/**
 * 상세페이지가 실패하는 지점에서 뽑은 심사 기준.
 *
 * **수는 여기서만 읽는다**(`REVIEW_CRITERIA.length`). 늘리거나 줄여도 판정이
 * 따라온다.
 */
export const REVIEW_CRITERIA: ReviewCriterion[] = [
  {
    id: "audience",
    label: "대상",
    question:
      "누구에게 파는지가 한 사람을 떠올릴 만큼 구체적인가. \"누구나\", \"바쁜 현대인\" 같은 말은 fail 이다.",
  },
  {
    id: "problem",
    label: "문제",
    question:
      "그 대상이 실제로 겪는 장면을 짚었는가. 시간·장소·동작이 없는 추상적 서술은 weak 이상 주지 마라.",
  },
  {
    id: "differentiator",
    label: "차별점",
    question:
      "경쟁 상품 페이지에 그대로 붙여도 말이 되는 문장뿐이라면 fail 이다. 방식·포기한 것·검증 가능한 숫자 중 하나는 있어야 한다.",
  },
  {
    id: "objection",
    label: "반론",
    question:
      "살까 말까 망설이는 이유(가격, 나한테도 될까, 실패하면)를 정면으로 다룬 섹션이 있는가. 좋은 점만 있으면 fail 이다.",
  },
  {
    id: "flow",
    label: "흐름",
    question:
      "섹션을 위에서 아래로 읽으면 마음이 한 방향으로 움직이는가. 각각 맞는 말이지만 나열이면 fail 이다.",
  },
  {
    // 사진 경로 실측(2026-07-31)에서 가장 크게 남은 결함이다. 제품을 먼저 읽게 해도
    // "수분 장벽 강화", "천연 유래 성분", "피부 자극 테스트 완료" 처럼 확인되지 않은
    // 효능·성분·검사를 사실처럼 썼다. 정규식은 이런 부드러운 주장을 못 잡는다.
    id: "grounding",
    label: "근거",
    question:
      "확인되지 않은 효능·성분·인증·검사·수치를 사실처럼 쓴 문장이 있는가. 하나라도 있으면 fail 이다. 제품에서 확인되는 것(형태·색·재질·구조·라벨 문구)에 붙은 문장인지 본다.",
  },
  {
    id: "action",
    label: "마무리",
    question:
      "마지막 섹션이 읽는 사람의 망설임을 덜어주는가. 버튼 문구를 요구하지 마라 — 이 페이지는 링크를 걸 수 없다. 반대로 지어낸 배송·재고·마감 조건('오늘 주문하면 모레 도착')이 있으면 fail 이다. 파는 사람만 아는 것을 페이지가 약속하면 안 된다.",
  },
];

const CRITERION_IDS = new Set(REVIEW_CRITERIA.map((criterion) => criterion.id));
const RATINGS: ReviewRating[] = ["pass", "weak", "fail"];

export interface ReviewItem {
  criterion: string;
  rating: ReviewRating;
  /** 왜 그렇게 봤는지. 한국어. 사용자에게 그대로 보여준다. */
  evidence: string;
  /** 어떻게 고쳐야 하는지. 재생성 프롬프트에 들어간다. */
  fix: string;
}

/**
 * 심사를 실제로 받았는가.
 *
 * **`complete` 가 아니면 통과로 볼 수 없다**(설계 §10.1). 모델이 엉뚱한 이름만
 * 내면 `items` 가 비는데, 그 빈 결과는 fail 이 없으므로 통과처럼 보인다.
 */
export type ReviewCompleteness = "complete" | "incomplete" | "unavailable";

export interface BlueprintReview {
  items: ReviewItem[];
  /**
   * 모르는 이름이라 버린 항목 수.
   *
   * 안 남기면 「모델이 전부 엉뚱한 이름을 냈다」와 「아무것도 안 냈다」가 같은
   * 빈 목록이 되어 구별할 수 없다.
   */
  droppedCount?: number;
  /** 응답이 목록 모양조차 아니었다. */
  malformed?: boolean;
  /**
   * **이 심사가 본 구성안의 자국**(N-3, 설계 §9.3).
   *
   * 사용자가 섹션을 지우거나 제목을 고쳐도 심사 결과는 그대로 남았다 —
   * 고친 구성안에 「모두 통과했습니다」가 붙었다. 지금 구성안과 대조해
   * 낡았는지 가린다(`isReviewStale`).
   *
   * 옛 초안에는 이 값이 없다. 없으면 낡았다고 하지 않는다.
   */
  stamp?: string;
}

export interface ReviewSummary {
  passed: number;
  weak: number;
  failed: number;
}

export function buildReviewPrompt(blueprint: LandingPageBlueprint, principles: string) {
  const criteria = REVIEW_CRITERIA.map(
    (criterion) => `- ${criterion.id} (${criterion.label}): ${criterion.question}`,
  ).join("\n");

  return `너는 상세페이지를 심사하는 사람이다. 이 구성안을 쓴 사람이 아니다.

아래 판매 원칙에 비추어 구성안을 항목별로 채점한다.
후하게 주지 마라. 통과시킨 구성안은 그대로 제작에 들어간다.

[판매 원칙]
${principles}

[심사 항목]
${criteria}

[등급]
- pass: 원칙을 지켰다
- weak: 지키려 했으나 약하다. 고치면 나아진다
- fail: 원칙을 어겼다. 이대로 만들면 안 된다

[출력]
항목마다 criterion(위 id 그대로), rating, evidence(왜 그렇게 봤는지 한국어),
fix(어떻게 고쳐야 하는지 한국어. pass 면 빈 문자열)를 낸다.
evidence 에는 구성안의 실제 문장을 인용한다. 인용 없이 총평만 쓰지 마라.

[심사할 구성안]
${describeBlueprint(blueprint)}`;
}

function describeBlueprint(blueprint: LandingPageBlueprint) {
  const sections = blueprint.sections.map((section, index) => describeSection(section, index));
  return [`전체 요약: ${blueprint.executiveSummary}`, "", ...sections].join("\n");
}

function describeSection(section: SectionBlueprint, index: number) {
  const lines = [
    `[${index + 1}] ${section.section_name}`,
    `  헤드라인: ${section.headline}`,
    `  서브: ${section.subheadline}`,
  ];
  if (section.bullets.length) lines.push(`  항목: ${section.bullets.join(" / ")}`);
  if (section.trust_or_objection_line) lines.push(`  신뢰·반론: ${section.trust_or_objection_line}`);
  if (section.CTA) lines.push(`  행동 유도: ${section.CTA}`);
  return lines.join("\n");
}

function asText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asRating(value: unknown): ReviewRating {
  // 모르는 등급을 pass 로 넘기면 미달 구성안이 그대로 통과한다. weak 이 안전하다.
  return RATINGS.includes(value as ReviewRating) ? (value as ReviewRating) : "weak";
}

export function normalizeReview(raw: unknown): BlueprintReview {
  const rawItems = (raw as { items?: unknown })?.items;
  // 목록이 아니면 응답 모양 자체가 틀린 것이다. 그 사실을 남긴다.
  if (!Array.isArray(rawItems)) return { items: [], malformed: true };

  const items: ReviewItem[] = [];
  let droppedCount = 0;
  for (const entry of rawItems) {
    const criterion = asText((entry as { criterion?: unknown })?.criterion);
    /*
      모르는 항목은 버린다. 심사 기준은 여기서 정하지, 모델이 늘리는 게 아니다.

      **몇 개를 버렸는지 남긴다.** 안 남기면 「모델이 전부 엉뚱한 이름을 냈다」와
      「모델이 아무것도 안 냈다」가 같은 빈 목록이 되어 구별할 수 없다.
    */
    if (!CRITERION_IDS.has(criterion)) {
      droppedCount += 1;
      continue;
    }

    items.push({
      criterion,
      rating: asRating((entry as { rating?: unknown })?.rating),
      evidence: asText((entry as { evidence?: unknown })?.evidence),
      fix: asText((entry as { fix?: unknown })?.fix),
    });
  }

  return droppedCount ? { items, droppedCount } : { items };
}

/**
 * **있는 항목이 정확히 한 번씩** 왔는가.
 *
 * **수를 글로 적지 않는다.** 전에는 이 파일의 두 주석이 서로 다른 수를 말하고
 * 있었다(D-11-e). 그런 주석은 항목이 늘거나 줄 때 조용히 거짓이 되고, 다음
 * 사람이 하나를 지우고도 「맞다」고 읽는다. 세는 것은 `REVIEW_CRITERIA` 뿐이다.
 *
 * 모르는 값·중복·누락은 전부 `incomplete` 다 — **안 본 항목이 있다는 뜻**이고,
 * 그것을 통과로 바꾸면 심사가 있으나 마나다.
 */
export function reviewCompleteness(review: BlueprintReview | null): ReviewCompleteness {
  if (!review) return "unavailable";

  const seen = new Set(review.items.map((item) => item.criterion));
  const 온전함 = seen.size === REVIEW_CRITERIA.length && review.items.length === REVIEW_CRITERIA.length;
  return 온전함 ? "complete" : "incomplete";
}

/**
 * 어느 쪽 심사가 더 나은가. 재작성이 늘 개선은 아니라서 비교가 필요하다.
 *
 * fail 을 먼저 보고, 같으면 weak 으로 가린다. fail 하나는 weak 여럿보다 나쁘다 —
 * fail 은 "이대로 만들면 안 된다"는 뜻이다.
 *
 * @returns 낮을수록 좋다.
 */
export function reviewPenalty(review: BlueprintReview | null): number {
  // 심사를 못 받았으면 판단할 근거가 없다. 있는 것보다 나쁘게 본다.
  if (!review) return Number.POSITIVE_INFINITY;

  const fails = review.items.filter((item) => item.rating === "fail").length;
  const weaks = review.items.filter((item) => item.rating === "weak").length;

  /*
    **안 본 항목은 fail 보다 무겁게 센다.**

    전에는 빈 심사가 0 이라, 「fail 하나 있는 온전한 심사」보다 좋아 보였다.
    재작성 루프가 그 빈 결과를 「가장 좋은 것」으로 채택했다 — 아무도 안 본
    구성안이 이겼다.
  */
  const missing = REVIEW_CRITERIA.length - new Set(review.items.map((item) => item.criterion)).size;
  return missing * 1000 + fails * 100 + weaks;
}

/**
 * fail 이 하나라도 있으면 다시 만든다.
 *
 * weak 으로는 다시 만들지 않는다. 완벽한 구성안은 없어서 weak 은 거의 항상
 * 남고, 그걸 조건으로 걸면 최대 횟수까지 매번 돌게 된다.
 */
export function needsRevision(review: BlueprintReview) {
  // 불완전한 심사도 다시 받는다. 안 본 항목을 통과로 넘기지 않는다.
  if (reviewCompleteness(review) !== "complete") return true;
  return review.items.some((item) => item.rating === "fail");
}

/** 미달 항목을 구성안 재생성 프롬프트에 실을 지시문으로 바꾼다. */
export function buildRevisionDirective(review: BlueprintReview) {
  const problems = review.items.filter((item) => item.rating !== "pass");
  if (problems.length === 0) return "";

  const lines = problems.map((item) => {
    const label = REVIEW_CRITERIA.find((c) => c.id === item.criterion)?.label ?? item.criterion;
    const mark = item.rating === "fail" ? "반드시" : "가능하면";
    // weak 은 재생성 사유는 아니지만, 다시 만드는 김에 같이 고치는 편이 낫다.
    return `- ${label} (${mark} 고칠 것): ${item.evidence}\n  → ${item.fix}`;
  });

  return ["심사에서 아래가 지적됐다. 이 점들을 고쳐 구성안을 다시 짜라.", ...lines].join("\n");
}

export function summarizeReview(review: BlueprintReview): ReviewSummary {
  return {
    passed: review.items.filter((item) => item.rating === "pass").length,
    weak: review.items.filter((item) => item.rating === "weak").length,
    failed: review.items.filter((item) => item.rating === "fail").length,
  };
}
