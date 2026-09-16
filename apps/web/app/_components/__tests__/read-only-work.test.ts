import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blockedByReadOnly, READ_ONLY_MESSAGE } from "../read-only-work";

/**
 * 남의 작업을 **보는 중**일 때 쓰는 요청을 막는다.
 *
 * 단추를 하나씩 `disabled` 로 잠그는 방법도 있지만, 그러면 **빠뜨린 단추가
 * 곧 구멍이다.** 화면은 크고(포스터 상세만 682줄) 단추는 계속 늘어난다.
 *
 * 그래서 요청이 나가는 **길목 하나**를 막는다. 새 단추가 생겨도 같은 길로
 * 나가므로 저절로 막힌다.
 *
 * 관리자는 남의 작업을 고치지 못한다 — 고치고 싶으면 자기 것으로 복사한다
 * (2026-09-16 사용자 결정). 서버의 쓰기 경로는 손대지 않았으므로 설령 이
 * 막이 뚫려도 DB 는 안 바뀌지만, 그때 크레딧은 이미 나간 뒤다.
 */
describe("blockedByReadOnly", () => {
  it("보는 중이 아니면 아무것도 막지 않는다", () => {
    expect(blockedByReadOnly(false, { method: "POST" })).toBe(false);
    expect(blockedByReadOnly(false, undefined)).toBe(false);
  });

  it("보는 중이면 쓰는 요청을 막는다", () => {
    expect(blockedByReadOnly(true, { method: "POST" })).toBe(true);
    expect(blockedByReadOnly(true, { method: "PUT" })).toBe(true);
    expect(blockedByReadOnly(true, { method: "PATCH" })).toBe(true);
    expect(blockedByReadOnly(true, { method: "DELETE" })).toBe(true);
  });

  it("보는 중이어도 읽는 요청은 통과시킨다", () => {
    // 막아 버리면 화면이 아예 안 뜬다.
    expect(blockedByReadOnly(true, undefined)).toBe(false);
    expect(blockedByReadOnly(true, {})).toBe(false);
    expect(blockedByReadOnly(true, { method: "GET" })).toBe(false);
    expect(blockedByReadOnly(true, { method: "HEAD" })).toBe(false);
  });

  it("소문자로 적은 method 도 같게 본다", () => {
    // `fetch` 는 소문자를 받아 준다. 대소문자로 갈리면 그 길이 곧 구멍이다.
    expect(blockedByReadOnly(true, { method: "post" })).toBe(true);
    expect(blockedByReadOnly(true, { method: "get" })).toBe(false);
  });

  it("모르는 method 는 막는 쪽으로 틀린다", () => {
    // 새 method 가 생겼을 때 통과시키는 쪽으로 틀리면 그게 사고다.
    expect(blockedByReadOnly(true, { method: "MERGE" })).toBe(true);
  });

  it("막았을 때 쓸 말이 있다", () => {
    expect(READ_ONLY_MESSAGE).toContain("복사");
  });
});

/**
 * 화면이 이 막을 실제로 지나는가.
 *
 * 규칙을 만들어 놓고 안 부르면 소용이 없다 — 이 저장소가 두 번 겪었다
 * (2026-09-08·2026-09-15). **찾지 말고 센다.**
 */
describe("상세 화면이 막을 지나는가", () => {
  const source = readFileSync(
    join(__dirname, "..", "..", "sns", "[id]", "project-client.tsx"), "utf8");
  const poster = readFileSync(
    join(__dirname, "..", "..", "poster", "[id]", "poster-client.tsx"), "utf8");
  const posterLoader = readFileSync(
    join(__dirname, "..", "..", "poster", "[id]", "detail-client.tsx"), "utf8");

  it("포스터도 길목에서 막는다", () => {
    const gates = poster.match(/blockedByReadOnly\(readOnly, init\)/g) ?? [];
    expect(gates.length).toBe(1);
  });

  it("포스터의 쓰는 요청이 **하나도 빠짐없이** 길목을 지난다", () => {
    /*
      **찾지 말고 센다.** 처음엔 `await fetch(` 만 셌는데, 크레딧이 깎이는
      요청은 `billableFetch` 로 나가서 그 셋이 통째로 비껴갔다(리뷰가 변이로
      실증). 이제 그 주소로 나가는 **모든** 호출을 찾아, 앞에 붙은 이름이
      길목 둘 중 하나인지 본다.

      정규식 대신 글자로 센다 — 여기서 정규식이 한 번 조용히 0 을 내서,
      「빠짐없이 센다」는 이 시험 자체가 아무것도 안 세고 있었다.
    */
    const needle = "(`/api/poster/projects";
    const callers: string[] = [];
    for (let at = poster.indexOf(needle); at >= 0; at = poster.indexOf(needle, at + 1)) {
      const head = poster.slice(0, at);
      callers.push(head.slice(head.search(/[A-Za-z_$][\w$]*$/)));
    }

    expect(callers.length, "포스터 작업 요청을 하나도 못 찾았다").toBeGreaterThan(0);
    const outside = callers.filter((name) => name !== "request" && name !== "billableRequest");
    expect(outside, `길목 밖으로 나가는 요청: ${outside.join(", ")}`).toEqual([]);
  });

  it("포스터도 남의 작업이면 관리자 통로로 한 번 더 묻는다", () => {
    expect(posterLoader).toContain("/api/admin/works/poster/");
    expect(posterLoader).toContain("readOnly: true");
  });

  it("**받은 readOnly 를 자식에게 실제로 넘긴다**", () => {
    /*
      상태를 세팅하는 줄만 보면 안 된다. 그 값이 자식에게 안 넘어가면
      **보기 전용이 통째로 꺼지는데** 시험은 전부 초록이다(리뷰가 변이로
      실증했다). 넘기는 줄을 따로 센다.
    */
    const passed = posterLoader.match(/readOnly=\{state\.readOnly\}/g) ?? [];
    expect(passed.length).toBe(1);
  });

  it("포스터 화면이 받은 readOnly 를 막에 쓴다", () => {
    // prop 으로 받아 놓고 안 쓰면 그것도 꺼진 것이다.
    expect(poster).toContain("readOnly = false }");
    const used = poster.match(/blockedByReadOnly\(readOnly/g) ?? [];
    expect(used.length).toBe(2);
  });

  it("요청 길목이 blockedByReadOnly 를 한 번 부른다", () => {
    const gates = source.match(/if \(blockedByReadOnly\(readOnly, init\)\)/g) ?? [];
    expect(gates.length).toBe(1);
  });

  it("쓰는 요청이 모두 감싸개를 지난다", () => {
    /*
      `projectRequest` 를 직접 부르면 `readOnly` 가 안 실려 막이 비껴간다.
      첫 적재(GET) 하나만 예외다 — 그건 막으면 화면이 아예 안 뜬다.
    */
    const direct = source.match(/await projectRequest\(/g) ?? [];
    expect(direct.length).toBe(0);
  });

  it("보는 중이면 상태를 캐묻지 않는다", () => {
    /*
      캐묻기는 `POST /status` 라 막이 걸린다. 그런데 실패하면 다시 캐묻으므로
      막힌 채로 두면 **오류 → 재시도 → 오류**가 끝없이 돈다. 화면에는 빨간
      글씨만 계속 뜬다. 린트의 deps 경고가 이 버그를 가리켜서 찾았다.
    */
    expect(source).toContain("if (!generationActive || readOnly) return;");
  });

  it("보는 중이면 앞 단계로 튕기지 않는다", () => {
    /*
      포스터의 앞 세 단계(지시·레퍼런스·규격)는 **새로 만드는 화면**에 있어서
      누르면 `/poster/new` 로 보낸다. 내 작업이면 말이 되지만, **남의 작업을
      보는 중에 누르면 빈 화면이 뜬다** — 사용자는 설정이 다 사라졌다고 읽는다
      (2026-09-16 실제 신고).

      보는 중에는 아예 안 움직인다.
    */
    const at = poster.indexOf("onJump=");
    expect(at).toBeGreaterThan(-1);
    const jump = poster.slice(at, at + 400);
    expect(jump).toContain("readOnly");
  });

  it("카드뉴스도 남의 작업 그림이 보인다", () => {
    /*
      포스터만 고치고 카드뉴스를 두면 같은 신고가 한 번 더 온다. 카드 주소를
      채우는 일은 관리자 통로가 맡으므로 화면은 손댈 것이 없고, 대신 띠가
      「안 보인다」고 말하지 않는지 본다.
    */
    expect(source).not.toContain("그림은 여기서 안 보입니다");
    expect(source).toContain("고치려면 내 작업으로 복사하세요");
  });

  it("남의 작업도 만들어진 그림을 볼 수 있다", () => {
    /*
      처음엔 낱장을 안 실었다(`images: []`). 그런데 「과정을 본다」면서 결과를
      못 보면 보는 뜻이 없다 — 「아직 만든 변형이 없습니다」로 보여서 지워진
      줄 알았다는 신고를 받았다.
    */
    expect(posterLoader).not.toContain("images: []");
    // 띠도 사실에 맞아야 한다 — 「안 보인다」고 적어 두면 그것도 거짓말이다.
    expect(poster).not.toContain("그림은 여기서 안 보입니다");
    expect(posterLoader).toContain("seen.images");
  });

  it("막아만 두지 않고 복사할 길을 같은 자리에 낸다", () => {
    // 막아 두고 길을 안 내면 사용자는 무엇을 해야 할지 모른다.
    for (const [name, src] of [["카드뉴스", source], ["포스터", poster]] as const) {
      expect(src, `${name} 에 복사 단추가 없다`).toContain("내 작업으로 복사");
      expect(src, `${name} 이 복사 통로를 안 부른다`).toContain("/copy");
    }
  });

  it("남의 작업이면 보는 중이라고 말한다", () => {
    expect(source).toContain("setReadOnly(true)");
    expect(source).toContain("다른 회원의 작업");
  });
});
