import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { afterGenerateFailure, ALREADY_RUNNING } from "../generate-recovery";

describe("만들기가 실패했을 때", () => {
  /**
   * 운영에서 난 일: 04 화면에서 만들기를 누르면 409 만 세 번 났다. 서버는
   * 「이미 생성 중」이라고 답하는데 화면은 그 말을 안 듣고 04 에 머물렀다 —
   * 사용자는 **영원히 안 되는 버튼**을 계속 누르게 된다.
   */
  it("이미 생성 중이면 다시 읽는다", () => {
    expect(afterGenerateFailure(ALREADY_RUNNING)).toBe("resync");
    expect(ALREADY_RUNNING).toBe(409);
  });

  /** 그 밖의 실패는 그대로 말한다 — 다시 읽어도 달라질 게 없다. */
  it("다른 실패는 말해 준다", () => {
    for (const status of [400, 401, 402, 404, 500, 503]) {
      expect(afterGenerateFailure(status)).toBe("show-error");
    }
  });

  /** 상태를 못 읽은 경우에도 조용해지면 안 된다. */
  it("상태를 모르면 말해 준다", () => {
    expect(afterGenerateFailure(undefined)).toBe("show-error");
  });

  it("잎 모듈로 남는다", () => {
    const source = readFileSync(new URL("../generate-recovery.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
  });
});

/**
 * 판단은 위에서 값으로 잠갔다. 늘 빠지는 것은 **부르는 줄**이다 —
 * 이 프로젝트에서 여러 번 반복된 모양이라 화면 배선도 함께 잠근다.
 * (이 저장소에는 jsdom 이 없어 문자열로 본다.)
 */
describe("화면이 그 판단을 쓴다", () => {
  const client = readFileSync(
    new URL("../[id]/project-client.tsx", import.meta.url), "utf8",
  );

  it("만들기 실패에서 판단을 부른다", () => {
    expect(client).toContain('if (afterGenerateFailure(status) === "resync") await reload();');
  });

  /** 코드를 안 들고 던지면 409 와 진짜 실패를 구분할 수 없다. */
  it("요청 오류가 상태 코드를 들고 다닌다", () => {
    expect(client).toContain("class ProjectRequestError extends Error");
    expect(client).toContain("readonly status: number");
    expect(client).toContain("payload.message ?? \"프로젝트를 처리하지 못했습니다.\", response.status");
  });

  /**
   * **다시 읽고도 단계를 안 맞추면 헛일이다.** 서버가 「생성 중」이라고 알려
   * 줘도 사용자는 04 에 그대로 남는다.
   */
  it("다시 읽을 때 화면 단계도 맞춘다", () => {
    const reload = client.slice(client.indexOf("const reload"), client.indexOf("React.useEffect"));
    expect(reload).toContain("if (loaded.data.flow) setView(loaded.data.flow.stage);");
  });

  /**
   * **「다시 만들기」에도 같은 구멍이 있었다.** `/cards/[index]` 도 409 로
   * 「다른 카드가 생성 중입니다」를 주는데, 화면은 문구만 적고 넘어갔다.
   */
  it("카드 다시 만들기에서도 판단을 부른다", () => {
    const at = client.indexOf("카드를 다시 만들지 못했습니다.");
    expect(at).toBeGreaterThan(-1);
    expect(client.indexOf('afterGenerateFailure(status) === "resync"', at)).toBeGreaterThan(at);
  });

  /** 오류 문구를 지우면 안 된다 — 무엇이 잘못됐는지 알 길이 없어진다. */
  it("문구를 남긴 뒤에 다시 읽는다", () => {
    const at = client.indexOf("afterGenerateFailure(status)");
    expect(client.lastIndexOf("setMessage(error instanceof Error ? error.message : \"카드를 만들지 못했습니다.\")", at))
      .toBeGreaterThan(-1);
  });
});
