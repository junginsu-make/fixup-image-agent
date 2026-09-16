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
  },
  {
    name: "카드뉴스",
    detail: "app/sns/[id]/project-client.tsx",
    fresh: "app/sns/new-client.tsx",
    href: "/sns/new?from=",
  },
];

describe("지난 단계로 값을 들고 간다", () => {
  /*
    **흐름은 여기서 안 잰다.** 어느 주소로 묻는지, 404 면 관리자 통로로 가는지,
    남의 작업이면 그림을 복사하는지, 어떤 인자로 씨앗을 만드는지는 화면에서
    `loadPosterRerun`·`loadSnsRerun` 으로 옮겨 **값으로** 잰다
    (`poster/__tests__/rerun-load.test.ts`, `sns/__tests__/rerun-load.test.ts`).

    여기 있던 원문 가늠자 여섯은 조건을 뒤집거나 호출을 가지 밖으로 옮겨도
    초록이었다(2026-09-16 독립 리뷰가 실증). 화면이 그 함수를 정확히 쓰는지는
    `rerun-adopt-wiring.test.ts` 가 문장 전체로 본다.
  */
  it.each(TOOLS)("$name 은 작업 id 를 붙여 보낸다", ({ detail, href }) => {
    const source = read(detail);

    expect(source).toContain(href);
    // 주소 조각은 인코딩해서 붙인다.
    expect(source).toMatch(new RegExp(`${href.replace("?", "\\?")}\\$\\{encodeURIComponent\\(`));
  });

  it("이미지 만들기는 **심어야 할 값을 하나도 안 빠뜨린다**", () => {
    /*
      **배선 시험은 원문만 훑어서 상태를 못 본다.** 그래서 심는 줄이 하나
      사라져도 안 울린다 — `setPickOrder(seed.pickOrder)` 를 지우면 참고
      이미지가 하나도 안 실리는데 전체가 초록이었다(2026-09-16 독립 리뷰).

      값을 못 재니 **줄을 센다.** 씨앗이 들고 온 것마다 심는 자리가 있어야 한다.
    */
    const source = read("app/poster/new-client.tsx");

    for (const 심을것 of [
      "setTitle(seed.title)",
      "setInstruction(seed.instruction)",
      "setRatio(seed.ratio)",
      "setVariants(seed.variants)",
      "setLook(seed.look)",
      "setPromptMode(seed.promptMode)",
      "setUserInstruction(seed.userInstruction)",
      "setAttachmentIntent(seed.attachmentIntent)",
      "setRoles(seed.roles)",
      "setPickOrder(seed.pickOrder)",
    ]) {
      expect(source, `${심을것} 이 빠졌다`).toContain(심을것);
    }
  });

  it("카드뉴스도 심어야 할 값을 하나도 안 빠뜨린다", () => {
    const source = read("app/sns/new-client.tsx");

    for (const 심을것 of [
      "setTitle(seed.title)",
      "setToneNote(seed.toneNote)",
      "setSource(seed.source)",
      "setAttachments(seed.attachments)",
      "setIntents(seed.intents)",
      "setSpec(seed.spec)",
    ]) {
      expect(source, `${심을것} 이 빠졌다`).toContain(심을것);
    }
  });

  it.each(TOOLS)("$name 은 읽기 전용이라고 막지 않는다", ({ detail }) => {
    /*
      남의 작업을 보는 중에도 지난 단계로 갈 수 있어야 한다. 거기서 만들기를
      누르면 **새 작업**이 생기고 원래 작업은 안 바뀌므로 읽기 전용과 어긋나지
      않는다. 전에는 `if (readOnly) return;` 으로 막아 관리자가 남의 작업을
      다시 만들 길이 없었다.

      ── 이 가늠자를 다섯 번 고쳤다 ─────────────────────────────────

      1. `"if (readOnly) return;"` 문자열 완전 일치 →
         `return undefined;` 를 못 잡았다
      2. `` 를 쓴 정규식 → **그 `` 가 백스페이스 문자로 파일에 들어가**
         아무것도 안 맞았다(같은 날 `copy-paths.test.ts` 에서도 당했다)
      3. 파일 전체에서 찾기 → **다른 화면의 정당한 가드**까지 걸렸다
         (`project-client.tsx` 의 상태 캐묻기 막이)
      4. `onJump` 부터 자른 창 + `readOnly)` 뒤 `return` 모양 → 두 가지가 샜다.
         `onJump={readOnly ? undefined : …}` 는 다음 글자가 `?` 라 안 물고,
         `allowJump` 로 막으면 **`onJump` 앞에 있어 창에 아예 안 들어온다**
      5. 지금 — **`<StepBar` 부터 `/>` 까지 열고, 모양 대신 낱말로 잰다**

      4번의 삼항이 특히 위험했다. 카드뉴스가 이 기능 전에 쓰던 표기가 정확히
      그것이라, 되돌리는 사람이 가장 자연스럽게 쓸 모양이 비껴갔다.
    */
    const source = read(detail);
    const at = source.indexOf("<StepBar");
    const end = source.indexOf("/>", at);
    expect(at, "단계 막대를 못 찾았다 — 가늠자를 고쳐라").toBeGreaterThan(-1);
    expect(end, "단계 막대가 어디서 끝나는지 못 찾았다").toBeGreaterThan(at);
    const stepBar = source.slice(at, end);

    /*
      **창이 비면 조용히 통과한다.** 창을 자르는 가늠자의 성질이라 안전핀을
      둔다 — 오늘 `` 사고와 같은 실패 방식이다.
    */
    expect(stepBar, "단계 막대 안에 onJump 가 없다").toContain("onJump");

    /*
      **단계 막대 안에서는 읽기 전용을 아예 안 본다.** 모양을 안 따지므로
      삼항도 `allowJump` 도 `{ return; }` 도 앞으로 나올 표기도 같이 걸린다.
      창이 한 덩어리로 좁아서 다른 화면의 정당한 가드는 애초에 안 들어온다.
    */
    expect(stepBar).not.toMatch(/readOnly/);
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
