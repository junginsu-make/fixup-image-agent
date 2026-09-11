/**
 * 서버와 주고받는 자잘한 것들 — 설정 읽기, 응답 풀기, 기록 남기기.
 *
 * 화면 파일이 2,589줄이라 떼어 냈다. **동작은 그대로다.**
 */

import type { ServerConfig } from "./redesign-model";
export async function fetchServerConfig(): Promise<ServerConfig> {
  try {
    const response = await fetch("/api/redesign/config");
    if (!response.ok) throw new Error("config fetch failed");
    return await response.json();
  } catch {
    return {
      serverOpenaiKeyConfigured: false,
      serverGoogleKeyConfigured: false,
      knowledgeConfigured: false,
      knowledgeDocuments: 0,
      knowledgeChunks: 0,
      canManageKnowledge: false
    };
  }
}

export async function readApiResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};

  try {
    const data = JSON.parse(text);
    if (data?.usage) window.dispatchEvent(new CustomEvent("studio-usage-updated", { detail: data.usage }));
    return data;
  } catch {
    return {
      error: simplifyPlainTextError(text, response.status)
    };
  }
}

export function simplifyPlainTextError(text: string, status: number) {
  const message = text.trim() || "요청 처리 중 오류가 발생했습니다.";
  if (status === 413 || message.toLowerCase().includes("request entity too large")) {
    return "이미지 데이터가 너무 커서 섹션 수정 요청을 보낼 수 없습니다. 수정용 이미지를 압축해 다시 시도했지만, 계속 실패하면 해당 섹션을 다시 생성해 주세요.";
  }
  return message.slice(0, 500);
}

export function reportClientLog(event: string, payload: Record<string, unknown> = {}) {
  fetch("/api/redesign/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, payload, timestamp: new Date().toISOString() }),
    keepalive: true
  }).catch(() => {
    // Logging must never interrupt generation.
  });
}

