import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 캐릭터 만들기 화면의 **칸 높이**(2026-10-07 사용자 보고)와 **자동 저장**(2026-10-08).
 *
 * 이 저장소에는 jsdom 이 없어 화면을 그려 잴 수 없다. 화면 코드의 문장을 직접 본다.
 */
const source = readFileSync(new URL("../CharacterStudio.tsx", import.meta.url), "utf8");

/** `marker` 가 든 JSX 요소(`tag`)의 className 값을 낱말로 나눠 돌려준다. */
function classesOf(marker: string, tag: string): string[] {
  const at = source.indexOf(marker);
  expect(at).toBeGreaterThan(-1);
  const start = source.lastIndexOf(`<${tag}`, at);
  const open = source.indexOf('className="', start) + 'className="'.length;
  return source.slice(open, source.indexOf('"', open)).split(/\s+/).filter(Boolean);
}

/**
 * 남는 높이를 나눠 갖거나 0 까지 줄어드는 낱말. 이것이 있으면 모니터가 낮을 때
 * 칸이 줄어 아래 것과 겹친다.
 */
const SHRINKING = ["flex-1", "min-h-0"];

describe("묘사 칸 — 화면 크기에 따라 줄거나 사라지지 않는다", () => {
  it("묘사 칸을 감싼 줄은 남는 높이를 나눠 갖지 않는다(줄어들어 아래 칸과 겹쳤다)", () => {
    const label = classesOf('<span className="flex-none text-meta text-subtle-foreground">무엇을 만들까요</span>', "label");
    for (const word of SHRINKING) expect(label).not.toContain(word);
    expect(label).toContain("flex-none");
  });

  it("글상자는 정해진 높이다", () => {
    const textarea = classesOf("value={description}", "Textarea");
    for (const word of SHRINKING) expect(textarea).not.toContain(word);
    expect(textarea).toContain("h-40");
  });
});

/*
  **256px(h-64)다.** 화면 칸의 가장 낮은 높이(30rem)에서 오른쪽 칸 내용에 남는
  높이가 약 344px 이다. 320px 이면 아래 저장 단추가 칸 밖으로 밀려 굴려야 보인다
  (2026-10-07 리뷰). 가운데 칸도 그림 아래 역할 단추가 가려지지 않게 같다.
*/
describe("그림 자리 — 가운데·오른쪽 칸도 줄어들어 단추와 겹치지 않는다", () => {
  it("오른쪽 「이번에 만드는 것」 정면 자리는 정해진 높이다", () => {
    const box = classesOf("busy === \"candidates\" ? (", "div");
    for (const word of SHRINKING) expect(box).not.toContain(word);
    expect(box).toContain("h-64");
  });

  it("가운데 「참고할 그림」 붙인 그림 자리는 정해진 높이다", () => {
    const box = classesOf('aria-label="첨부한 그림 크게 보기"', "button");
    for (const word of SHRINKING) expect(box).not.toContain(word);
    expect(box).toContain("h-64");
  });
});

/**
 * **자동 저장**(2026-10-08 사용자 요청). 정면이 나오면 서버가 그 자리에서 캐릭터로 저장한다.
 * 「캐릭터 저장하기」 단추는 없앴다 — 누르지 않고 나가면 크레딧을 낸 정면이 어디에도 안 남았다.
 * 자동 저장이 실패한 때만 「다시 저장하기」가 나온다.
 */
function block(start: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  return source.slice(from, source.indexOf("\n  };", from));
}

describe("자동 저장", () => {
  it("「캐릭터 저장하기」 단추가 없다", () => {
    expect(source).not.toMatch(/^\s*캐릭터 저장하기\s*$/m);
  });

  it("정면을 만들 때 이름을 함께 보내고, 서버가 저장한 캐릭터를 받는다", () => {
    const make = block("const handleCandidates = async () => {");
    expect(make).toMatch(/step: "candidates"[^}]*name/);
    expect(make).toContain("savedId: body.character?.id");
    expect(make).toContain("body.saveError");
  });

  it("저장 단추는 저장된 캐릭터가 없을 때만 나온다", () => {
    const at = source.indexOf('chosen.saveFailed ? "다시 저장하기"');
    expect(at).toBeGreaterThan(-1);
    expect(source.slice(source.lastIndexOf("{chosen && !chosen.savedId", at), at)).toContain("handleCreate(false)");
  });

  /** 「과정 보기」로 연 캐릭터는 실패한 적이 없다. 「다시」 라고 쓰면 실패로 읽힌다(독립 리뷰). */
  it("「다시 저장하기」는 자동 저장이 실패했을 때만, 연 캐릭터는 「새 캐릭터로 저장하기」", () => {
    expect(source).toContain('chosen.saveFailed ? "다시 저장하기" : "새 캐릭터로 저장하기"');
    expect(block("const handleCandidates = async () => {")).toContain("saveFailed: !body.character");
  });

  /**
   * **한 장씩 따로 처리한다**(독립 리뷰). 한 장이 끊겨도 남은 장을 마저 하고, 끝나면 늘 목록을
   * 다시 읽는다. 성공한 장은 고른 것에서 빼 — 다시 눌러 같은 값을 또 내지 않게 한다. 크레딧이
   * 모자라면 남은 장도 어차피 거절되므로 멈추고 그 까닭을 말한다.
   */
  it("더 만들기 — 한 장씩 따로, 크레딧 부족이면 멈춤, 성공한 장은 빼고, 끝나면 늘 다시 읽는다", () => {
    const extend = block("const handleExtend = async () => {");
    expect(extend).toMatch(/for \(const angle of jobs\) \{\s*try \{/);
    expect(extend).toContain("if (isCreditShortage(body.code)) { setPending([]); break; }");
    expect(extend).toContain("body.message");
    expect(extend).toMatch(/setPickedAngles\(\(current\) => current\.filter\(\(angle\) => !made\.includes\(angle\)\)\)/);
    const loopEnd = extend.indexOf("const refreshed = await load()");
    expect(loopEnd).toBeGreaterThan(extend.indexOf("for (const angle of jobs)"));
  });

  it("지운 캐릭터에 더 만들지 않는다", () => {
    expect(block("const handleDelete = async (character: Character) => {")).toContain("chosen?.savedId === character.id");
  });

  it("참고 이미지에 못 넣었으면 말한다", () => {
    expect(block("const handleCandidates = async () => {")).toContain("body.referenceIssue");
  });

  it("더 만들기는 저장된 캐릭터에 각도를 더한다", () => {
    const extend = block("const handleExtend = async () => {");
    expect(extend).toContain("addAngle({ characterId: chosen.savedId");
    // 한 장을 더하는 길은 「다시 만들기」가 쓰던 그 주소다.
    const start = source.indexOf("async function addAngle(");
    const add = source.slice(start, source.indexOf("\n}\n", start));
    expect(add).toContain('"/api/characters/views"');
    expect(source).toContain("장 더 만들기`");
    expect(source).not.toContain("장 더 만들고 저장");
  });
});

