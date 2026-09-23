/**
 * **봇이 물어볼 수 있는 것의 전부.**
 *
 * ── 왜 목록인가 ────────────────────────────────────────────
 *
 * 계정 경계의 핵심이다(설계 §4). LLM 이 고르는 것은 **「무엇을 알고
 * 싶은가」뿐**이고, **「누구 것인가」는 고를 수 없다.** 누구인지는 세션이
 * 정한다.
 *
 * 말로 뚫으려 해도 안 되는 까닭이 여기 있다 —
 *
 *   「other@example.com 크레딧 알려줘」
 *     → LLM 은 `balance` 를 고른다
 *     → 읽기 함수는 **내 userId** 로 읽는다
 *     → 남의 것을 읽을 길이 없다
 *
 * **여기 없는 것은 봇이 볼 수 없다.** 회원 목록도, 남의 사용량도, 집계도
 * 없다. 없는 기능은 프롬프트로 열 수 없다.
 */

export const ACCOUNT_TOPICS = ["balance", "plan", "usage", "failures"] as const;

export type AccountTopic = (typeof ACCOUNT_TOPICS)[number];

/** 무엇을 묻는지 사람 말로. LLM 에게 고르라고 줄 설명이다. */
export const TOPIC_HINT: Record<AccountTopic, string> = {
  balance: "남은 크레딧·처리 중인 수·만료일",
  plan: "지금 쓰는 구독 플랜과 남은 날짜",
  usage: "이번 달 얼마나 썼는지",
  failures: "최근 실패한 작업과 그 까닭",
};

export function isAccountTopic(value: unknown): value is AccountTopic {
  return typeof value === "string" && (ACCOUNT_TOPICS as readonly string[]).includes(value);
}

/**
 * 모르는 이름을 버린다.
 *
 * **LLM 이 만들어 낸 이름을 그대로 쓰지 않는다.** 구조화 응답이라도 목록 밖
 * 값이 오는 일이 있고(이 저장소가 두 번 겪었다), 그때 조용히 넘어가면 읽기
 * 함수가 엉뚱한 갈래를 탄다.
 */
export function keepKnownTopics(values: unknown): AccountTopic[] {
  if (!Array.isArray(values)) return [];
  const 고른것 = values.filter(isAccountTopic);
  // 같은 것을 여러 번 골라도 한 번만 읽는다.
  return [...new Set(고른것)];
}
