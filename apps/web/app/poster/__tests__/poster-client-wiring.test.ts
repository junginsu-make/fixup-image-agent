import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 04 기획 확인 화면이 **사용자가 친 말**을 보여주는가.
 *
 * 이 화면은 「AI 가 채운 칸이 내가 시킨 것과 맞나」를 판단하는 자리다. 그런데
 * 자기가 01·03 에서 뭐라고 적었는지는 그 화면을 떠나면 다시 볼 수 없었다.
 * 아래 칸들보다 그 말이 세다는 것도 여기서만 말할 수 있다.
 *
 * **왜 소스 문자열을 보는가** — `new-client-wiring.test.ts` 와 같은 이유다.
 * 이 저장소에는 jsdom 이 없어 컴포넌트를 렌더할 수 없다.
 */

const source = readFileSync(new URL("../[id]/poster-client.tsx", import.meta.url), "utf8");

describe("내가 적은 말이 기획 확인 화면에 보이는가", () => {
  it("01의 말과 03의 말을 둘 다 읽는다", () => {
    expect(source).toContain("project.data.attachmentIntent?.trim()");
    expect(source).toContain("project.data.userInstruction?.trim()");
  });

  it("빈 것은 거른다 — 옛 작업에는 둘 다 없다", () => {
    // 안 거르면 「첨부한 그림에 대해 · 」만 있는 빈 줄이 남는다.
    expect(source).toMatch(/userWords[\s\S]{0,400}?\.filter\(/);
  });

  it("기획 칸보다 위에 둔다 — 무엇이 더 센지 그 자리에서 말한다", () => {
    expect(source).toContain("아래 칸보다 우선합니다");
    // 그리는 차례로 본다. `SLOT_LABELS.map` 은 위쪽 유도에도 나와서 기준이 안 된다.
    expect(source.indexOf("userWords.map")).toBeLessThan(source.indexOf("planRows.map(renderSlot)"));
  });

  it("고칠 수 없다 — 이 화면은 기획 칸만 고친다", () => {
    // 여기서 고치게 하면 저장 경로가 하나 더 생긴다. 01·03 으로 돌아가면 된다.
    expect(source).not.toMatch(/setAttachmentIntent|setUserInstruction/);
  });
});

/**
 * 04 는 패널, 05 는 페이지 (2026-09-08 사용자 결정).
 *
 * **한 페이지를 통째로 쓸 내용이 아니었다.** 칸 열한 개가 늘 다 보였고, 글자가
 * 없는 그림인데 「글자와 피사체의 관계」까지 있었다.
 */
describe("기획은 옆에서 나오고 결과가 페이지를 갖는다", () => {
  it("기획을 오른쪽 패널로 연다", () => {
    expect(source).toContain("<SidePanel open={planOpen} onOpenChange={setPlanOpen}>");
  });

  /**
   * 안 열면 「빈 결과 화면」만 보이고 다음에 뭘 해야 할지 알 수 없다.
   *
   * 2026-09-16 에 「쓴 그대로」 갈래가 생기면서 그 앞에 건너뛰기 한 줄이 끼었다.
   * 거리를 넓힌 것은 그래서다 — **저절로 연다는 것 자체는 그대로 지킨다.**
   */
  it("아직 아무것도 안 만들었으면 저절로 연다", () => {
    expect(source).toMatch(/if \(images\.length\) return;[\s\S]{0,600}setPlanOpen\(true\)/);
  });

  it("한 번만 연다 — 닫은 것을 다시 열면 성가시다", () => {
    expect(source).toContain("if (openedOnce.current) return;");
  });

  it("언제든 다시 열 수 있다", () => {
    expect(source).toMatch(/onClick=\{\(\) => setPlanOpen\(true\)\}/);
  });

  it("만들기를 누르면 패널이 닫힌다 — 결과 자리를 가리면 안 된다", () => {
    expect(source).toContain("setPlanOpen(false); void generate();");
  });

  it("결과는 페이지에 그대로 남는다", () => {
    expect(source).toContain("<CardTitle>결과</CardTitle>");
    // 패널이 **닫힌 뒤에** 결과가 온다. 안이면 결과가 패널에 갇힌다.
    expect(source.indexOf("</SidePanel>"), "결과까지 패널로 가면 안 된다")
      .toBeLessThan(source.indexOf("<CardTitle>결과</CardTitle>"));
  });
});

describe("칸을 걸러서 보여주는가", () => {
  it("규칙을 여기 다시 적지 않고 부른다", () => {
    expect(source).toContain("splitFilledSlots(");
    // showsTypeInteraction 은 04 에서 그 칸을 빼면서 안 쓰게 됐다(2026-09-17).
  });

  /**
   * **칸을 두 무더기로 나눠 그리지 않는다**(2026-09-17 사용자 보고).
   *
   * 채운 칸을 위에, 빈 칸을 아래에 그렸더니 빈 칸에 한 글자를 넣는 순간 그
   * 칸이 위 무더기로 옮겨 가 커서가 빠졌다. 한 목록으로 그려야 자리가 안 움직인다.
   */
  it("한 목록으로 그린다 — 차례는 `planSlotRows` 가 정한다", () => {
    expect(source).toContain("planRows.map(renderSlot)");
    expect(source, "두 무더기로 돌아가면 안 된다").not.toContain("filledFields.map(renderSlot)");
    expect(source, "두 무더기로 돌아가면 안 된다").not.toContain("emptyFields.map(renderSlot)");
  });

  it("**한 번 보인 칸은 지켜 준다** — 글자를 지우는 중에 칸이 사라지면 안 된다", () => {
    expect(source).toMatch(/planSlotRows\([\s\S]{0,160}\{ showEmpty, keep: keptFields \}/);
  });

  /**
   * **기획이 도착한 뒤에도 쌓아야 한다**(2026-09-17 독립 리뷰가 실증).
   *
   * 04 는 빈 채로 열리고 기획이 그 뒤에 칸을 채운다. 열 때 한 번만 잡으면
   * 목록이 빈 채로 굳어, 채워진 칸의 글자를 다 지우는 순간 그 칸이 사라진다 —
   * 막으려던 바로 그 일이 기본 흐름에서 그대로 일어났다.
   */
  it("값이 들어오면 그때그때 더한다 — 열 때 한 번이 아니다", () => {
    expect(source).toMatch(/setKeptFields\(\(current\) => \{[\s\S]{0,400}next\.add\(field\)/);
    // 효과가 slots 를 봐야 기획이 채운 칸을 잡는다.
    expect(source).toMatch(/setKeptFields\(\(current\) => \{[\s\S]{0,600}\}, \[planOpen, slots\]\);/);
  });

  it("접으면 지금 빈 칸은 놓아 준다 — 접었는데 남아 있으면 접은 것이 아니다", () => {
    expect(source).toMatch(/if \(!planOpen \|\| showEmpty\) return;[\s\S]{0,200}filter\(\(field\) => String\(slots\[field\]/);
  });

  it("빈 칸을 접는 단추는 남는다 — 없으면 고를 방법이 사라진다", () => {
    expect(source).toContain("setShowEmpty((current) => !current)");
    expect(source).toContain("비어 있는 칸 {emptyFields.length}개");
  });

  it("빈 칸인지는 **모양으로** 말한다 — 자리로 말하면 커서가 튄다", () => {
    expect(source).toMatch(/function renderSlot\(\{ field, empty \}: PlanSlotRow<TextSlot>\)/);
    expect(source).toContain('const look = empty ? "border-dashed bg-muted/30" : "";');
  });

  /**
   * 기획이 도는 동안 패널이 **멈춘 화면으로 보이면 안 된다**(2026-09-17 사용자
   * 보고). 04 에 들어오면 기획이 저절로 도는데, 그때 패널에는 빈 칸만 있었다.
   */
  it("쓰는 중에는 패널을 덮는다", () => {
    expect(source).toMatch(/busy\?\.kind === "plan" \? \(\s*<PlanWriting/);
  });
});

/**
 * **단계 막대가 「그대로 생성」을 안다.**
 *
 * 그 갈래는 04 에 고칠 것이 없는데 막대가 「04 기획 확인」을 그대로 내보이고
 * 있었다(2026-09-17 설계 대조). 부름을 막는 쪽은 화면·서버 둘 다 하고 있어
 * 값이 새지는 않았고, 어긋난 것은 **사용자에게 보이는 차례**뿐이었다.
 *
 * 판단은 `steps.ts` 에 있다. 화면이 목록을 도로 박아 넣으면 값으로 잰 것이
 * 화면에 안 닿는다.
 */
describe("단계 막대", () => {
  it("차례를 steps 에서 받아 온다", () => {
    expect(source).toContain("posterSteps(project.data.promptMode)");
    expect(source).toContain("currentPosterStep(");
  });

  it("목록을 화면에 도로 박지 않는다", () => {
    expect(source).not.toContain("steps={POSTER_STEPS}");
  });

  /** 서 있는 단계도 화면이 정하면 안 된다. 없는 칸을 가리키게 된다. */
  it("서 있는 단계를 화면이 정하지 않는다", () => {
    expect(source).not.toContain('list.length ? "result" : "plan"');
  });
});

/**
 * **AI 가 지어낸 칸을 사용자가 알아볼 수 있어야 한다.**
 *
 * 전에는 기획이 근거 없는 칸을 아예 비웠다. 뜻은 분명했지만 너무 잘 들어서
 * 「벚꽃 아래 교복 입은 학생」에 0칸을 채웠다(2026-09-16 실측) — 초보일수록 빈
 * 칸을 못 채우는데 그 사람이 도움을 받으러 왔다.
 *
 * 지금은 채우게 하고 표를 붙인다. **표가 안 보이면 이 바꿈이 그냥 나빠지기만
 * 한다** — AI 가 지어낸 설정이 조용히 그림에 들어가고 사용자는 왜 그게 나왔는지
 * 모른다(2026-09-17 사용자 결정).
 */
describe("지어낸 칸 표시", () => {
  it("저장된 목록을 읽어 온다", () => {
    expect(source).toContain("project.data.inventedSlots ?? []");
  });

  /**
   * **새로 기획한 뒤에도 받아야 한다.**
   *
   * 새로 만든 작업은 초기값이 늘 비어 있다. 기획을 돌린 뒤 목록을 안 받으면
   * 칸은 AI 가 다 채웠는데 **표가 하나도 안 붙는다** — 주 경로에서 이 기능이
   * 한 번도 안 보인다(2026-09-17 리뷰).
   */
  it("기획한 뒤 새 목록을 받는다", () => {
    expect(source).toContain("setInvented(body.project.data.inventedSlots ?? [])");
  });

  /** 저장 뒤에는 서버가 정리한 것을 받는다. 무엇을 뺄지는 서버가 정한다. */
  it("저장한 뒤에도 맞춘다", () => {
    expect(source).toContain("setInvented(body.project?.data?.inventedSlots ?? [])");
  });

  it("그 칸에 표를 붙인다", () => {
    expect(source).toContain("표붙은칸.includes(field)");
    expect(source).toContain("AI 가 골라 채움");
  });

  /**
   * **화면에 표를 붙일 수 있는 칸만 센다.**
   *
   * 기획은 열한 칸을 채우는데 이 화면은 아홉을 그린다. 그 둘을 섞어 빼면
   * 「적어 주신 말로 채운 칸은 -1개」가 뜬다(2026-09-17 리뷰).
   */
  it("셀 때도 같은 목록을 쓴다", () => {
    expect(source).toContain("const 표붙은칸 = invented.filter(");
    expect(source).toContain("filledFields.length - 표붙은칸.length");
    // 날 목록으로 세면 음수가 난다.
    expect(source).not.toContain("filledFields.length - invented.length");
  });

  /**
   * **만들기 전에 먼저 저장한다.**
   *
   * 미리보기는 화면 state 를 보고 생성은 저장값을 본다. 전에는 값이 **내용**만
   * 갈랐는데, 이제 「글자를 넣지 말라」라는 **분기**까지 가른다. 그래서 칸을
   * 고치고 저장 안 한 채 만들면 미리보기에는 글자가 보이는데 **글자 하나 없는
   * 그림**이 나온다(2026-09-17 리뷰).
   *
   * 고친 것을 버리는 쪽이 아니라 **살리는 쪽**으로 맞춘다 — 사람이 방금 한 일이다.
   */
  it("만들기 전에 저장한다", () => {
    const 만들기 = source.slice(
      source.indexOf("async function generate()"),
      source.indexOf("async function pollUntilDone"),
    );

    expect(만들기.length, "generate 를 못 찾았다").toBeGreaterThan(50);
    expect(만들기).toContain("if (!await saveSlots()) return;");
  });

  /** 저장이 실패했는데 만들면 틀린 값으로 그림을 만든다 — 값이 드는 일이다. */
  it("저장 실패를 삼키지 않는다", () => {
    const 저장 = source.slice(
      source.indexOf("async function saveSlots"),
      source.indexOf("async function runPlan"),
    );

    expect(저장).toContain("return true;");
    expect(저장).toContain("return false;");
  });

  /**
   * **손댄 칸은 더 이상 AI 것이 아니다.** 표를 그대로 두면 자기가 쓴 글에
   * 「확인하세요」가 붙어 있는 꼴이 된다.
   */
  it("고치면 표가 사라진다", () => {
    expect(source).toContain('setInvented((current) => current.filter((name) => name !== field))');
  });
});

/**
 * **「글자와 피사체의 관계」를 04 에서 뺐다.**
 *
 * 2026-09-17 사용자 판단. 세 가지 까닭이 있다.
 *
 * **① 사용자가 판단할 수 없는 것을 묻는다.** 「통과 / 뒤로 / 가림 / 감쌈」은
 * 타이포그래피 용어다. 레퍼런스를 붙인 사람은 답이 그림에 있고, 안 붙인
 * 사람은 고를 근거가 없다.
 *
 * **② 04 를 한 칸 가볍게 한다.** 「틀린 칸만 고치기」가 이 화면의 강점인데
 * 칸이 많을수록 그 강점이 준다(2026-09-08 결정).
 *
 * **③ 레퍼런스가 없으면 모델이 정하는 편이 낫다.** 우리가 한 낱말로 못 박으면
 * 오히려 좁힌다.
 *
 * **값은 남는다.** 레퍼런스에서 읽은 값을 담을 자리가 필요하고, 프롬프트의 그
 * 한 줄이 「타이포가 인물을 가로지른다」를 모델에 전한다. 다만 그 값은 이제
 * 읽어서만 들어온다(`mergeGrammar`).
 */
describe("글자와 피사체의 관계", () => {
  it("04 에서 고르는 칸이 없다", () => {
    /*
      **주석은 빼고 본다.** 왜 뺐는지 적어 둔 자리에 그 이름이 나온다 —
      까닭을 적을수록 시험이 화를 내면 다음 사람이 까닭을 안 적는다.
    */
    const 그린것 = source
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    expect(그린것).not.toContain("글자와 피사체의 관계");
    expect(그린것).not.toContain("TYPE_INTERACTIONS");
  });

  /** 화면이 그 값을 손으로 바꾸는 길도 없어야 한다. */
  it("화면이 그 값을 안 바꾼다", () => {
    expect(source).not.toContain("typeInteraction: current.typeInteraction");
  });
});
