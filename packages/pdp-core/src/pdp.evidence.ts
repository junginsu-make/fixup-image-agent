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
      return {
        ...written,
        evidenceVersion: 1,
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
