import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADMIN_TABS, activeAdminTab } from "../admin-tabs";

/**
 * **관리자 화면은 탭 셋이다** (2026-09-22 사용자 요청).
 *
 * 전에는 회원 목록(`/admin`)·크레딧 관리(`/admin/members`)·비용 전략이 따로였고,
 * 나머지 둘은 `/admin` 위쪽 버튼으로 들어갔다. 한 회원을 보려면 두 화면을 오가야 했다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");

describe("탭", () => {
  it("회원 관리 · 시스템 관리 · 비용 전략 순서다", () => {
    expect(ADMIN_TABS.map((tab) => tab.label)).toEqual(["회원 관리", "시스템 관리", "비용 전략"]);
  });

  it("주소마다 맞는 탭이 켜진다", () => {
    expect(activeAdminTab("/admin")).toBe("/admin");
    expect(activeAdminTab("/admin/system")).toBe("/admin/system");
    expect(activeAdminTab("/admin/cost-lab")).toBe("/admin/cost-lab");
    expect(activeAdminTab("/admin/cost-lab/doc/index.html")).toBe("/admin/cost-lab");
    // 비슷한 앞부분에 속지 않는다.
    expect(activeAdminTab("/admin/systematic")).toBe("/admin");
  });

  /*
    **리터럴이 아니라 뜻을 잰다.** 전에는 `<AdminTabs />` 를 그대로 찾았는데,
    2026-09-28 안 본 문의 수를 넘기게 되면서(설계 §10.3) 이 시험이 걸렸다.
    지키려던 것은 「모든 관리자 화면 위에 탭이 붙는다」이지 인자가 없다는
    것이 아니었다.
  */
  it("모든 관리자 화면 위에 탭이 붙는다", () => {
    expect(read("app/admin/layout.tsx")).toContain("<AdminTabs");
  });

  it("탭마다 화면이 있다", () => {
    for (const tab of ADMIN_TABS) {
      expect(() => read(`app${tab.href}/page.tsx`), tab.href).not.toThrow();
    }
  });
});

/**
 * **안 본 문의 수를 탭에 적는다**(설계 §10.3).
 *
 * 문의함은 시스템 관리 안쪽에 있어서 **들어가 보지 않으면 모른다.** 답을
 * 기다리는 사람이 있는데 아무도 안 보는 것이 가장 나쁘다.
 */
describe("안 본 문의 수", () => {
  const tabs = read("app/admin/admin-tabs.tsx");
  const layout = read("app/admin/layout.tsx");

  it("셸이 수를 세어 탭에 넘긴다", () => {
    expect(layout).toContain("countNewInquiries");
    expect(layout).toContain("newInquiries={newInquiries}");
  });

  it("시스템 관리 탭에만 붙는다", () => {
    expect(tabs).toContain('tab.href === "/admin/system" && newInquiries > 0');
  });

  /** 0 을 적어 두면 눈이 익어서 1 도 안 보인다. */
  it("0 이면 아무것도 안 그린다", () => {
    expect(tabs).toContain("newInquiries > 0");
  });

  /** 눈으로만 알리면 화면을 못 보는 사람은 모른다. */
  it("읽어 주는 말이 붙는다", () => {
    expect(tabs).toMatch(/aria-label=\{`안 본 문의 \$\{newInquiries\}건`\}/);
  });
});

describe("따로 들어가던 문을 없앴다", () => {
  const page = read("app/admin/page.tsx");

  it("회원 관리 탭에 비용 전략·크레딧 관리 버튼이 없다", () => {
    expect(page).not.toContain('href="/admin/cost-lab"');
    expect(page).not.toContain('href="/admin/members"');
  });

  it("옛 크레딧 관리 주소는 회원 관리 탭으로 보낸다", () => {
    const legacy = read("app/admin/members/page.tsx");
    expect(legacy).toContain("redirect(");
    expect(legacy).toContain("/admin?");
  });

  it("시스템 설정은 시스템 관리 탭에 있고 회원 탭에는 없다", () => {
    const system = read("app/admin/system/page.tsx");
    for (const panel of ["<CostPanel", "<ModelCatalogPanel", "<AiBadgePanel", "<ShowcasePanel", "<PlanSettings", "<InquiryPanel"]) {
      expect(system, panel).toContain(panel);
      expect(page, panel).not.toContain(panel);
    }
  });

  it("시스템 설정을 바꾸면 시스템 탭으로 돌아온다", () => {
    const actions = read("app/admin/actions.ts");
    expect(actions).toContain('redirect("/admin/system?notice=price_updated")');
    expect(actions).toContain('redirect("/admin/system?notice=rate_updated")');
    expect(actions).toContain("redirect(`/admin/system?notice=${next");
  });
});

describe("회원 관리 탭", () => {
  const page = read("app/admin/page.tsx");

  /** 쪽을 먼저 나누고 나중에 거르면 50명 중 3명만 남은 쪽이 생긴다. 거르기와 쪽 나누기를 장부가 함께 한다. */
  it("장부가 켜져 있으면 목록을 장부에서 거르고 나눠 읽는다", () => {
    expect(page).toContain('rpc("credit_admin_members"');
    expect(page).toMatch(/p_plan:/);
    expect(page).toMatch(/p_balance:/);
  });

  it("한 줄에 크레딧과 플랜이 같이 있다", () => {
    const table = read("app/admin/member-list/member-table.tsx");
    for (const column of ["크레딧", "플랜", "플랜·크레딧"]) expect(table).toContain(column);
  });

  it("여러 명에게 플랜 부여·해지·지급·승인을 한 번에 한다", () => {
    const bar = read("app/admin/member-list/bulk-bar.tsx");
    for (const label of ["크레딧 지급", "플랜 부여·변경", "플랜 해지", "승인·정지"]) expect(bar).toContain(label);
  });

  /** DB 함수가 플랜 하나를 받아 전원에게 적는다. 섞어 보내면 다른 플랜 회원의 기록이 바뀐다. */
  it("일괄 해지는 같은 플랜끼리만 한다", () => {
    expect(read("app/admin/member-list/bulk-bar.tsx")).toContain("plans.length > 1");
  });
});
