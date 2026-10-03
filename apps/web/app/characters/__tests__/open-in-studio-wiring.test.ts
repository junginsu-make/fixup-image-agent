import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAME_LIMIT } from "../opened-character";

/**
 * **내 캐릭터는 도구로, 남의 캐릭터는 보기 전용으로.**
 *
 * jsdom 이 없어 페이지 렌더로는 못 잰다. 찾지 말고 **센다** — 여는 태그와
 * 인자를 한 덩어리로 묶는다(2026-09-16 설계의 가드).
 */
const 읽기 = (...parts: string[]) => readFileSync(join(__dirname, "..", ...parts), "utf8");
const 횟수 = (source: string, pattern: RegExp) => (source.match(pattern) ?? []).length;

describe("과정 보기가 도구를 연다", () => {
  const page = 읽기("[id]", "page.tsx");
  const open = 읽기("[id]", "open-client.tsx");
  const studio = 읽기("CharacterStudio.tsx");

  it("페이지는 여는 갈림길만 그린다", () => {
    expect(횟수(page, /<CharacterOpenClient characterId=\{id\} \/>/g)).toBe(1);
    expect(page).not.toContain("<CharacterDetailClient");
  });

  it("내 것이면 도구, 아니면 보기 전용", () => {
    expect(횟수(open, /<CharacterStudio opened=\{state\.character\} \/>/g)).toBe(1);
    expect(횟수(open, /<CharacterDetailClient characterId=\{characterId\} \/>/g)).toBe(1);
    expect(open).toContain("body.character?.mine === true");
  });

  it("도구가 연 캐릭터를 받아 채우고 알린다", () => {
    expect(studio).toContain("export function CharacterStudio({ opened }: { opened?: OpenedCharacter } = {})");
    expect(횟수(studio, /useOpenedCharacter\(\{/g)).toBe(1);
    expect(횟수(studio, /<OpenedNotice name=\{opened\.name\} front=\{opening\.front\} \/>/g)).toBe(1);
  });

  it("목록을 받기 전에는 null 로 알려 이름을 겹치지 않게 채운다", () => {
    expect(횟수(studio, /takenNames: loading \? null : characters\.map\(\(entry\) => entry\.name\),/g)).toBe(1);
  });

  it("저장한 뒤에도 이름 칸이 그대로면 훅이 다음 이름으로 바꾸도록 칸·결과·setName 을 넘긴다", () => {
    expect(횟수(studio, /currentName: name, createdName: created\?\.name \?\? null, rename: setName,/g)).toBe(1);
  });

  it("저장할 때 이름을 자르는 길이가 새 이름의 길이 상한과 같다", () => {
    const 자르기 = `(chosen.name.trim() || chosen.description).slice(0, ${NAME_LIMIT})`;
    expect(studio.split(자르기)).toHaveLength(2);
  });
});
