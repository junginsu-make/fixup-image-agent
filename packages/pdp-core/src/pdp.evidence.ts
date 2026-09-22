import { containsFactualMarker, scanBannedClaims } from "./pdp.claim-policy";
import {
  readCopyTarget,
  sameTarget,
  spliceBullet,
  targetKey,
  writeCopyTarget,
} from "./pdp.copy-target";
import type {
  CopyEvidence,
  CopyTarget,
  GapPolicy,
  LandingPageBlueprint,
  SectionBlueprint,
} from "./types";

export type BindingState = "fresh" | "stale" | "dangling";

export interface UnverifiedItem {
  sectionId: string;
  sectionName: string;
  target: CopyTarget;
  kind: "sample" | "ask";
  value: string;
  note?: string;
}

export type StructureFailureReason =
  | "missing"
  | "duplicate"
  | "unknown_target"
  | "bad_quote"
  | "banned"
  | "rhetoric_with_fact";

export interface StructureFailure {
  sectionId: string;
  target?: CopyTarget;
  reason: StructureFailureReason;
}

const SCALAR_TARGETS: CopyTarget[] = [
  { slot: "headline" },
  { slot: "subheadline" },
  { slot: "trust_or_objection_line" },
  { slot: "CTA" },
  { slot: "prompt_ko" },
];

function sectionTargets(section: SectionBlueprint): CopyTarget[] {
  return [
    ...SCALAR_TARGETS,
    ...section.bullets.map((_, index) => ({ slot: "bullet" as const, index })),
  ];
}

/**
 * 근거가 있어야 하는 자리. 장면 지시(`prompt_ko`)는 뺀다 —
 * "20대 여성이 앉아 있다" 는 캐스팅 지시이지 구매자에게 하는 사실 주장이 아니다.
 * 장면의 금지 표현은 이 함수가 아니라 `scanBannedClaims` 가 따로 본다(설계 §4-2).
 */
function factBearingTargets(section: SectionBlueprint): CopyTarget[] {
  return sectionTargets(section).filter((target) => target.slot !== "prompt_ko");
}

/**
 * 사실 표지가 있는데 근거가 없는 자리.
 *
 * 게이트가 「근거를 지우고 보내기」를 잡는 데 쓴다. 배열이 비었는지로 판정하면
 * 숫자가 하나도 없는 섹션이나 사용자가 방금 추가한 빈 섹션까지 막힌다.
 */
export function findUncoveredFactTargets(section: SectionBlueprint): CopyTarget[] {
  if (section.evidenceVersion !== 1) return [];
  const evidence = section.evidence ?? [];
  return factBearingTargets(section).filter((target) => {
    const current = readCopyTarget(section, target) ?? "";
    if (!containsFactualMarker(current)) return false;
    return !evidence.some((entry) => sameTarget(entry.target, target));
  });
}

function noteForTarget(target: CopyTarget): string {
  if (target.slot === "bullet") return `${target.index + 1}번째 항목의 실제 내용`;
  const labels: Record<Exclude<CopyTarget["slot"], "bullet">, string> = {
    headline: "헤드라인에 넣을 실제 내용",
    subheadline: "서브헤드라인에 넣을 실제 내용",
    trust_or_objection_line: "신뢰·반론 문장에 넣을 실제 내용",
    CTA: "행동 유도 문장에 넣을 실제 내용",
    prompt_ko: "이미지 장면에 넣을 실제 내용",
  };
  return labels[target.slot];
}

export function validateEvidenceBinding(
  section: SectionBlueprint,
  evidence: CopyEvidence,
): BindingState {
  const current = readCopyTarget(section, evidence.target);
  if (current === undefined) return "dangling";
  return current === evidence.value ? "fresh" : "stale";
}

export function collectUnverified(blueprint: LandingPageBlueprint): UnverifiedItem[] {
  return blueprint.sections.flatMap((section) => {
    if (section.evidenceVersion !== 1) return [];
    return (section.evidence ?? []).flatMap((evidence): UnverifiedItem[] => {
      const binding = validateEvidenceBinding(section, evidence);
      if (binding === "dangling") return [];
      const current = readCopyTarget(section, evidence.target) ?? "";
      const stale = binding === "stale";
      const needsReview =
        stale || evidence.kind === "ask" || (evidence.kind === "sample" && !evidence.acknowledgedAt);
      if (!needsReview) return [];
      return [
        {
          sectionId: section.section_id,
          sectionName: section.section_name,
          target: evidence.target,
          kind: evidence.kind === "sample" ? "sample" : "ask",
          value: current,
          note: evidence.note ?? (stale ? "수정한 문구의 실제 내용을 확인해 주세요" : undefined),
        },
      ];
    });
  });
}

function pushFailure(
  failures: StructureFailure[],
  section: SectionBlueprint,
  target: CopyTarget,
  reason: StructureFailureReason,
) {
  failures.push({ sectionId: section.section_id, target, reason });
}

export function verifyEvidenceStructure(
  blueprint: LandingPageBlueprint,
  sourceText: string,
): StructureFailure[] {
  const failures: StructureFailure[] = [];
  for (const section of blueprint.sections) {
    if (section.evidenceVersion !== 1) continue;
    const evidence = section.evidence ?? [];
    const counts = new Map<string, number>();
    for (const entry of evidence) counts.set(targetKey(entry.target), (counts.get(targetKey(entry.target)) ?? 0) + 1);

    for (const entry of evidence) {
      const current = readCopyTarget(section, entry.target);
      if (current === undefined) {
        pushFailure(failures, section, entry.target, "unknown_target");
        continue;
      }
      if ((counts.get(targetKey(entry.target)) ?? 0) > 1) {
        if (!failures.some((failure) => failure.sectionId === section.section_id && failure.reason === "duplicate" && failure.target && sameTarget(failure.target, entry.target))) {
          pushFailure(failures, section, entry.target, "duplicate");
        }
      }
      if (entry.kind === "quoted" && (!entry.quote?.trim() || !sourceText.includes(entry.quote.trim()))) {
        pushFailure(failures, section, entry.target, "bad_quote");
      }
      if (entry.kind === "sample" && scanBannedClaims(current).length > 0) {
        pushFailure(failures, section, entry.target, "banned");
      }
      if (entry.kind === "rhetoric" && containsFactualMarker(current)) {
        pushFailure(failures, section, entry.target, "rhetoric_with_fact");
      }
      if (entry.kind === "ask" && !entry.note?.trim()) {
        pushFailure(failures, section, entry.target, "missing");
      }
    }

    for (const target of findUncoveredFactTargets(section)) {
      pushFailure(failures, section, target, "missing");
    }
  }
  return failures;
}

/**
 * 재시도를 소진했을 때 남은 구조 실패를 정리한다.
 *
 * **문구를 지우는 것은 마지막 수단이다.** 대부분의 구조 실패는 모델이 *딱지를*
 * 잘못 단 것이지 문장이 나쁜 것이 아니다. 특히 입력이 짧으면 원문에서 인용할
 * 것이 없어 모델이 자기가 쓴 문장에 `quoted` 를 달고, 그러면 `bad_quote` 가
 * 무더기로 난다. 그걸 전부 지우면 **사용자는 빈 페이지를 받는다.**
 * (2026-07-29 실측: "요가 강의 팝니다" 한 줄 입력에서 헤드라인·서브헤드라인
 *  10칸 중 9칸이 비었다.)
 *
 * 그래서 빈칸 처리 정책을 따른다.
 *
 * | 정책 | 처리 |
 * |---|---|
 * | `sample` | 문구를 **살리고** `sample` 로 표시한다 — 원문에 없는 문장은 곧 우리가 지어낸 값이다 |
 * | `ask`·`omit` | 문구를 비우고 무엇이 필요한지 남긴다 |
 *
 * 예외 둘.
 * - **금지 분류(`banned`)는 정책과 무관하게 항상 비운다.** 수익 보장·의학 효능·
 *   인증 주장은 표시로 해결되지 않는다
 * - **`ask` 였는데 문구가 비어 있으면** 그대로 `ask` 다. 채울 것이 없다
 */
export function resolveStructureFailures(
  blueprint: LandingPageBlueprint,
  failures: StructureFailure[],
  gapPolicy: GapPolicy = "ask",
): LandingPageBlueprint {
  return {
    ...blueprint,
    sections: blueprint.sections.map((section) => {
      const sectionFailures = failures.filter((failure) => failure.sectionId === section.section_id);
      if (sectionFailures.length === 0) return section;
      let next: SectionBlueprint = { ...section, evidence: [...(section.evidence ?? [])] };

      for (const failure of sectionFailures.filter((entry) => entry.reason === "unknown_target")) {
        if (!failure.target) continue;
        next = { ...next, evidence: next.evidence?.filter((entry) => !sameTarget(entry.target, failure.target!)) };
      }

      // 같은 자리에 실패가 여럿이면 가장 무거운 것을 따른다 — banned 는 항상 삭제다.
      const targets = new Map<string, { target: CopyTarget; banned: boolean }>();
      for (const failure of sectionFailures) {
        if (failure.reason === "unknown_target" || !failure.target) continue;
        const key = targetKey(failure.target);
        const banned = failure.reason === "banned" || (targets.get(key)?.banned ?? false);
        targets.set(key, { target: failure.target, banned });
      }

      for (const { target, banned } of targets.values()) {
        const current = readCopyTarget(next, target);
        if (current === undefined) continue;

        const keepAsSample = gapPolicy === "sample" && !banned && current.trim().length > 0;
        const remaining = (next.evidence ?? []).filter((entry) => !sameTarget(entry.target, target));

        if (keepAsSample) {
          next = {
            ...next,
            evidence: [
              ...remaining,
              { target, value: current, kind: "sample", note: noteForTarget(target) },
            ],
          };
          continue;
        }

        next = writeCopyTarget(next, target, "");
        next = {
          ...next,
          evidence: [
            ...remaining,
            { target, value: "", kind: "ask", note: noteForTarget(target) },
          ],
        };
      }
      return next;
    }),
  };
}

export function applyUserEdit(
  blueprint: LandingPageBlueprint,
  sectionId: string,
  target: CopyTarget,
  value: string,
): LandingPageBlueprint {
  return {
    ...blueprint,
    sections: blueprint.sections.map((section) => {
      if (section.section_id !== sectionId || readCopyTarget(section, target) === undefined) return section;
      const written = writeCopyTarget(section, target, value);
      const remaining = (written.evidence ?? []).filter((entry) => !sameTarget(entry.target, target));
      /*
        **고쳤다고 「근거 체계를 갖췄다」고 선언하지 않는다**(2026-09-22).

        전에는 여기서 `evidenceVersion: 1` 을 찍었다. 그런데 그 값은 「이
        섹션은 근거 체계를 갖췄다」는 뜻이고, 게이트가 그것을 보고 **모든
        수치 칸에 근거를 요구한다.**

        사진 경로는 근거를 **아예 만들지 않는다** — 분석 응답 스키마에 그
        칸이 없다. 그래서 그대로 두면 게이트가 지나가는데, 사용자가 **장면
        지시 한 줄만 고쳐도** 그 순간 1판으로 승격되고 나머지 칸의 수치가
        전부 「근거 없음」이 되어 **그 섹션은 영구히 400** 이 됐다.

        막히는 문장은 사용자가 쓴 주장이 아니라 **우리 AI 가 사진을 보고 쓴
        제목**이고, 붙일 근거가 처음부터 없다. 충족이 불가능한 조건이었다.

        **누가 썼는지는 그대로 남긴다.** 고친 칸의 `user` 근거는 값어치가
        있다 — 금지 주장 검사(N-1)가 그것을 본다.
      */
      return {
        ...written,
        // 원래 1판이던 섹션만 1판으로 둔다. 없던 것을 새로 붙이지 않는다.
        ...(section.evidenceVersion === 1 ? { evidenceVersion: 1 as const } : {}),
        evidence: [...remaining, { target, value, kind: "user" }],
      };
    }),
  };
}

/**
 * 화면에서 「이대로 진행」을 눌렀을 때.
 *
 * 확인 화면은 **지금 문구를 그대로 보여주고** 확인을 받는다. 두 경우를 나눈다.
 *
 * - 문구가 그대로인 `sample` — 우리가 채운 값을 사용자가 그대로 쓰기로 했다.
 *   딱지는 `sample` 로 남기고 확인 시각만 찍는다. 여전히 미검증이다.
 * - 문구가 달라진 것(stale) — 그 문구는 더 이상 우리가 채운 값이 아니다.
 *   `sample` 로 남겨 두면 "우리가 지어낸 값을 확인했다"는 **거짓 기록**이 된다.
 *   `user` 로 바꾼다. 사용자가 쓴 문구를 사용자가 확인한 것이다.
 *   이렇게 해야 `quoted`·`rhetoric` 이 낡았을 때도 확인으로 풀린다 —
 *   예전에는 그 경우 「이대로 진행」이 영영 비활성으로 굳었다.
 *
 * 딱지가 가리키는 자리가 사라졌으면(dangling) 확인하지 않는다 — 화면에 보이지도 않았다.
 */
export function acknowledgeAll(
  blueprint: LandingPageBlueprint,
  at: string,
): LandingPageBlueprint {
  return {
    ...blueprint,
    sections: blueprint.sections.map((section) => ({
      ...section,
      evidence: section.evidence?.map((entry) => {
        const binding = validateEvidenceBinding(section, entry);
        if (binding === "dangling") return entry;
        if (binding === "stale") {
          const current = readCopyTarget(section, entry.target) ?? entry.value;
          return { target: entry.target, value: current, kind: "user" as const };
        }
        return entry.kind === "sample" ? { ...entry, acknowledgedAt: at } : entry;
      }),
    })),
  };
}

export function removeTarget(
  blueprint: LandingPageBlueprint,
  sectionId: string,
  target: CopyTarget,
): LandingPageBlueprint {
  return {
    ...blueprint,
    sections: blueprint.sections.map((section) => {
      if (section.section_id !== sectionId) return section;
      if (target.slot === "bullet") return spliceBullet(section, target.index);
      const written = writeCopyTarget(section, target, "");
      return {
        ...written,
        evidence: written.evidence?.filter((entry) => !sameTarget(entry.target, target)),
      };
    }),
  };
}

/**
 * 모델이 준 근거 목록을 **믿을 수 있는 모양**으로 손질한다.
 *
 * ── 왜 공용인가 ──────────────────────────────────────────────
 *
 * 글 경로에는 이 손질이 있었고 **사진 경로에는 없었다.** 사진 경로의
 * `normalizeSection` 은 필드를 하나씩 나열하는데 `evidence` 와 `evidenceVersion`
 * 이 그 목록에 없어, 모델이 근거를 보내도 **통째로 버려졌다.**
 *
 * 그래서 검사를 붙여도 볼 것이 없었다 — 지어낸 인용이 그대로 나갔다.
 * 같은 사고가 이 파일 머리말에 이미 적혀 있다(「필드를 하나씩 나열하지 않는다」).
 */

/**
 * 근거를 붙일 수 있는 카피 자리.
 *
 * `bullet` 은 여기 없다 — 번호가 함께 와야 해서 위에서 따로 가린다.
 */
const EVIDENCE_SLOTS = [
  "headline",
  "subheadline",
  "trust_or_objection_line",
  "CTA",
  "prompt_ko",
] as const;

function asPlainText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeCopyTarget(value: unknown): CopyTarget | null {
  const target = (value ?? {}) as Record<string, unknown>;
  const slot = asPlainText(target.slot);
  if (slot === "bullet") {
    return Number.isInteger(target.index) && Number(target.index) >= 0
      ? { slot, index: Number(target.index) }
      : null;
  }
  return EVIDENCE_SLOTS.includes(slot as (typeof EVIDENCE_SLOTS)[number])
    ? { slot: slot as (typeof EVIDENCE_SLOTS)[number] }
    : null;
}

export function normalizeEvidenceEntry(value: unknown): CopyEvidence | null {
  const input = (value ?? {}) as Record<string, unknown>;
  const target = normalizeCopyTarget(input.target);
  if (!target) return null;

  const kind = asPlainText(input.kind);
  const quote = asPlainText(input.quote);
  const note = asPlainText(input.note);

  return {
    target,
    value: asPlainText(input.value),
    /*
      **모르는 종류는 `sample` 로 떨어뜨린다.**
      `quoted` 로 두면 「원문에 있다」는 주장이 근거 없이 서고, 그 문장이
      확인 없이 나간다. `sample` 은 사용자 확인을 거친다.
    */
    kind: kind === "user" ? "sample" : (["quoted", "rhetoric", "sample", "ask"].includes(kind) ? (kind as CopyEvidence["kind"]) : "sample"),
    ...(quote ? { quote } : {}),
    ...(note ? { note } : {}),
  };
}

/** 섹션 하나의 근거 목록. 모양이 틀린 항목은 버린다. */
export function normalizeSectionEvidence(value: unknown): CopyEvidence[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeEvidenceEntry(entry))
    .filter((entry): entry is CopyEvidence => entry !== null);
}

/**
 * 정책을 적용한 결과 **실제로 몇 칸을 비웠는가.**
 *
 * ── 왜 세는가 ────────────────────────────────────────────────
 *
 * 「빈칸으로 두었습니다」를 화면에 띄우려면 **정말 비웠는지** 알아야 한다.
 * 정책을 정하는 것과 그 정책이 무언가를 바꾸는 것은 다른 일이다 —
 * `verifyEvidenceStructure` 는 `evidenceVersion !== 1` 인 섹션을 통째로
 * 건너뛴다. 모델이 근거 딱지를 안 붙이면 정책을 아무리 엄하게 정해도 **한 칸도
 * 안 비워진다.**
 *
 * 그때 「치웠습니다」라고 말하면 사용자는 위험한 문장이 사라진 줄 알고 그대로
 * 발행한다. 원래 문제보다 나쁘다.
 */
export function countClearedCopy(
  before: LandingPageBlueprint,
  after: LandingPageBlueprint,
): number {
  let cleared = 0;

  after.sections.forEach((section, index) => {
    const original = before.sections[index];
    // 섹션이 밀렸으면 셀 수 없다. `resolveStructureFailures` 는 1:1 로 돌려주므로
    // 여기 걸리면 부르는 쪽이 잘못한 것이다. 세지 않는 편이 부풀리는 것보다 낫다.
    if (!original || original.section_id !== section.section_id) return;

    const 비었나 = (was: string | undefined, now: string | undefined) =>
      Boolean(was?.trim()) && !now?.trim();

    for (const slot of ["headline", "subheadline", "trust_or_objection_line", "CTA"] as const) {
      if (비었나(original[slot], section[slot])) cleared += 1;
    }

    (original.bullets ?? []).forEach((bullet, bulletIndex) => {
      if (비었나(bullet, section.bullets?.[bulletIndex])) cleared += 1;
    });
  });

  return cleared;
}
