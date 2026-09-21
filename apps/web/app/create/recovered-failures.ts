import type { SectionBlueprint } from "@fixup/pdp-core";

/**
 * **어느 장이 왜 안 만들어졌는지 말한다**(F-7-8, 상세페이지 쪽).
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────
 *
 * 묶음 생성은 성공한 섹션만 적었다(`images/batch/route.ts` 의
 * `if (!result.ok) continue`). 그래서 되찾을 때 서버가 아는 것은 「만들어진
 * 것」뿐이고 **왜 빠졌는지는 아무 데도 안 남았다.**
 *
 * 사용자가 보는 것은 그때 스쳐 간 알림뿐이다. 탭을 닫았다 돌아오면 그 말도
 * 없다 — **어느 장이 왜 빠졌는지 알 길이 없어** 여덟 장을 통째로 다시 만들고,
 * 그때 이미 만든 넉 장 값이 또 나간다.
 *
 * 설계 §14.6: 「failedSections 미표시·토스트만 존재 | **영구 상태·섹션별
 * 실패/미시도 이유 표시** | W4 / T-JOB」.
 *
 * ── 리디자인 쪽과 따로 두는 까닭 ────────────────────────────
 *
 * 리디자인은 같은 일을 `redesign/failed-sections.ts` 가 한다. 거기서 오는
 * 것은 **제공자가 준 한국어 문장**이고, 여기로 오는 것은 **오류 코드**다
 * (`AI_QUOTA_EXCEEDED` 같은). 다루는 것이 달라 한 파일로 묶으면 둘 다
 * 어정쩡해진다.
 */

/** 서버가 적어 둔 섹션 한 줄. `job-recovery.ts` 의 `RecoverableJobItem` 과 같은 모양. */
export interface RecoveredFailureItem {
  sectionId: string;
  url: string | null;
  errorCode?: string | null;
}

export interface RecoveredFailureLine {
  /** 「S3 베네핏」처럼 사람이 가리킬 수 있는 이름. */
  label: string;
  /** 왜 안 만들어졌나. 사용자가 읽는 말이다. */
  reason: string;
  /** 다시 눌러 볼 값어치가 있는가. 한도를 다 썼으면 눌러도 같은 답이 온다. */
  retryable: boolean;
}

/**
 * 오류 코드를 사람이 읽는 말로.
 *
 * **모르는 코드를 안다고 하지 않는다.** 목록에 없으면 「까닭을 알 수 없다」고
 * 말하고, 그래도 **다시 해 볼 수는 있다**고 알린다 — 대부분의 일시적 실패가
 * 여기로 온다.
 */
const 까닭 = new Map<string, { reason: string; retryable: boolean }>([
  ["AI_QUOTA_EXCEEDED", { reason: "만들기 한도를 다 썼습니다. 한도가 돌아온 뒤 이 섹션만 다시 만들어 주세요.", retryable: false }],
  ["AI_PROVIDER_UNAVAILABLE", { reason: "이미지를 만드는 쪽이 잠시 응답하지 않았습니다. 잠시 후 이 섹션만 다시 만들어 주세요.", retryable: true }],
  ["AI_KEY_MISSING", { reason: "이미지 열쇠가 설정되지 않았습니다. 설정을 확인한 뒤 다시 만들어 주세요.", retryable: false }],
  ["AI_KEY_INVALID", { reason: "이미지 열쇠가 올바르지 않습니다. 설정을 확인한 뒤 다시 만들어 주세요.", retryable: false }],
  ["AI_MODEL_ACCESS_DENIED", { reason: "고른 모델을 쓸 수 없습니다. 다른 모델로 이 섹션만 다시 만들어 주세요.", retryable: false }],
  ["PDP_IMAGE_QA_REJECTED", { reason: "만들어진 그림이 검수를 통과하지 못했습니다. 장면 지시를 손본 뒤 다시 만들어 주세요.", retryable: true }],
  ["INVALID_IMAGE_PAYLOAD", { reason: "보낸 이미지를 읽지 못했습니다. 원본 사진을 다시 올려 주세요.", retryable: false }],
  /*
    **이 둘은 그림이 아니라 기록이 실패한 것이다.**

    `artifact_upload_failed` 는 그림은 나왔는데 저장소에 못 올린 경우다
    (`lib/pdp/jobs/recorder.ts`). 사용자 쪽에서는 결과가 같다 — 되찾을 그림이
    없다. 그래도 **다시 만들면 나올 가능성이 높다**고 말해야 한다.
  */
  ["artifact_upload_failed", { reason: "그림은 만들어졌지만 보관하지 못했습니다. 이 섹션만 다시 만들어 주세요.", retryable: true }],
  ["unknown_error", { reason: "까닭을 알 수 없습니다. 이 섹션만 다시 만들어 보세요.", retryable: true }],
]);

const 모르는까닭 = { reason: "까닭을 알 수 없습니다. 이 섹션만 다시 만들어 보세요.", retryable: true };

/**
 * 되찾은 작업에서 **안 만들어진 장**을 화면에 그릴 줄로 바꾼다.
 *
 * 거르는 것 셋:
 *   - 그림이 있는 항목 (실패가 아니다)
 *   - **지금 화면에 이미 그림이 있는 섹션** (그 뒤에 다시 만들어 성공했다)
 *   - 지금 구성안에 없는 섹션 (그 사이 구성을 바꿨다. 가리킬 자리가 없다)
 *
 * 두 번째가 중요하다. 안 거르면 **다 만들고도 「실패 1장」이 남는다** —
 * 리디자인 쪽이 이미 겪은 일이다(`redesign/failed-sections.ts` 의
 * `mergeFailedSections`).
 */
export function recoveredFailureLines(
  items: readonly RecoveredFailureItem[] | undefined | null,
  sections: readonly SectionBlueprint[] | undefined | null,
): RecoveredFailureLine[] {
  if (!Array.isArray(items)) return [];

  const 빈섹션 = new Map<string, SectionBlueprint>();
  for (const section of sections ?? []) {
    if (section && !section.generatedImage) 빈섹션.set(section.section_id, section);
  }

  return items
    .filter((item): item is RecoveredFailureItem => Boolean(item) && typeof item === "object")
    .filter((item) => !item.url && 빈섹션.has(item.sectionId))
    .map((item) => {
      const section = 빈섹션.get(item.sectionId)!;
      const found = 까닭.get(String(item.errorCode ?? "").trim()) ?? 모르는까닭;
      return {
        // 이름이 없으면 번호로 가리킨다. 둘 다 없으면 아래에서 버린다.
        label: String(section.section_name ?? "").trim() || String(section.section_id ?? "").trim(),
        reason: found.reason,
        retryable: found.retryable,
      };
    })
    .filter((line) => Boolean(line.label));
}
