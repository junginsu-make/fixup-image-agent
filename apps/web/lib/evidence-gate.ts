import { collectUnverified, findUncoveredFactTargets, scanBannedClaims, sectionScenePrompt } from "@fixup/pdp-core";
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
    if (first.label === SECTION_NAME_LABEL) return sectionNameRejection(section, first.matched);
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
 * `typography` 가 제목·부제·불릿을 프롬프트에 싣는다.
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
 * **신뢰 문장도 안 본다**(2026-09-23 사용자 결정). 이미지 밑에 설명 한 줄로
 * 박혀 나와 그리지 않기로 했다 — CTA 와 같은 이유로 그 글자로 막지 않는다.
 *
 * 영어 장면이 비면 한국어·제목 등 실제 대체 장면도 검사하고,
 * 걸렸을 때는 그 글을 실제로 가져온 칸의 이름으로 안내한다(`sceneSourceLabel`).
 */
function bannedInRenderedCopy(section: SectionBlueprint) {
  const scene = sectionScenePrompt(section);
  const 그려지는글: Array<{ label: string; text?: string }> = [
    { label: sceneSourceLabel(section, scene), text: scene },
    { label: "제목", text: section.headline },
    { label: "부제", text: section.subheadline },
    ...(section.bullets ?? []).map((text, index) => ({ label: `${index + 1}번째 항목`, text })),
  ];

  return 그려지는글.flatMap(({ label, text }) =>
    text ? scanBannedClaims(text).map((hit) => ({ ...hit, label })) : [],
  );
}

/**
 * 장면 글이 **어느 칸에서 왔는지** 이름을 돌려준다.
 *
 * `sectionScenePrompt` 는 영어 장면 -> 한국어 장면 -> 제목 -> 섹션 이름 순으로 첫 번째
 * 비지 않은 칸을 쓴다. 걸린 글이 제목에서 왔는데 「장면 지시를 고치라」고 하면, 사용자는
 * (보이지도 않는) 영어 장면 칸을 찾아 헤맨다. 영어 장면이 있는 보통의 경우는 전과 같이
 * 「장면 지시」다. 어느 칸과도 안 맞으면(기본 장면) 전과 같이 「장면 지시」다.
 *
 * **칸 이름은 시나리오 화면(`ScenarioEditor.tsx`)에 적힌 이름 그대로 쓴다** — 한국어 장면은
 * 「이미지 방향」, 제목은 「헤드라인」. 이름이 다르면 사용자가 그 칸을 못 찾는다. 영어 장면은
 * 화면에 칸이 없어 이전 이름을 그대로 둔다. 섹션 이름은 이름표도 편집 칸도 없어 사용자가 고칠
 * 수 없으므로, 거절 문구가 다르다(`sectionNameRejection`).
 * (일반 경로의 「제목」·「부제」 문구는 문구가 바뀌면 안 되므로 건드리지 않는다.)
 */
function sceneSourceLabel(section: SectionBlueprint, scene: string): string {
  const sources: Array<[unknown, string]> = [
    [section.prompt_en, "장면 지시"],
    [section.prompt_ko, "이미지 방향"],
    [section.headline, "헤드라인"],
    [section.section_name, SECTION_NAME_LABEL],
  ];
  const found = sources.find(([value]) => typeof value === "string" && value.trim() === scene);
  return found ? found[1] : "장면 지시";
}

/** 장면이 섹션 이름에서 왔다는 표지. 이 이름은 화면에 없으므로 사용자에게는 `sectionNameRejection` 문구로만 나간다. */
const SECTION_NAME_LABEL = "섹션 이름";

/**
 * 장면이 **섹션 이름에서 왔을 때**의 거절.
 *
 * 영어·한국어 장면과 헤드라인이 모두 비어 섹션 이름이 장면으로 쓰였는데 거기에 금지 주장이 있는
 * 경우다. 섹션 이름은 화면에서 고칠 수 없는 칸이라 「그 문구를 고치라」고 하면 사용자가 할 수 있는 일이
 * 없다. 그 칸이 장면이 된 까닭(이미지 방향이 비어 있음)을 말하고, 사용자가 쓸 수 있는 칸을 알려 준다.
 */
function sectionNameRejection(section: SectionBlueprint, matched: string): Response {
  const name = section.section_name.trim();
  return rejection(
    `섹션 「${name}」의 이미지 방향이 비어 있어 섹션 이름이 장면으로 쓰이는데, 그 이름에 사용할 수 없는 주장이 있습니다: 「${matched}」. 이미지 방향을 적은 뒤 다시 만들어 주세요.`,
  );
}
