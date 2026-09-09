import "server-only";

/** AI 공급자 키는 이 서버 전용 어댑터에서만 환경변수로 읽는다. */

function env(name: string): string | undefined {
  const trimmed = process.env[name]?.trim();
  return trimmed ? trimmed : undefined;
}

/** 리디자인 OpenAI: 빈 문자열이면 core의 기존 설정 오류 처리를 사용한다. */
export function resolveOpenaiKey(): string {
  return env("OPENAI_API_KEY") || "";
}

/** 리디자인 Google. */
export function resolveGoogleKey(): string {
  return env("GOOGLE_API_KEY") || "";
}
