import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CS_CONTACT_LINE, CS_EMAIL } from "../contact";
import { HANDOFF, NEEDS_LOGIN, NO_EVIDENCE } from "../answer";

/**
 * **못 답하면 갈 곳을 알려 준다**(2026-09-28 사용자 지시).
 *
 * > AI 가 답변을 못하는 것들은 메일로 문의하라고 정확히 안내해줘야 합니다.
 *
 * ── 여기서 재는 것 ─────────────────────────────────────────
 *
 * 둘이다.
 *   ① **못 답할 때 반드시 갈 곳이 붙는가**
 *   ② **보여 주는 주소와 메일이 가는 주소가 같은가**
 *
 * ②가 특히 중요하다. 둘이 갈라지면 사용자는 화면에 적힌 곳으로 보내고
 * 담당자는 다른 곳을 본다. **문의가 조용히 사라진다** — 아무도 오류를 안
 * 보고, 보낸 사람은 답을 기다린다.
 */

const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("주소", () => {
  it("메일 주소 모양이다", () => {
    expect(CS_EMAIL).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it("안내 문장에 그 주소가 들어 있다", () => {
    expect(CS_CONTACT_LINE).toContain(CS_EMAIL);
  });
});

describe("못 답할 때 하는 말", () => {
  /** 근거를 못 찾았을 때와 사람에게 넘길 때. 둘 다 갈 곳이 있어야 한다. */
  it.each([
    ["근거 없음", NO_EVIDENCE],
    ["담당자에게", HANDOFF],
  ])("**%s 에는 갈 곳이 적힌다**", (_이름, 문장) => {
    expect(문장, "못 답하고 끝내면 사용자는 갈 곳을 모른다").toContain(CS_EMAIL);
    expect(문장).toContain("문의 남기기");
  });

  /**
   * **로그인하라는 말에는 안 붙인다.** 할 일이 문의가 아니라 로그인이다.
   * 갈 곳을 둘로 주면 엉뚱한 쪽으로 간다.
   */
  it("**로그인하라는 말에는 안 붙인다**", () => {
    expect(NEEDS_LOGIN).not.toContain(CS_EMAIL);
  });

  /** 좁은 칸에서 읽는다. 갈 곳은 줄을 바꿔 적는다. */
  it("**갈 곳은 줄을 바꿔 적는다**", () => {
    expect(NO_EVIDENCE).toContain("\n");
    expect(HANDOFF).toContain("\n");
  });
});

/**
 * **주소를 손으로 적은 자리가 없는가.**
 *
 * 이것이 이 파일의 핵심이다. 한 곳에서만 정해야 보여 주는 곳과 가는 곳이
 * 갈라지지 않는다.
 */
describe("한 곳에서만 정한다", () => {
  /*
    **다른 주소는 건드리지 않는다.**

    처음에는 메일 주소처럼 보이는 것을 다 잡았는데, 약관의 법무 연락처와
    소유자 계정 주소까지 걸렸다(2026-09-28). 그 둘은 **다른 일을 하는 다른
    주소**다. 막아야 하는 것은 「아무 주소나 적는 것」이 아니라 **문의받는
    주소를 두 군데 적는 것**이다.

    그래서 정본의 그 값만 찾는다.
  */

  function 훑는다(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      if (["node_modules", ".next", "__tests__"].includes(name)) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) 훑는다(path, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(path);
    }
    return out;
  }

  it("**`contact.ts` 밖에서는 주소를 안 적는다**", () => {
    const 적어둔것: string[] = [];

    for (const file of [...훑는다(join(web, "app")), ...훑는다(join(web, "lib"))]) {
      if (file.endsWith(join("lib", "cs", "contact.ts"))) continue;
      const 글 = readFileSync(file, "utf8")
        // 주석은 뺀다. 지난 결정을 인용하는 것은 정당하다.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");

      if (글.includes(CS_EMAIL)) 적어둔것.push(file.slice(web.length + 1));
    }

    expect(
      적어둔것,
      "문의받는 주소를 손으로 적었다. `lib/cs/contact.ts` 의 CS_EMAIL 을 가져다 쓴다 — " +
        "두 곳에 적으면 보여 주는 주소와 메일이 가는 주소가 갈라진다",
    ).toEqual([]);
  });

  /** 실제로 메일이 가는 자리도 같은 값을 본다. */
  it("**메일 보내는 곳이 같은 값을 쓴다**", () => {
    const 보내는곳 = read("lib/cs/inquiry.ts");

    expect(보내는곳).toContain("CS_EMAIL");
    expect(보내는곳, "환경변수로 덮는 길은 남겨 둔다").toContain("CS_INQUIRY_EMAIL");
  });

  /** 화면 셋도 같은 값을 본다. */
  it.each([
    ["대화창", "app/_components/cs-panel.tsx"],
    ["관리자 문의함", "app/admin/system/inquiry-panel.tsx"],
    ["설명서", "app/guide/_components/contact.ts"],
  ])("**%s 이 같은 값을 쓴다**", (_이름, file) => {
    expect(read(file)).toContain("CS_EMAIL");
  });
});
