import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * **새 생성 경로를 만들지 않는다** (설계 §8).
 *
 * 2026-09-02 설계가 못 박았고 그 까닭은 여전하다 — 같은 일을 하는 기계가 둘이
 * 되면 실측으로 다듬은 문구를 양쪽에 유지해야 하고, 하나는 곧 낡는다.
 *
 * 2026-09-17~18 하루 종일 고친 것이 전부 그 문구들이다(첨부 지시 우선순위,
 * 「없음」을 적지 말 것, 글자를 넣을지, 연출을 재료로 쓸 것). 사본이 생기면 그
 * 사본은 오늘 고친 것을 하나도 모른다.
 *
 * **글로 지킬 수 없다.** 다음 사람이 「여기서 fal 을 한 번만 부르면 빠른데」로
 * 시작하는 것을 막는 것은 이 시험이다.
 */

const generate = readFileSync(new URL("../generate/route.ts", import.meta.url), "utf8");

describe("그림 만드는 길", () => {
  it("기존 포스터 라우트 셋을 부른다", () => {
    expect(generate).toContain('from "../../poster/projects/route"');
    expect(generate).toContain('from "../../poster/projects/[id]/plan/route"');
    expect(generate).toContain('from "../../poster/projects/[id]/generate/route"');
  });

  /**
   * **그림을 여기서 만들지 않는다.** fal 을 직접 부르거나 프롬프트를 직접
   * 조립하면 사본이 생긴 것이다.
   */
  it("fal 을 직접 부르지 않는다", () => {
    expect(generate).not.toContain("fal.subscribe");
    expect(generate).not.toContain("fal.queue");
    expect(generate).not.toContain("createFalQueueClient");
  });

  it("프롬프트를 직접 조립하지 않는다", () => {
    expect(generate).not.toContain("buildPosterPrompt");
    expect(generate).not.toContain("promptImagesFrom");
  });

  it("기획을 직접 돌리지 않는다", () => {
    expect(generate).not.toContain("planPoster");
    expect(generate).not.toContain("readAttachments");
  });

  /**
   * **여기서 기다리지 않는다.** 마지막 라우트는 제출만 한다 — 결과는 화면이
   * 기존 `status` 라우트에 물어 받는다. 여기서 기다리면 요청이 몇 분 열려 있고,
   * 그 사이 화면을 떠난 사람은 결과를 잃는다.
   */
  it("결과를 기다리지 않고 제출 정보를 돌려준다", () => {
    expect(generate).toContain("submission: submitted.submission");
    expect(generate).not.toContain("setTimeout");
  });
});

describe("고른 모델을 믿지 않는다", () => {
  /**
   * 목록에 없는 id 가 오면 기본으로 떨어진다. **값을 모르는 모델을 부르면
   * 원가를 못 세고, 셈이 틀린 채로 돌아간다**(설계 §5-2).
   */
  it("글 모델을 목록으로 거른다", () => {
    expect(generate).toContain("resolveTextModel(");
  });
});

describe("실패를 가려 말한다", () => {
  /**
   * **오류를 뭉개지 않는다**(설계 §5-3). 「문제가 생겼습니다」로 덮으면 사용자는
   * 무엇을 고쳐야 할지 모르고, 같은 것을 또 눌러 값만 나간다.
   */
  it("어느 단계에서 실패했는지 알린다", () => {
    expect(generate).toContain("step: error.step");
  });

  /**
   * **크레딧·권한이면 다시 만들기를 안 낸다**(설계 §5-3 의 표). 눌러도 또
   * 막히는데 단추를 내면 사용자가 헛수고를 한다.
   */
  it("다시 눌러도 막히는 실패를 가린다", () => {
    expect(generate).toContain("retryable");
    expect(generate).toMatch(/402[\s\S]{0,40}403/);
  });
});

describe("대화에 남긴다", () => {
  /** 아래가 실패해도 무엇을 하려 했는지는 대화에 있어야 한다. */
  it("사용자 말을 먼저 남긴다", () => {
    const 말남김 = generate.indexOf('role: "user"');
    const 프로젝트 = generate.indexOf("createProject(");

    expect(말남김).toBeGreaterThan(0);
    expect(말남김, "프로젝트를 만든 뒤에 남기면 실패하면 말이 사라진다")
      .toBeLessThan(프로젝트);
  });

  /** 제목은 첫 프롬프트로 한 번만. LLM 을 또 부르지 않는다(설계 §4-1). */
  it("제목이 비어 있을 때만 짓는다", () => {
    expect(generate).toContain("if (!conversation.title)");
    expect(generate).toContain("easyTitle(prompt)");
  });
});
