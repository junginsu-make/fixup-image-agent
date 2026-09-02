import { describe, expect, it } from "vitest";
import { OPENING_MESSAGE, TURN_SCHEMA, buildTurnInstruction, runTurn } from "../turn";
import type { Intake } from "../intake";

const fake = (payload: unknown) => ({
  async generate() { return payload; },
});

describe("첫 인사", () => {
  it("무엇을 만들지 묻고, 어떻게 주면 되는지 알려 준다", () => {
    // 빈 입력창만 있으면 사용자는 무엇을 적어야 할지 모른다.
    expect(OPENING_MESSAGE).toMatch(/카드뉴스|포스터/);
    expect(OPENING_MESSAGE).toMatch(/유튜브|주소/);
  });
});

describe("LLM 에게 주는 지시", () => {
  it("우리가 무엇을 만들 수 있는지 알려 준다", () => {
    // 이 LLM 은 범용 상담원이 아니라 우리 스튜디오를 아는 안내자다.
    // 무엇이 가능한지 알아야 사용자에게 제안할 수 있다.
    const instruction = buildTurnInstruction({});
    expect(instruction).toMatch(/카드뉴스/);
    expect(instruction).toMatch(/포스터|광고/);
    expect(instruction).toMatch(/캐릭터/);
    expect(instruction).toMatch(/유튜브/);
  });

  it("아직 비어 있는 칸과 그 이유를 함께 준다", () => {
    const instruction = buildTurnInstruction({ tool: "sns", topic: "세럼 출시" });
    expect(instruction).toContain("내용");
    expect(instruction).toMatch(/유튜브 주소나 웹 주소/);
  });

  it("이미 아는 것은 다시 묻지 말라고 한다", () => {
    const instruction = buildTurnInstruction({ tool: "sns", topic: "세럼 출시" });
    expect(instruction).toContain("세럼 출시");
    expect(instruction).toMatch(/다시 묻지/);
  });

  it("묻는 순서를 정해 주지 않는다", () => {
    // 순서를 못 박으면 LLM 이 서식 채우는 기계가 된다. 흐름은 모델이 정한다.
    const instruction = buildTurnInstruction({ tool: "sns" });
    expect(instruction).not.toMatch(/맨 앞|첫 번째 것부터|순서대로/);
    expect(instruction).toMatch(/순서는 당신이/);
  });

  it("빈 칸 채우기가 목적이 아니라고 말한다", () => {
    // 사용자가 상의하고 싶어할 때 질문만 던지면 대화가 아니라 취조다.
    expect(buildTurnInstruction({})).toMatch(/빈 칸 채우기가 목적이 아닙니다/);
  });

  it("다 모였으면 그만 묻고 넘어가라고 한다", () => {
    const ready: Intake = {
      tool: "sns", topic: "세럼", sourceKind: "text", sourceRef: "본문",
      cardCount: 6, attachmentsDecided: true,
    };
    expect(buildTurnInstruction(ready)).toMatch(/더 묻지 말고|충분/);
  });
});

describe("한 턴 처리", () => {
  const before: Intake = { tool: "sns", topic: "세럼 출시" };

  it("LLM 이 알아낸 것을 기존 것에 얹는다", async () => {
    const result = await runTurn(
      { intake: before, messages: [{ role: "user", text: "6장으로요" }] },
      fake({ reply: "6장으로 하겠습니다.", learned: { cardCount: 6 } }),
    );
    expect(result.intake).toEqual({ tool: "sns", topic: "세럼 출시", cardCount: 6 });
    expect(result.reply).toBe("6장으로 하겠습니다.");
  });

  it("빈 값으로 이미 아는 것을 지우지 않는다", async () => {
    // LLM 이 한 칸만 알아냈다고 나머지를 null 로 돌려보내면 대화가 되감긴다.
    const result = await runTurn(
      { intake: before, messages: [] },
      fake({ reply: "네", learned: { topic: "", cardCount: 6 } }),
    );
    expect(result.intake.topic).toBe("세럼 출시");
  });

  it("아직 모자라면 준비됐다고 하지 않는다", async () => {
    const result = await runTurn(
      { intake: before, messages: [] },
      fake({ reply: "이제 만들 수 있어요!", learned: {} }),
    );
    // LLM 이 뭐라 하든 판단은 코드가 한다.
    expect(result.ready).toBe(false);
    expect(result.missing.map((slot) => slot.id)).toContain("source");
  });

  it("다 모이면 준비됐다고 한다", async () => {
    const result = await runTurn(
      { intake: before, messages: [] },
      fake({
        reply: "정리했습니다.",
        learned: { sourceKind: "text", sourceRef: "본문입니다", cardCount: 6, attachmentsDecided: true },
      }),
    );
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("인물이 필요하다고 알아내면 캐릭터 도구를 함께 권한다", async () => {
    const result = await runTurn(
      { intake: before, messages: [] },
      fake({ reply: "인물이 필요하시군요.", learned: { needsPerson: true, hasPersonImage: false } }),
    );
    expect(result.suggestion?.href).toBe("/characters");
  });

  it("모델이 이상한 값을 주면 무시하고 대화를 잇는다", async () => {
    const result = await runTurn(
      { intake: before, messages: [] },
      fake({ reply: "네", learned: { cardCount: "여섯" as unknown as number, tool: "영상" } }),
    );
    expect(result.intake.cardCount).toBeUndefined();
    expect(result.intake.tool).toBe("sns");
  });

  it("답이 아예 비어 있으면 다시 묻는 말을 돌려준다", async () => {
    const result = await runTurn({ intake: before, messages: [] }, fake({}));
    expect(result.reply.length).toBeGreaterThan(0);
  });
});

describe("받을 답의 모양", () => {
  it("스키마에 reply 와 learned 가 있다", () => {
    const properties = (TURN_SCHEMA.schema as { properties: Record<string, unknown> }).properties;
    expect(properties).toHaveProperty("reply");
    expect(properties).toHaveProperty("learned");
  });
});
