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

  /**
   * **고른 것을 실제로 넘긴다.**
   *
   * 2026-09-18 에 이것이 빠져 있었다. 드롭다운은 값을 받아 되돌려주기만 하고,
   * 기획은 환경변수가 정한 모델로 갔다 — **고르는 척만 하는 화면**이었다.
   * 타입도 시험도 조용했다. 「고른 값을 쓴다」는 어디에도 안 적혀 있었으니까.
   */
  it("고른 글 모델을 기획에 넘긴다", () => {
    expect(generate).toMatch(/runPlan\([\s\S]{0,200}textModel/);
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

describe("화면과 서버가 같은 기본값을 쓴다", () => {
  const load = readFileSync(new URL("../../../easy/_components/load.ts", import.meta.url), "utf8");

  /**
   * **비율이 두 벌이면 값이 갈린다.**
   *
   * 화면은 `EASY_RATIO` 로 값을 세고(`cost.ts`), 서버는 `RATIO` 로 만든다.
   * 갈리면 **화면이 말하는 값과 실제로 깎이는 값이 다르다** — 사용자가 보는
   * 유일한 값 정보가 거짓이 된다.
   */
  it("비율이 같다", () => {
    const 서버 = generate.match(/const RATIO = "([^"]+)"/)?.[1];
    const 화면 = load.match(/export const EASY_RATIO = "([^"]+)"/)?.[1];

    expect(서버, "서버의 비율을 못 찾았다").toBeTruthy();
    expect(화면, "화면의 비율을 못 찾았다").toBeTruthy();
    expect(화면).toBe(서버);
  });

  /** 한 줄에 한 장이다(설계 §9). 값 셈도 그 수로 한다. */
  it("장수가 하나다", () => {
    expect(generate).toContain("const VARIANTS = 1;");
  });
});

/**
 * **값이 나가기 전에 가른다** (2026-09-21 사용자 — 「꼭 이미지만이 아니라
 * 사용자와 AI 가 대화 할 수 있어야 합니다」).
 *
 * 그전에는 친 말이 전부 그림 주문이었다. 「안녕하세요」 한 마디에 그림값이
 * 나갔다. 가르는 자리가 세 라우트를 부르기 **앞**에 있어야 그 일이 안 난다.
 */
describe("말과 주문을 가르는 자리", () => {
  it("가르는 판단을 라우트 안에 두지 않는다", () => {
    // 판단은 `app/easy/chat.ts` 가 값으로 잰다. 여기 있으면 못 잰다.
    expect(generate).toContain('from "../../../easy/chat"');
    expect(generate).toContain("readEasyDecision");
  });

  it("프로젝트를 만들기 전에 가른다", () => {
    const 가르는곳 = generate.indexOf("readEasyDecision");
    const 만드는곳 = generate.indexOf("await createProject(");

    expect(가르는곳).toBeGreaterThan(0);
    expect(만드는곳).toBeGreaterThan(0);
    expect(가르는곳).toBeLessThan(만드는곳);
  });

  it("말로 답한 턴은 그림을 만들지 않고 끝낸다", () => {
    const 말갈래 = generate.slice(
      generate.indexOf('decision.wants === "talk"'),
      generate.indexOf("await createProject("),
    );

    expect(말갈래).toContain("talked: true");
    expect(말갈래).toContain('role: "assistant"');
    expect(말갈래).toContain("return Response.json");
  });
});

/**
 * **대신 부르는 단계마다 다른 요청 식별자** (2026-09-21 운영 409).
 *
 * 세 라우트 중 **둘이 각자 예약한다.** 예약은 같은 식별자를 두 번 받으면
 * `duplicate_request` 로 거절하므로, 원래 헤더를 그대로 물려주면 두 번째
 * 단계가 반드시 막힌다. 로컬에서는 인증 우회가 예약보다 먼저 지나가 안
 * 드러난다 — 글자로 잰다.
 */
describe("대신 부를 때의 요청 식별자", () => {
  it("헤더를 통째로 넘기지 않는다", () => {
    expect(generate).not.toContain("headers: request.headers");
    expect(generate).toContain("stepIdempotencyKey");
  });

  it("세 단계에 서로 다른 이름을 준다", () => {
    const 단계들 = [...generate.matchAll(/relay\([\s\S]*?\}?,\s*"([a-z]+)"\)/g)].map((found) => found[1]);

    expect(단계들.length).toBe(3);
    expect(new Set(단계들).size).toBe(3);
  });
});
