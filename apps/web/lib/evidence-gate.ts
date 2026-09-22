import { collectUnverified, findUncoveredFactTargets, scanBannedClaims } from "@fixup/pdp-core";
import type { LandingPageBlueprint, SectionBlueprint } from "@fixup/pdp-core";

function rejection(message: string): Response {
  return Response.json(
    { ok: false, code: "INVALID_REQUEST", message },
    { status: 400 },
  );
}

/** 미확인이 남아 있으면 거절 응답을 돌려준다. 통과하면 null. */
export function rejectIfUnverified(sections: SectionBlueprint[]): Response | null {
  // 근거 배열이 비었는지로 판정하면, 숫자가 하나도 없는 카피나 사용자가 방금 추가한
  // 빈 섹션까지 막힌다. 실제로 막아야 하는 것은 '사실을 말하는 자리인데 근거가 없는' 상태다.
  const uncovered = sections.flatMap((section) => findUncoveredFactTargets(section));
  if (uncovered.length > 0) {
    return rejection("근거 없이 수치를 말하는 문장이 있습니다. 구성안을 다시 확인해 주세요.");
  }

  const blueprint: LandingPageBlueprint = {
    executiveSummary: "",
    scorecard: [],
    blueprintList: [],
    sections,
  };
  if (collectUnverified(blueprint).length > 0) {
    return rejection("확인하지 않은 예시 또는 질문이 남아 있습니다.");
  }

  for (const section of sections) {
    const 걸린것 = bannedInRenderedCopy(section);
    if (걸린것.length === 0) continue;
    const first = 걸린것[0]!;
    /*
      **무엇을 고쳐야 하는지 말한다.**

      사용자가 직접 쓴 문구를 우리가 말없이 지우지 않기로 했으므로, 어디를
      고쳐야 하는지는 반드시 말해야 한다. 「사용할 수 없는 주장이 있습니다」만
      말하면 사용자는 여덟 칸을 뒤진다.
    */
    const where = section.section_name?.trim() ? `${section.section_name}의 ${first.label}` : first.label;
    return rejection(
      `${where}에 사용할 수 없는 주장이 있습니다: 「${first.matched}」. 그 문구를 고친 뒤 다시 만들어 주세요.`,
    );
  }

  return null;
}

/**
 * **이미지에 실제로 그려지는 글자**를 전부 모은다(N-1, 설계 §9.2).
 *
 * ── 무엇이 새고 있었나 ─────────────────────────────────────
 *
 * 전에는 `prompt_en` **하나만** 봤다. 그런데 상세페이지는 출력 모드가
 * `full-image` 라 글자가 이미지 안에 그려진다 — `pdp.image-prompt.ts` 의
 * `typography` 가 제목·부제·불릿·신뢰문구를 프롬프트에 싣는다.
 *
 * 그래서 사용자가 제목에 「식약처 인증」을 직접 치면 아무 데도 안 걸렸다.
 * 코어의 금지 주장 검사는 **우리가 채운 예시**(`kind: "sample"`)에만 돌고,
 * 사용자가 고친 문구는 `kind: "user"` 가 되어 그 검사를 지나간다.
 *
 * 설계 §9.2: 「**금지된 허위 주장은 확인 버튼만으로 허용하지 않는다**」.
 * 확인을 눌렀든 직접 썼든 막는다.
 *
 * ── 왜 CTA 는 안 보나 ──────────────────────────────────────
 *
 * 이미지에 안 실린다. 싣지 않기로 한 결정이 있다(`pdp.image-prompt.ts`,
 * 2026-07-30 — 눌리지 않는 그림 버튼이 되기 때문). **안 그려지는 글자로
 * 생성을 막으면 사용자는 왜 막혔는지 알 수 없다.**
 *
 * `prompt_ko` 도 안 본다 — 장면 지시이고 `prompt_en` 으로 옮겨져 실린다.
 */
function bannedInRenderedCopy(section: SectionBlueprint) {
  const 그려지는글: Array<{ label: string; text?: string }> = [
    { label: "장면 지시", text: section.prompt_en },
    { label: "제목", text: section.headline },
    { label: "부제", text: section.subheadline },
    { label: "신뢰 문장", text: section.trust_or_objection_line },
    ...(section.bullets ?? []).map((text, index) => ({ label: `${index + 1}번째 항목`, text })),
  ];

  return 그려지는글.flatMap(({ label, text }) =>
    text ? scanBannedClaims(text).map((hit) => ({ ...hit, label })) : [],
  );
}
