import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { describeCommand } from "../member-list/confirm-card";

/**
 * 독립 리뷰(2026-09-22)가 찾은 자리들. **돈이 엉뚱한 회원에게 가지 않게** 한다.
 *
 * A 회원 패널에서 「지급 내용 확인」을 누른 뒤 반영하지 않고 B 의 패널을 열면, 전에는
 * 확인 카드에 A 의 명령이 그대로 남아 있었다. 카드 문구에 이름도 없어서 B 의 화면을
 * 보면서 A 에게 지급하게 됐다.
 */
const web = join(__dirname, "..", "..", "..");
const read = (file: string) => readFileSync(join(web, file), "utf8");
const A = "10000000-0000-4000-8000-00000000000a";
const B = "10000000-0000-4000-8000-00000000000b";
const email = (id: string) => (id === A ? "a@example.invalid" : id === B ? "b@example.invalid" : id);
const plan = (id: string) => (id === "basic" ? "Basic" : id);
const action = "20000000-0000-4000-8000-000000000001";

describe("확인 카드가 누구에게인지 말한다", () => {
  it("한 명이면 이메일을 적는다", () => {
    expect(describeCommand({ kind: "grant", users: [A], grantKind: "purchase", units: 500, amount: 0, expires: null, reason: "입금 확인", action }, plan, email)).toContain("a@example.invalid");
    expect(describeCommand({ kind: "paid", user: B, period: "2026-09-01", units: 75, amount: 90000, action }, plan, email)).toContain("b@example.invalid");
    expect(describeCommand({ kind: "subscription", users: [A], plan: "basic", status: "active", action }, plan, email)).toContain("a@example.invalid");
    expect(describeCommand({ kind: "revoke", user: A, grant: action, reason: "취소" }, plan, email)).toContain("a@example.invalid");
  });

  it("여럿이면 인원을 적는다", () => {
    const text = describeCommand({ kind: "grant", users: [A, B], grantKind: "purchase", units: 10, amount: 0, expires: null, reason: "이벤트", action }, plan, email);
    expect(text).toContain("2명");
    expect(text).toContain("각각");
  });

  it("플랜은 ID 가 아니라 이름으로 말한다", () => {
    expect(describeCommand({ kind: "subscription", users: [A], plan: "basic", status: "canceled", action }, plan, email)).toContain("Basic");
  });
});

describe("다른 회원을 열면 앞 사람의 것을 버린다", () => {
  const table = read("app/admin/member-list/member-table.tsx");

  it("열고 닫을 때 반영 대기 명령을 버린다", () => {
    expect(table).toMatch(/const open = \(id: string\) => \{ state\.cancel\(\);/);
    expect(table).toMatch(/const close = \(\) => \{ state\.cancel\(\);/);
  });

  it("패널을 회원마다 새로 만든다 — 입력하던 값이 다음 사람에게 넘어가지 않는다", () => {
    expect(table).toContain("<CreditPanel key={focus.profile.id}");
  });

  it("이력을 새로 읽는 동안 앞 사람의 이력을 비운다", () => {
    expect(read("app/admin/member-list/credit-panel.tsx")).toContain("setHistory(null)");
  });

  it("쪽이 바뀌면 고른 회원을 비운다", () => {
    expect(table).toContain("useEffect(() => { setSelected([]); }, [ids]);");
  });
});

describe("그 밖의 리뷰 지적", () => {
  it("서버와 브라우저가 같은 날짜를 그린다", () => {
    expect(read("app/admin/member-list/member-table.tsx")).toContain('toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })');
  });

  it("장부를 못 읽어도 회원 목록(승인·정지)은 뜬다", () => {
    const page = read("app/admin/page.tsx");
    expect(page).toMatch(/catch \(error\) \{\s*if \(!ledger\) throw error;/);
    expect(page).toContain("list = await plainPage(params, page);");
  });

  it("확인 대기 회원만 거를 수 있다", () => {
    const page = read("app/admin/page.tsx");
    expect(page).toContain('p_review: params.review === "1"');
    expect(page).toContain('name="review"');
  });

  it("플랜 추가가 있는 플랜을 덮어쓰지 않는다", () => {
    expect(read("app/admin/system/plan-settings.tsx")).toContain("taken.includes(");
  });

  it("CSV 로 받을 수 있다", () => {
    expect(read("app/admin/member-list/member-table.tsx")).toContain("exportCsv(rows, planName)");
  });
});
