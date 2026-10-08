import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **쉽게 모드 채팅의 모양** (2026-09-22 사용자 요청).
 *
 * 1. 채팅 글자를 조금 더 크게.
 * 2. AI 말 앞의 아이콘을 로봇 캐릭터로 — 2026-10-08 사용자 요청으로 도로 뺐다.
 * 3. 대화 목록·대화·결과 사이 선을 도로 옅게 — 대화와 입력칸 사이 선과 같은 색으로.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("채팅 글자", () => {
  const message = read("app/easy/_components/message.tsx");

  it("말풍선 글자가 14px 이 아니라 16px 이다", () => {
    expect(message).not.toMatch(/px-4 py-2\.5 text-sm leading-6/);
    expect((message.match(/text-base leading-7/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("입력칸 글자도 같이 커진다", () => {
    const client = read("app/easy/easy-client.tsx");
    const textarea = client.slice(client.indexOf("<Textarea"), client.indexOf("/>", client.indexOf("<Textarea")));
    expect(textarea).toContain(" text-base ");
    expect(textarea).toContain("md:text-base");
  });
});

describe("로봇 그림", () => {
  /**
   * **쉽게 · 무엇이든 물어보세요 앞의 로봇 그림을 지운다** (2026-10-08 사용자).
   * 2026-09-22 에 말풍선 앞에 붙였던 캐릭터를 걷어 낸다.
   */
  it("쉽게 대화에 로봇 그림이 없다", () => {
    const message = read("app/easy/_components/message.tsx");
    expect(message).not.toContain("assistant.webp");
    expect(message).not.toContain("AssistantMark");
  });

  it("무엇이든 물어보세요 단추에 로봇 그림이 없다", () => {
    expect(read("app/_components/cs-panel.tsx")).not.toContain("assistant.webp");
  });

  it("쓰지 않는 그림 파일도 남기지 않는다", () => {
    expect(existsSync(join(web, "public/easy/assistant.webp"))).toBe(false);
  });
});

describe("칸 사이 선", () => {
  /** 입력칸 위 구분선(`border-t border-border`)과 같은 색이다. */
  it("대화와 입력칸 사이 선과 같은 옅은 색이다", () => {
    const handle = read("app/easy/_components/split-handle.tsx");
    expect(handle).not.toContain("bg-subtle-foreground/45");
    expect(handle).toContain("w-px -translate-x-1/2 bg-border");
    expect(read("app/easy/easy-client.tsx")).toContain('className="border-t border-border bg-background"');
  });
});
