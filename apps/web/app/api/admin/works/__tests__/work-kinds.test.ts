import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 관리자 통로가 **어떤 갈래를 아는가.**
 *
 * 읽기와 복사는 같은 갈래를 알아야 한다. 한쪽에만 갈래를 더하면 「보이는데
 * 복사가 안 되는」 상태가 되고, 화면은 복사 단추를 낸 채로 404 를 받는다 —
 * 이 저장소가 카드뉴스에서 이미 겪은 모양이다(「보이는데 못 여는」 상태).
 *
 * **찾지 말고 센다.** 갈래 하나가 빠져도 `toContain` 은 초록으로 남는다.
 */
const ROOT = join(__dirname, "..", "[kind]", "[id]");

const KINDS = ["sns", "poster", "character", "library"] as const;

function kindsOf(file: string): string[] {
  const source = readFileSync(join(ROOT, file), "utf8");
  /*
    관문 뒤의 `kind !== "..."` 줄이 허용 목록이다. 이 한 줄이 갈래를 정하므로
    여기서 읽는다 — 따로 적어 두면 그 둘이 어긋난다.
  */
  return [...source.matchAll(/kind !== "([a-z]+)"/g)].map((match) => match[1] as string);
}

describe("관리자 통로의 갈래", () => {
  it.each([["route.ts"], ["copy/route.ts"]])("%s 가 네 갈래를 모두 안다", (file) => {
    expect(kindsOf(file).sort()).toEqual([...KINDS].sort());
  });

  it("읽기와 복사가 같은 갈래를 안다", () => {
    /*
      **같아야 한다.** 읽을 수 있는 것만 복사할 수 있고, 복사할 수 있는 것은
      읽을 수 있어야 한다. 어긋나면 화면이 낸 단추가 404 를 받는다.
    */
    expect(kindsOf("route.ts").sort()).toEqual(kindsOf("copy/route.ts").sort());
  });

  it("갈래마다 실제로 하는 일이 있다", () => {
    /*
      허용 목록에만 이름을 더하고 분기를 안 만들면, 그 갈래는 관문을 지나
      엉뚱한 표를 읽는다. `library` 를 더했는데 분기가 없으면 카드뉴스 표를
      읽게 된다.
    */
    const read = readFileSync(join(ROOT, "route.ts"), "utf8");
    expect(read).toContain('kind === "character"');
    expect(read).toContain('kind === "library"');
    expect(read).toContain("readAnyLibraryWork(id)");

    const copy = readFileSync(join(ROOT, "copy/route.ts"), "utf8");
    expect(copy).toContain('kind === "character"');
    expect(copy).toContain('kind === "library"');
    expect(copy).toContain("copyLibraryWorkToSelf(id, auth.member.userId)");
  });

  it("복사는 소유자를 세션에서만 가져온다", () => {
    /*
      본문을 읽으면 언젠가 그 값이 소유자로 쓰이고, 그때 **남의 이름으로**
      작업이 생긴다. 갈래가 늘어도 이 규칙은 그대로다.
    */
    const copy = readFileSync(join(ROOT, "copy/route.ts"), "utf8");
    expect(copy).not.toContain("request.json()");
    const owners = copy.match(/auth\.member\.userId/g) ?? [];
    expect(owners.length).toBe(3);
  });
});
