import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pricePlans, PLAN_DEFAULTS, validatePlanInputs } from "../../../lib/admin/cost-forecast/subscription-plans";

/**
 * **크레딧도 고칠 수 있어야 한다**(2026-09-23 사용자 요청).
 *
 * 「위에 크레딧이 지금 75 150 300으로 고정되어 있지만 그것도 수정할 수 있게
 * 하고 크레딧 수정에 따라 한달에 만들 수 있는 양도 바꿀 수 있게 하세요」
 *
 * ── 계산은 이미 준비돼 있었다 ──────────────────────────────
 *
 * `subscription-plans.ts` 는 처음부터 크레딧을 입력으로 받는다. 막고 있던
 * 것은 **화면**이다 — 목표 마진·추가 할인만 입력칸이었고 크레딧은 글자였다.
 *
 * ── 왜 글로 재는가 ─────────────────────────────────────────
 *
 * 비용 전략실은 한 장짜리 HTML 이고, 그 안의 스크립트는 브라우저에서만
 * 돈다(`localStorage`·`document`). 시험 환경에는 DOM 이 없다. 옆의
 * `cost-lab.test.ts` 와 같은 사정이다.
 *
 * 그래서 **계산은 실제로 돌리고**, 화면은 글로 잠근다.
 */

const LAB = join(process.cwd(), "app/admin/cost-lab");

const 읽기 = (rel: string) => readFileSync(join(LAB, rel), "utf8");

/** 주석을 뺀 실제 코드. 고친 까닭을 적으려면 옛 말을 인용해야 한다. */
const 코드만 = (body: string) =>
  body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("계산은 크레딧을 이미 입력으로 받는다", () => {
  it("**크레딧을 바꾸면 가격이 따라온다**", () => {
    // 확정값이 바뀌어도 이 규칙은 같다. 그래서 값을 직접 준다.
    const 기준 = { id: "basic", name: "Basic", targetPct: 53.4, discountPct: 0 };
    const [작게] = pricePlans([{ ...기준, credits: 75 }]);
    const [크게] = pricePlans([{ ...기준, credits: 100 }]);

    expect(작게!.listPrice).toBe(90_000);
    expect(크게!.listPrice).toBe(120_000);
    // 1개당은 그대로다. 목표 마진을 지키기 때문이다.
    expect(크게!.unitPrice).toBe(1_200);
  });

  /**
   * **이것이 사용자가 원한 연결이다.** 크레딧을 고치면 한 달에 만들 수 있는
   * 양이 따라 바뀐다.
   */
  it("**크레딧을 바꾸면 만들 수 있는 양도 바뀐다**", () => {
    const [작게] = pricePlans([{ ...PLAN_DEFAULTS[0]!, credits: 45 }]);
    const [크게] = pricePlans([{ ...PLAN_DEFAULTS[0]!, credits: 450 }]);

    expect(작게!.usage).toEqual({ pdp: 5, cardnews: 9, images: 45, print: 22 });
    expect(크게!.usage).toEqual({ pdp: 50, cardnews: 90, images: 450, print: 225 });
  });

  it("**크레딧은 정수만 받는다** — 0.5개짜리 크레딧은 없다", () => {
    expect(() => validatePlanInputs([{ ...PLAN_DEFAULTS[0]!, credits: 75.5 }])).toThrow();
  });

  it("**0개나 음수는 안 받는다**", () => {
    expect(() => validatePlanInputs([{ ...PLAN_DEFAULTS[0]!, credits: 0 }])).toThrow();
    expect(() => validatePlanInputs([{ ...PLAN_DEFAULTS[0]!, credits: -1 }])).toThrow();
  });
});

describe("화면이 크레딧을 고칠 수 있게 연다", () => {
  const ui = 코드만(읽기("source/plans-ui.js"));

  it("**셀 파일이 있다** — 못 찾으면 아래가 전부 조용히 통과한다", () => {
    expect(ui.length).toBeGreaterThan(500);
  });

  it("**크레딧 칸이 입력칸이다**", () => {
    expect(ui, "크레딧을 입력칸으로 안 그린다").toMatch(/data-plan-field="credits"|'credits'/);
  });

  /**
   * **퍼센트 칸과 같은 규격을 쓰면 안 된다.** 목표 마진은 0~90에 0.1 단위지만
   * 크레딧은 1 이상의 정수다. 같은 규격을 쓰면 브라우저가 75.5 를 받아 준다.
   */
  it("**크레딧 칸은 정수 한 칸씩 움직인다**", () => {
    const 크레딧칸 = /credits[\s\S]{0,400}/.exec(ui)?.[0] ?? "";

    expect(크레딧칸, "크레딧 칸을 못 찾았다").toBeTruthy();
    expect(ui, "크레딧 칸이 1 단위가 아니다").toContain("step: 1");
  });

  it("**퍼센트 규격을 크레딧에 쓰지 않는다**", () => {
    /*
      전에는 입력칸 만드는 자리가 `max="90" step="0.1"` 을 못 박고 뒤에 `%` 를
      붙였다. 크레딧에 그대로 쓰면 90개가 상한이 된다.
    */
    expect(ui, "입력칸 규격이 아직 퍼센트로 못 박혀 있다").not.toMatch(/max="90" step="0\.1"/);
  });

  it("**고친 값이 계산으로 간다** — 입력만 열고 안 쓰면 아무것도 안 바뀐다", () => {
    expect(ui).toMatch(/\[t\.dataset\.planField\]: Number\(t\.value\)/);
  });
});

describe("화면 설명이 사실과 맞는다", () => {
  const html = 읽기("assets/index.html");

  it("**「크레딧은 고정」이라고 말하지 않는다**", () => {
    expect(html, "이제 고칠 수 있는데 고정이라고 적혀 있다").not.toContain("크레딧은 고정하고");
  });

  /**
   * **만들 수 있는 양이 크레딧에서 나온다고 말한다.** 표만 바뀌면 사용자는
   * 그 숫자가 어디서 왔는지 모른다.
   */
  it("**만들 수 있는 양이 크레딧을 따라간다고 적는다**", () => {
    expect(html).toContain("크레딧을 바꾸면");
  });

  it("**오류 문구가 크레딧까지 말한다**", () => {
    const 오류 = /id="plans-error"[^>]*>([^<]*)</.exec(html)?.[1] ?? "";

    expect(오류, "오류 문구를 못 찾았다").toBeTruthy();
    expect(오류, "크레딧이 틀렸을 때 뭐라 할지 안 적혀 있다").toContain("크레딧");
  });
});

/**
 * **만든 파일과 낸 파일이 같아야 한다.**
 *
 * `source/plans-ui.js` 를 고치고 `pnpm build:cost-forecast` 를 안 돌리면,
 * 화면은 옛 코드 그대로다. 시험은 source 를 보고 통과하는데 사용자는 아무
 * 변화도 못 본다.
 */
describe("낸 파일에 반영돼 있다", () => {
  it("**index.html 안의 스크립트가 source 와 같다**", () => {
    const html = 읽기("assets/index.html");
    const 실린것 = /<!-- plans-ui:start -->[\s\S]*?<!-- plans-ui:end -->/.exec(html)?.[0] ?? "";
    const source = 읽기("source/plans-ui.js").replace(/\r\n/g, "\n");

    expect(실린것, "생성 영역을 못 찾았다").toBeTruthy();
    expect(실린것.replace(/\r\n/g, "\n"), "build:cost-forecast 를 안 돌렸다").toContain(source.trim());
  });
});

/**
 * **저장 단추가 실제로 서버로 간다**(2026-09-23 사용자 요청).
 *
 * 「수정한 내용을 저장 후 (…) 회원 관리 페이지에서도 (…) 자동 적용 시켜야
 * 합니다」
 *
 * 서버 쪽은 `app/api/admin/__tests__/cost-plans-route.test.ts` 가 실제로
 * 돌려서 잰다. 여기는 **화면이 그 문을 두드리는가**만 본다 — 문은 멀쩡한데
 * 아무도 안 두드리면 사용자에게는 아무 일도 안 일어난다.
 */
describe("저장이 서버까지 간다", () => {
  const ui = 코드만(읽기("source/plans-ui.js"));
  const html = 읽기("assets/index.html");

  it("**저장 단추가 화면에 있다**", () => {
    expect(html, "저장 단추가 없다").toContain('id="plans-save"');
  });

  it("**그 단추에 손잡이가 걸려 있다**", () => {
    expect(ui, "저장 단추를 아무 데도 안 건다").toMatch(/el\('plans-save'\)\.onclick/);
  });

  it("**서버 문을 두드린다**", () => {
    expect(ui).toContain("/api/admin/cost-plans");
    expect(ui, "보내지 않고 읽기만 한다").toMatch(/method:\s*'POST'/);
  });

  it("**지금 화면의 플랜을 그대로 보낸다**", () => {
    expect(ui).toMatch(/JSON\.stringify\(\{ plans \}\)/);
  });

  /**
   * **저장했으면 다른 탭도 맞춘다.** 통합 요약·충전형·생산량이 옛 숫자를
   * 들고 있으면, 저장한 사람은 어느 쪽이 맞는지 모른다.
   */
  it("**저장에 성공하면 다른 탭에도 민다**", () => {
    const 저장함수 = /async function saveToServer\(\)[\s\S]*?\n  \}/.exec(ui)?.[0] ?? "";

    expect(저장함수, "저장 함수를 못 찾았다").toBeTruthy();
    expect(저장함수, "저장만 하고 다른 탭은 그대로 둔다").toMatch(/apply\(selected/);
  });

  it("**실패하면 실패했다고 말한다** — 조용히 넘어가지 않는다", () => {
    const 저장함수 = /async function saveToServer\(\)[\s\S]*?\n  \}/.exec(ui)?.[0] ?? "";

    expect(저장함수).toMatch(/plans-saved/);
    expect(저장함수).toContain("저장하지 못했습니다");
  });

  /** 두 번 눌러 두 번 저장되지 않게 한다. */
  it("**저장하는 동안 다시 못 누른다**", () => {
    const 저장함수 = /async function saveToServer\(\)[\s\S]*?\n  \}/.exec(ui)?.[0] ?? "";

    expect(저장함수).toMatch(/if \(저장중\) return/);
    expect(저장함수, "끝나고 단추를 다시 안 열어 준다").toMatch(/finally/);
  });
});

/**
 * **화면이 무엇이 일어나는지 말해야 한다.**
 *
 * 전에는 「이 브라우저에만 저장됩니다. 실제 결제 상품이나 회원에게 지급하는
 * 크레딧은 바꾸지 않습니다」였다. 이제 사실이 아니다 — 그대로 두면 운영자가
 * 안심하고 저장을 누른다.
 */
describe("무엇이 바뀌는지 알린다", () => {
  const html = 읽기("assets/index.html");

  it("**옛 약속이 안 남아 있다**", () => {
    expect(html, "안 바꾼다고 적혀 있는데 이제 바꾼다").not.toContain(
      "실제 결제 상품이나 회원에게 지급하는 크레딧은 바꾸지 않습니다",
    );
  });

  it("**저장하면 실제 플랜이 바뀐다고 적는다**", () => {
    expect(html).toContain("실제 구독 플랜이 바뀝니다");
  });

  it("**기존 구독자는 다음 지급부터라고 적는다**", () => {
    expect(html).toContain("다음 지급부터");
  });

  it("**손으로 더 주는 길이 남아 있다고 적는다**", () => {
    expect(html).toContain("크레딧 지급");
  });
});
