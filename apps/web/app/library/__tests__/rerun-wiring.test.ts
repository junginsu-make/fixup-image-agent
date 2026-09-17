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
    base: "/poster/new",
    first: "instruction",
  },
  {
    name: "카드뉴스",
    detail: "app/sns/[id]/project-client.tsx",
    fresh: "app/sns/new-client.tsx",
    base: "/sns/new",
    first: "content",
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
  /**
   * **작업 id 와 누른 단계를 함께 싣는다**(2026-09-17 사용자 보고).
   *
   * 단계를 안 실어서 03 을 눌러도 01 이 열렸다. 주소는 한 곳(`rerunHref`)이
   * 만든다 — 인코딩까지 거기서 값으로 잰다(`_components/__tests__/rerun-step.test.ts`).
   */
  it.each(TOOLS)("$name 은 작업 id 와 누른 단계를 싣고 보낸다", ({ detail, base }) => {
    const source = read(detail);
    expect(source).toMatch(new RegExp(`router\\.push\\(rerunHref\\("${base}", \\w+(\\.id)?, id\\)\\)`));
  });

  /**
   * **열 때부터 그 단계로 선다**(2026-09-17 사용자 보고).
   *
   * 값을 다 불러온 **뒤에** 옮겼더니 01 이 잠깐 보였다가 03 으로 넘어갔다 — 누른
   * 사람에게는 「굳이 01 을 들렀다 온다」로 읽힌다. 값이 아직 없는 동안에는
   * `seeding` 이 화면을 안 내주므로, 단계만 먼저 맞춰도 빈 칸이 안 보인다.
   */
  it.each(TOOLS)("$name 은 열 때부터 누른 단계로 선다", ({ fresh, first }) => {
    const source = read(fresh);
    // 처음 값만 잡는다. 주소 값을 그대로 의존성에 두면 나중에 불러오기가 다시 돈다.
    expect(source).toContain('rerunStep = React.useRef(searchParams.get("step")).current');
    /*
      **모를 때 여는 단계를 값으로 박는다.** `"\w+"` 로 받았더니 첫 단계를 03 으로
      바꿔도 초록이었다 — 단계 없는 옛 주소가 03 으로 열린다(2026-09-17 독립 리뷰).
    */
    expect(source).toMatch(new RegExp(
      `useState(<Step>)?\\(\\(\\) => rerunStartStep(<Step>)?\\(rerunFrom \\? rerunStep : null, RERUN_STEPS, "${first}"\\)\\)`,
    ));
  });

  /**
   * **돌아온 길일 때만 단계를 따른다.** `?step=spec` 만 있는 주소(옛 링크·손으로 친
   * 주소)에서 따르면 불러올 값이 없어 빈 03 이 열린다(2026-09-17 확인).
   */
  it.each(TOOLS)("$name 은 ?from= 없이 온 단계는 따르지 않는다", ({ fresh }) => {
    const source = read(fresh);
    expect(source).toContain("rerunFrom ? rerunStep : null");
    expect(source, "단계를 조건 없이 따르면 빈 03 이 열린다").not.toMatch(/rerunStartStep(<Step>)?\(rerunStep,/);
  });

  /**
   * **두 갈래를 잘라서 잰다.** 글자 수로 창을 잡았더니 그 창이 `return; }` 너머 성공
   * 갈래까지 닿아, `setStep` 을 성공 갈래로 옮겨도 초록이었다(2026-09-17 독립 리뷰가
   * 뮤테이션으로 실증). 그렇게 옮기면 값이 오는 순간 01 로 튄다 — 원래 버그보다 나쁘다.
   */
  it.each(TOOLS)("$name 은 **불러오기에 실패하면 첫 단계로 돌린다** — 빈 03 은 무엇을 채울지 모른다", ({ fresh, first }) => {
    const source = read(fresh);
    const failStart = source.indexOf("if (!result.ok) {");
    const failEnd = source.indexOf("return;", failStart);
    const success = source.slice(source.indexOf("const { seed } = result;"), source.indexOf("setSeeding(false);", source.indexOf("const { seed } = result;")));
    expect(failStart, "실패 갈래를 못 찾았다").toBeGreaterThan(-1);
    expect(source.slice(failStart, failEnd), "실패 갈래에서 첫 단계로 돌린다").toContain(`setStep("${first}");`);
    expect(success, "성공 갈래는 단계를 건드리지 않는다 — 건드리면 값이 오는 순간 단계가 튄다").not.toContain("setStep(");
    // 여는 단계를 정하는 자리는 하나다. 여기저기서 옮기면 어디서 바뀌는지 못 쫓는다.
    expect(source.split("rerunStartStep").length - 1).toBe(2);
  });

  /**
   * **값을 기다리는 잠금은 주소를 `useSearchParams` 로 읽은 값에서 정한다.**
   *
   * 카드뉴스가 `window.location` 으로 읽었더니, 서버에서 그릴 때(window 없음)와 결과
   * 화면에서 눌러 올 때(첫 렌더가 아직 옛 주소) 모두 잠금이 풀린 채로 시작했다. 단계는
   * 이미 03 이라 **빈 03** 이 보이고 손도 댈 수 있었다(2026-09-17 독립 리뷰가 실측).
   */
  it.each(TOOLS)("$name 은 값을 기다리는 동안 화면을 잠근다 — 단계와 같은 주소 값으로", ({ fresh }) => {
    const source = read(fresh);
    expect(source).toMatch(/React\.useState\(Boolean\((rerunFrom|rerunFromInitial)\)\)/);
    expect(source, "주소를 window 로 읽으면 첫 렌더에서 어긋난다").not.toContain("window.location.search");
  });

  it("이미지 만들기는 단계 목록을 **다시 적지 않는다** — 단계 id 는 한 곳이 갖는다", () => {
    const source = read("app/poster/new-client.tsx");
    expect(source).toContain(
      "const RERUN_STEPS = POSTER_STEPS.map((entry) => entry.id).filter(reachableBeforeCreate);",
    );
  });

  it("카드뉴스는 04·05 를 목록에 안 넣는다 — 이 화면에 없는 단계다", () => {
    expect(read("app/sns/new-client.tsx")).toContain('const RERUN_STEPS: readonly Step[] = ["content", "images", "spec"];');
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
      2. `\b` 를 쓴 정규식 → **그 `\b` 가 백스페이스 문자로 파일에 들어가**
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
      둔다 — 오늘 `\b` 사고와 같은 실패 방식이다.
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

/**
 * **값을 기다리는 동안 누를 단추가 없다**(2026-09-17).
 *
 * 결과 화면에서 03 을 누르면 이제 처음부터 03 으로 선다. 그런데 카드뉴스는 단추 줄이
 * 잠금 밖에 있어, 값이 오기 전에 「기획 시작」을 누르면 **빈 규격으로 새 작업**이
 * 만들어졌다. 이미지 만들기의 「만들기」는 원래 규격 칸 안이라 이미 잠겨 있다.
 */
describe("기다리는 동안의 단추", () => {
  it("카드뉴스는 단추 줄 전체를 잠금 안에 둔다", () => {
    const source = read("app/sns/new-client.tsx");
    const guard = source.indexOf("{seeding ? null : (");
    expect(guard, "단추 줄 잠금을 못 찾았다").toBeGreaterThan(-1);
    const start = source.indexOf("createProject()", guard);
    const close = source.indexOf(")}", source.indexOf("</div>", source.indexOf("기획 시작", guard)));
    expect(start, "「기획 시작」이 잠금 안에 있어야 한다").toBeGreaterThan(guard);
    expect(start).toBeLessThan(close);
  });

  it("이미지 만들기의 「만들기」는 규격 칸 안이다 — 규격 칸은 기다리는 동안 안 그린다", () => {
    const source = read("app/poster/new-client.tsx");
    const spec = source.indexOf('{!seeding && step === "spec" ? (');
    const submit = source.indexOf("onClick={() => void submit()}");
    const next = source.indexOf('{!seeding && step === "instruction" ? (');
    expect(spec).toBeGreaterThan(-1);
    expect(submit).toBeGreaterThan(spec);
    expect(submit).toBeLessThan(next);
  });
});
