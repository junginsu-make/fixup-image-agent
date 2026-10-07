import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 카드뉴스·이미지 만들기가 캐릭터를 불러올 때, 라이브러리에 없는 각도가 있으면
 * **원본에서 다시 채운 뒤 다시 찾는다**(2026-10-07).
 */
const sns = readFileSync(new URL("../../sns/_components/attachment-picker.tsx", import.meta.url), "utf8");
const poster = readFileSync(new URL("../../poster/_components/reference-picker.tsx", import.meta.url), "utf8");

function pickBody(source: string): string {
  const at = source.indexOf("async function pickCharacter(");
  expect(at).toBeGreaterThan(-1);
  // 파일마다 줄바꿈이 다르다(CRLF·LF). 못 찾으면 파일 끝까지 읽어 다른 함수가 섞인다.
  const rest = source.slice(at);
  const end = /\r?\n {2}\}\r?\n/.exec(rest);
  expect(end).not.toBeNull();
  return rest.slice(0, end!.index);
}

describe.each([["카드뉴스", sns], ["이미지 만들기", poster]])("%s", (_name, source) => {
  it("없는 각도만 채워 달라고 하고, 다시 읽은 목록에서 다시 찾는다", () => {
    const body = pickBody(source);
    expect(body).toContain("matchWithRestore({");
    expect(body).toContain("restore: restoreMissingAngles");
  });

  it("다시 채우는 동안에는 한 번 더 고르지 않고, 무엇을 하는지 말한다", () => {
    const body = pickBody(source);
    expect(body).toContain("if (restoring.current) return;");
    expect(body).toContain("원본에서 다시 채우는 중");
  });
});

describe("카드뉴스 — 기다리는 사이 바뀐 첨부", () => {
  it("다시 채운 뒤에는 그 사이 바뀐 첨부를 기준으로 합친다", () => {
    const body = pickBody(sns);
    expect(sns).toContain("const latestAttachments = React.useRef(attachments);");
    expect(body).toContain("latestAttachments.current");
    expect(body).not.toMatch(/onChange\(\[\.\.\.attachments,/);
  });
});
