import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **쉽게 모드 채팅의 모양** (2026-09-22 사용자 요청).
 *
 * 1. 채팅 글자를 조금 더 크게.
 * 2. AI 말 앞의 아이콘을 로봇 캐릭터로 — 다 보일 필요는 없고 그 캐릭터가 답하는 것처럼.
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

describe("AI 캐릭터", () => {
  const message = read("app/easy/_components/message.tsx");

  it("반짝이 아이콘 대신 캐릭터 그림을 쓴다", () => {
    expect(message).not.toContain("<Sparkles");
    expect(message).toContain('src="/easy/assistant.webp"');
    expect(existsSync(join(web, "public/easy/assistant.webp"))).toBe(true);
  });

  /** 장식이다. 낭독기가 말풍선마다 「로봇」을 읽으면 대화가 안 들린다. */
  it("장식이라 낭독기에 안 읽힌다", () => {
    expect(message).toMatch(/src="\/easy\/assistant\.webp"[\s\S]{0,200}alt=""/);
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
