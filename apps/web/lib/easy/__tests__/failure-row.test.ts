import { describe, expect, it } from "vitest";
import type { EasyStore } from "../store";
import { FAILED_TURN_GENERIC, failureRowBody, isFailureRowBody, trackUserTurn } from "../failure-row";

/**
 * **실패도 대화에 남긴다**(2026-10-06 설계 B4). 실패한 턴은 새로고침하면 내 말만 남고
 * 답이 없었다 — 화면에만 오류를 보였기 때문이다.
 */
type Input = Parameters<EasyStore["appendMessage"]>[0];

function 저장소(실패 = false) {
  const 남긴줄: Input[] = [];
  return {
    남긴줄,
    store: {
      appendMessage: async (input: Input) => {
        if (실패 && input.role === "assistant") throw new Error("저장 실패");
        남긴줄.push(input);
        return {
          id: `m${남긴줄.length}`, conversationId: input.conversationId, role: input.role,
          body: input.body ?? "", workId: null, createdAt: "",
        };
      },
    },
  };
}

describe("실패 안내 줄 (B4)", () => {
  it("사용자 말을 남긴 뒤 실패하면 실패 안내를 도우미 줄로 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.leaveFailure("c1", "기획이 막혔습니다.");
    expect(남긴줄.map((row) => [row.role, row.body])).toEqual([
      ["user", "포스터"], ["assistant", failureRowBody("기획이 막혔습니다.")],
    ]);
  });

  it("말을 남기기 전에 실패했으면 아무것도 안 남긴다 — 묻거나 멈춘 턴과 같다", async () => {
    const { 남긴줄, store } = 저장소();
    await trackUserTurn(store).leaveFailure("c1", "x");
    expect(남긴줄).toEqual([]);
  });

  it("답 줄을 이미 남겼으면 또 남기지 않는다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.store.appendMessage({ conversationId: "c1", role: "image", workId: "p1" });
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "image"]);
  });

  it("두 번 불러도 한 번만 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.leaveFailure("c1", "x");
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄).toHaveLength(2);
  });

  it("실패 안내를 못 남겨도 던지지 않는다 — 원래 오류를 덮지 않는다", async () => {
    const { store } = 저장소(true);
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await expect(지킴.leaveFailure("c1", "x")).resolves.toBeUndefined();
  });

  it("안내 글은 사용자가 본 말을 그대로 담는다", () => {
    expect(failureRowBody("크레딧이 없습니다.")).toBe("요청을 처리하지 못했습니다. 크레딧이 없습니다.");
  });

  /** 최종 리뷰(2026-10-06): 우리가 알고 낸 실패가 아니면 내부 글 대신 이 말을 남긴다. */
  it("일반 실패 문장", () => {
    expect(failureRowBody(FAILED_TURN_GENERIC)).toBe("요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.");
  });

  it("실패 안내 줄을 글로 알아본다", () => {
    expect(isFailureRowBody(failureRowBody("x"))).toBe(true);
    expect(isFailureRowBody("요청을 처리했습니다.")).toBe(false);
  });
});
