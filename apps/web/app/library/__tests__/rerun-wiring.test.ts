import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **지난 단계로 가면 그때 값이 들어 있어야 한다.**
 *
 * 이미지 만들기는 01~03 을 누르면 빈 새 작업 화면으로 보냈고, 카드뉴스는
 * 아예 못 누르게 막혀 있었다. 둘 다 사용자에게는 「다 초기화됐다」로 읽혔다
 * (2026-09-16 사용자 보고).
 *
 * 규칙(`rerun-seed.ts`)은 값으로 재지만, **화면이 그 규칙을 쓰는지는 아무도
 * 안 본다.** 앞선 배지 건이 그래서 뮤테이션을 통과했다 — 그래서 센다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(web, path), "utf8");

/** 지난 단계로 보내는 화면과, 값을 받아 심는 화면. */
const TOOLS = [
  {
    name: "이미지 만들기",
    detail: "app/poster/[id]/poster-client.tsx",
    fresh: "app/poster/new-client.tsx",
    href: "/poster/new?from=",
    seed: "posterSeed(",
    adminRoute: "/api/admin/works/poster/",
    memberRoute: "/api/poster/projects/${encodeURIComponent(rerunFrom)}",
  },
  {
    name: "카드뉴스",
    detail: "app/sns/[id]/project-client.tsx",
    fresh: "app/sns/new-client.tsx",
    href: "/sns/new?from=",
    seed: "snsSeed(",
    adminRoute: "/api/admin/works/sns/",
    memberRoute: "/api/sns/projects/${encodeURIComponent(rerunFrom)}/plan",
  },
];

describe("지난 단계로 값을 들고 간다", () => {
  it.each(TOOLS)("$name 은 작업 id 를 붙여 보낸다", ({ detail, href }) => {
    const source = read(detail);

    expect(source).toContain(href);
    // 주소 조각은 인코딩해서 붙인다.
    expect(source).toMatch(new RegExp(`${href.replace("?", "\\?")}\\$\\{encodeURIComponent\\(`));
  });

  it.each(TOOLS)("$name 의 새 화면이 그 값을 심는다", ({ fresh, seed }) => {
    const source = read(fresh);

    expect(source).toContain('useSearchParams().get("from")');
    expect(source).toContain(seed);
  });

  it.each(TOOLS)("$name 은 **관리자도** 남의 작업을 다시 만들 수 있다", ({ fresh, adminRoute }) => {
    /*
      회원은 자기 작업에, 관리자(`9843ohs@gmail.com`)는 **모든 작업**에 같게
      동작해야 한다(2026-09-16 사용자 결정). 회원용 길이 404 면 관리자 통로에
      한 번 더 묻는다 — 회원용 길에 관리자 예외를 심지 않는 것이 이 저장소의
      규칙이다.
    */
    const source = read(fresh);

    expect(source).toContain(adminRoute);
    expect(source).toContain("found.status === 404");
  });

  it.each(TOOLS)("$name 은 읽기 전용이라고 막지 않는다", ({ detail }) => {
    /*
      남의 작업을 보는 중에도 지난 단계로 갈 수 있어야 한다. 거기서 만들기를
      누르면 **새 작업**이 생기고 원래 작업은 안 바뀌므로 읽기 전용과 어긋나지
      않는다. 전에는 `if (readOnly) return;` 으로 막아 관리자가 남의 작업을
      다시 만들 길이 없었다.
    */
    const source = read(detail);
    const at = source.indexOf("onJump");
    expect(at).toBeGreaterThan(-1);

    expect(source.slice(at, at + 900)).not.toContain("if (readOnly) return;");
  });

  it.each(TOOLS)("$name 은 **있는** 회원용 길로 묻는다", ({ fresh, memberRoute }) => {
    /*
      카드뉴스의 작업 한 건은 `/plan` 이 준다 — `/api/sns/projects/{id}` 에는
      GET 이 없다(DELETE 뿐). 그리로 보내면 405 가 오고, **404 가 아니라서
      관리자 통로로 넘어가지도 못한다.** 값은 못 가져오면서 화면은 「불러오지
      못했습니다」만 띄운다.
    */
    expect(read(fresh)).toContain(memberRoute);
  });

  it.each(TOOLS)("$name 은 값을 들고 왔다고 화면에 적는다", ({ fresh }) => {
    /*
      안 적으면 사용자는 이 화면이 **원래 작업을 고치는 곳**인 줄 안다.
      만들기를 누르면 새 작업이 하나 더 생긴다는 것을 먼저 말해야 한다.
    */
    const source = read(fresh);

    expect(source).toContain("값을 가져왔습니다");
    expect(source).toContain("새 작업");
  });

  it("이미지 만들기는 참고 이미지를 두 번 받지 않는다", () => {
    /*
      돌아온 길에서는 씨앗 효과가 목록을 읽는다. 기본 효과까지 읽으면 화면 한
      번에 같은 목록을 두 번 받아 온다 — 사용자가 「끊긴다」고 말한 그 무게를
      이 화면에 다시 얹는 셈이다.
    */
    expect(read("app/poster/new-client.tsx")).toContain("if (rerunFrom) return;");
  });

  it.each(TOOLS)("$name 은 못 가져온 그림 수를 말한다", ({ fresh }) => {
    // 조용히 빠지면 사용자는 자기가 안 고른 줄 안다.
    const source = read(fresh);

    expect(source).toContain("가져오지 못했습니다");
  });
});
