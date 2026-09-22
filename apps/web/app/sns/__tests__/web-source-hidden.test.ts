import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isWebSourceEnabled } from "../../../lib/sns/feature";
import { SOURCE_CHOICES, sourceChoices } from "../_components/source-input";

/**
 * **카드뉴스 01 내용 — 웹 주소를 숨기고, 고르는 칸을 눈에 띄게** (2026-09-22 사용자 요청).
 *
 * 웹 주소로 가져오기가 작동하지 않았다. 원인은 서버 기록에 안 남아 확정하지 못했다
 * (설계 §1.2 — jsdom 번들링이 가장 유력). 지우지 않고 스위치(`SNS_WEB_SOURCE=1`)로 끈다.
 *
 * 네 갈래가 폭을 채운 납작한 탭이라 무엇을 골랐는지 안 보였다. 제목과 한 줄 설명이
 * 있는 카드로 바꾸고, 고른 카드는 테두리와 체크로 표시한다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("웹 주소 스위치", () => {
  it("기본은 꺼져 있다 — 켜는 것이 명시적이어야 한다", () => {
    expect(isWebSourceEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isWebSourceEnabled({ SNS_WEB_SOURCE: "true" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(isWebSourceEnabled({ SNS_WEB_SOURCE: "1" } as unknown as NodeJS.ProcessEnv)).toBe(true);
  });

  it("꺼져 있으면 고를 수 있는 것은 셋이다", () => {
    expect(sourceChoices(false).map((choice) => choice.kind)).toEqual(["text", "youtube", "question"]);
    expect(sourceChoices(true).map((choice) => choice.kind)).toEqual(["text", "youtube", "web", "question"]);
  });

  it("고르는 칸마다 한 줄 설명이 있다", () => {
    for (const choice of SOURCE_CHOICES) expect(choice.hint.length, choice.kind).toBeGreaterThan(5);
  });

  it("화면이 서버의 스위치를 받는다", () => {
    expect(read("app/sns/new/page.tsx")).toContain("webSource={isWebSourceEnabled()}");
    expect(read("app/sns/new-client.tsx")).toContain("webSource={webSource}");
  });

  /** 화면에서 감추는 것과 안 받는 것은 다르다. 주소만 알면 API 를 직접 부를 수 있다. */
  it("서버도 꺼져 있으면 웹 주소를 받지 않는다", () => {
    const route = read("app/api/sns/projects/route.ts");
    expect(route).toContain('parsed.data.source.kind === "web" && !isWebSourceEnabled()');
  });

  /**
   * 지난 작업을 다시 열 때 웹 주소로 만든 것이면, 고를 칸이 없어 01 이 텅 빈다.
   * 빈 글로 떨어뜨리고 무엇이었는지 알려 준다.
   */
  it("웹 주소로 만든 지난 작업을 다시 열면 빈 글로 두고 알려 준다", () => {
    const client = read("app/sns/new-client.tsx");
    expect(client).toContain('seed.source.kind === "web" && !webSource');
    expect(read("app/sns/_components/source-input.tsx")).toContain("droppedWebUrl");
  });

  /** 02·03 에서 다시 시작하면 01 안내를 못 본 채 빈 내용으로 기획 시작을 누르게 된다(독립 리뷰). */
  it("01 이 비었으면 기획 시작에서 01 로 돌려보내고 까닭을 말한다", () => {
    const client = read("app/sns/new-client.tsx");
    const create = client.slice(client.indexOf("async function createProject()"), client.indexOf("await fetch(\"/api/sns/projects\""));
    expect(create).toContain("if (!sourceDraftValid(source)) {");
    expect(create).toContain('setStep("content");');
  });

  it("단계 설명이 갈래 수를 못 박지 않는다", () => {
    expect(read("app/sns/new-client.tsx")).not.toContain("네 가지 길");
  });

  it("이미 만든 웹 주소 작업을 다시 기획해도 꺼져 있으면 가져오지 않는다", () => {
    expect(read("lib/sns/source-resolver.ts")).toContain("if (!isWebSourceEnabled()) return");
  });

  it("화살표로 옮겨 다닐 수 있다", () => {
    expect(read("app/sns/_components/source-input.tsx")).toContain('event.key === "ArrowRight"');
  });

  it("탭이 아니라 고르는 카드다", () => {
    const input = read("app/sns/_components/source-input.tsx");
    expect(input).toContain('role="radiogroup"');
    expect(input).toContain('role="radio"');
    expect(input).not.toContain("<TabsTrigger");
  });
});
