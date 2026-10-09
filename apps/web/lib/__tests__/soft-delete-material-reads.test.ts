import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **회원이 지운 재료를 다시 꺼내는 길이 없다**(2026-10-08 사용자 결정 — 계획 2단계).
 *
 * 참고 이미지·캐릭터는 서버 권한으로 읽는다 — RLS 가 안 막으므로 질의의 `deleted_at` 거르기가 유일한 방어선이다.
 * 목록·단건·지우기·관리자 완전 삭제는 가짜 질의로 따로 잰다(`library-access`, `character-soft-delete`,
 * `copy-references`). 여기는 그 밖의 **작은 읽는 길**이 거르기를 잃지 않았는지 붙잡는다. 하나라도 빠지면 지운
 * 그림이 생성 재료로 실려 나가거나 관리자 라이브러리로 복사된다.
 */
const web = join(__dirname, "..", "..");
const source = (path: string) => readFileSync(join(web, path), "utf8").replace(/\r\n/g, "\n");

/** `from("표")` 부터 다음 `;` 까지 — 한 질의. */
function queriesOn(path: string, table: string): string[] {
  const text = source(path);
  const found: string[] = [];
  let at = text.indexOf(`.from("${table}")`);
  while (at >= 0) {
    const start = text.lastIndexOf("await", at);
    found.push(text.slice(start, text.indexOf(";", at)));
    at = text.indexOf(`.from("${table}")`, at + 1);
  }
  return found;
}

const LIVE = '.is("deleted_at", null)';

describe("작은 읽는 길도 지운 재료를 거른다", () => {
  it("배치 분석이 고른 참고 이미지 바이트", () => {
    expect(queriesOn("lib/layout/library-image.ts", "reference_images").every((query) => query.includes(LIVE))).toBe(true);
  });

  it("상세페이지 스타일 참고로 쓰는 라이브러리 그림", () => {
    const [query] = queriesOn("lib/user-style-references.ts", "reference_images");
    expect(query).toContain(LIVE);
  });

  it("광고 내보내기의 참고 이미지 파일·캐릭터 사본의 「이미 있는 제목」", () => {
    const reads = queriesOn("lib/reference-images.ts", "reference_images");
    expect(reads.find((query) => query.includes('select("storage_path,user_id")'))).toContain(LIVE);
    expect(reads.find((query) => query.includes('select("id").eq("user_id", userId).eq("title", title)'))).toContain(LIVE);
  });

  it("캐릭터 각도 옮기기 — 지운 캐릭터에서도, 지운 캐릭터로도 안 옮긴다", () => {
    const [owned] = queriesOn("lib/character-carry.ts", "characters");
    expect(owned).toContain(LIVE);
  });

  it("관리자의 캐릭터 복사 — 지운 원본은 안 옮기고, 이름 겹침은 살아 있는 것만", () => {
    const reads = queriesOn("app/api/admin/works/store.ts", "characters");
    expect(reads.find((query) => query.includes('select("*").eq("id", id)'))).toContain(LIVE);
    expect(reads.find((query) => query.includes('select("name").eq("user_id", ownerUserId)'))).toContain(LIVE);
  });

  it("새 캐릭터의 이름 겹침 — 지운 이름은 다시 쓴다", () => {
    const [names] = queriesOn("lib/characters.ts", "characters").filter((query) => query.includes('select("name")'));
    expect(names).toContain(LIVE);
  });
});
