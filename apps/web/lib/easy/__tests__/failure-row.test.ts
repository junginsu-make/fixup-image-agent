import { describe, expect, it } from "vitest";
import type { EasyStore } from "../store";
import { FAILED_TURN_GENERIC, failureRowBody, failureRowMessage, isFailureRowBody, trackUserTurn } from "../failure-row";
import { EasyStepError } from "../relay";
import { sayBody } from "../../../app/easy/row-marks";

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

  /** 2차 D4 · Review Focus 2 — 일하는 턴은 사용자 줄 → 머리말 줄 → 그림 줄. 머리말 뒤 실패도 남긴다. */
  it("머리말 줄은 답으로 치지 않는다 — 그 뒤 실패해도 실패 안내를 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    await 지킴.store.appendMessage({ conversationId: "c1", role: "assistant", body: sayBody("포스터를 만들겠습니다.") });
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄.map((row) => row.role)).toEqual(["user", "assistant", "assistant"]);
    expect(남긴줄[2]!.body).toBe(failureRowBody("x"));
  });

  it("머리말이 아닌 도우미 줄은 답이다 - 예전 그대로 실패 안내를 안 남긴다", async () => {
    const { 남긴줄, store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "안녕" });
    await 지킴.store.appendMessage({ conversationId: "c1", role: "assistant", body: "안녕하세요" });
    await 지킴.leaveFailure("c1", "x");
    expect(남긴줄).toHaveLength(2);
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

  /** 후속 Task 9 — 라우트가 실패 줄을 남긴 그 사용자 줄이 `typed` 표시 줄인지 알아야 화면에 알린다. */
  it("실패 안내를 남기면 답 못 받은 사용자 줄 글을 돌려준다 — 머리말을 지나도 같다", async () => {
    const { store } = 저장소();
    const 지킴 = trackUserTurn(store);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "세로로;pick=x" });
    await 지킴.store.appendMessage({ conversationId: "c1", role: "assistant", body: sayBody("만들겠습니다.") });
    await expect(지킴.leaveFailure("c1", "x")).resolves.toBe("세로로;pick=x");
    await expect(지킴.leaveFailure("c1", "x")).resolves.toBeUndefined();
  });

  it("실패 안내를 안 남기면 아무것도 돌려주지 않는다 — 말 전 · 답 뒤", async () => {
    const 말전 = trackUserTurn(저장소().store);
    await expect(말전.leaveFailure("c1", "x")).resolves.toBeUndefined();
    const 답뒤 = trackUserTurn(저장소().store);
    await 답뒤.store.appendMessage({ conversationId: "c1", role: "user", body: "안녕" });
    await 답뒤.store.appendMessage({ conversationId: "c1", role: "assistant", body: "안녕하세요" });
    await expect(답뒤.leaveFailure("c1", "x")).resolves.toBeUndefined();
  });

  /** 후속 Task 9 고침 1 — 사용자 줄을 남기기 전에 실패했는지 라우트가 알아야 화면에 알린다. */
  it("이 턴에 사용자 줄을 남겼는지 알려 준다 — 실패 안내를 남긴 뒤에도 그대로다", async () => {
    const { store } = 저장소();
    const 지킴 = trackUserTurn(store);
    expect(지킴.savedUser()).toBe(false);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "assistant", body: "안내" });
    expect(지킴.savedUser()).toBe(false);
    await 지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" });
    expect(지킴.savedUser()).toBe(true);
    await 지킴.leaveFailure("c1", "x");
    expect(지킴.savedUser()).toBe(true);
  });

  it("사용자 줄 저장이 실패하면 남긴 것으로 치지 않는다", async () => {
    const 실패저장소 = { appendMessage: async () => { throw new Error("저장 실패"); } };
    const 지킴 = trackUserTurn(실패저장소 as unknown as ReturnType<typeof 저장소>["store"]);
    await expect(지킴.store.appendMessage({ conversationId: "c1", role: "user", body: "포스터" })).rejects.toThrow();
    expect(지킴.savedUser()).toBe(false);
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

/**
 * 안쪽 포스터 라우트는 모든 예외를 잡아 **날것의 오류 글**을 응답에 싣고, `read()` 가 그것을
 * `EasyStepError` 로 올린다(리뷰 2026-10-06). 그래서 `EasyStepError` 라는 것만으로는 우리가 쓴
 * 말이라고 할 수 없다 — 크레딧 · 권한 정지(우리 멤버십 층이 쓴 글)만 남긴다.
 */
describe("실패 줄에 남길 글 고르기", () => {
  const usage = { remaining: 0, used: 1, reserved: 0 } as never;

  it("크레딧 · 한도 코드가 있으면 그 글을 남긴다", () => {
    expect(failureRowMessage(new EasyStepError("기획", "크레딧이 부족합니다.", 402, false, "credits_required", usage)))
      .toBe("크레딧이 부족합니다.");
    expect(failureRowMessage(new EasyStepError("기획", "한도 초과", 429, false, "quota_exceeded", usage))).toBe("한도 초과");
  });

  it("402 · 403 이면 코드가 없어도 남긴다", () => {
    expect(failureRowMessage(new EasyStepError("기획", "권한이 없습니다.", 403, false))).toBe("권한이 없습니다.");
    expect(failureRowMessage(new EasyStepError("기획", "결제가 필요합니다.", 402, false))).toBe("결제가 필요합니다.");
  });

  it("안쪽 라우트의 500 날것 글은 일반 문장으로 바꾼다", () => {
    expect(failureRowMessage(new EasyStepError("기획", 'relation "poster_projects" does not exist', 500))).toBe(FAILED_TURN_GENERIC);
  });

  it("고치기 라우트의 400 날것 글도 일반 문장으로 바꾼다", () => {
    expect(failureRowMessage(new EasyStepError("고치기", "column x of relation y", 400))).toBe(FAILED_TURN_GENERIC);
  });

  it("EasyStepError 가 아니면 일반 문장이다", () => {
    expect(failureRowMessage(new Error("boom"))).toBe(FAILED_TURN_GENERIC);
    expect(failureRowMessage("문자열")).toBe(FAILED_TURN_GENERIC);
    expect(failureRowMessage(undefined)).toBe(FAILED_TURN_GENERIC);
  });
});
