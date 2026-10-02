import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **전화번호 읽기·저장**(2026-10-02). 회원은 동의와 함께 적고 지울 수 있다. 관리자는
 * 이미 동의한 번호만 고치거나 지울 수 있다 — 동의 없이 관리자가 번호를 넣으면 회원의
 * 선택 동의가 없는 수집이 된다(DB 제약 `profiles_phone_valid` 도 막는다).
 */
vi.mock("server-only", () => ({}));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));

type Call = { table: string; op: "select" | "update"; columns?: string; values?: Record<string, unknown> };
let calls: Call[] = [];
let current: Record<string, unknown> | null = null;
let selectError: { code: string; message: string } | null = null;

vi.mock("../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => ({
      select: (columns: string) => {
        calls.push({ table, op: "select", columns });
        const failing = selectError && columns.includes("phone");
        const result = failing ? { data: null, error: selectError } : { data: current ? [current] : [], error: null };
        return {
          in: async () => result,
          eq: () => ({ maybeSingle: async () => (failing ? result : { data: current, error: null }) }),
        };
      },
      update: (values: Record<string, unknown>) => {
        calls.push({ table, op: "update", values });
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));

const { readProfileExtras, updateProfilePhone } = await import("../profile-store");
const updates = () => calls.filter((call) => call.op === "update").map((call) => call.values ?? {});

beforeEach(() => {
  calls = [];
  current = { id: "u1", display_name: "김회원", referrer_input: null, phone: null, phone_consented_at: null };
  selectError = null;
});

describe("회원이 자기 번호를 적는다", () => {
  it("동의와 함께 적으면 하이픈 꼴로, 동의 시각과 함께 저장한다", async () => {
    const result = await updateProfilePhone("u1", { phone: "01012345678", consent: true }, "member");
    expect(result.ok).toBe(true);
    const [values] = updates();
    expect(values.phone).toBe("010-1234-5678");
    expect(typeof values.phone_consented_at).toBe("string");
  });

  it("동의하지 않으면 아무것도 저장하지 않는다", async () => {
    const result = await updateProfilePhone("u1", { phone: "010-1234-5678", consent: false }, "member");
    expect(result.ok).toBe(false);
    expect(updates()).toEqual([]);
  });

  it("형식이 틀리면 아무것도 저장하지 않는다", async () => {
    const result = await updateProfilePhone("u1", { phone: "010-12", consent: true }, "member");
    expect(result.ok).toBe(false);
    expect(updates()).toEqual([]);
  });

  /** 이름만 고쳐 저장해도 번호가 함께 넘어온다. 그때 동의 시각을 새로 찍으면 안 된다. */
  it("저장된 번호와 같으면 아무것도 쓰지 않는다 — 동의 시각이 그대로다", async () => {
    current = { ...current, phone: "010-1234-5678", phone_consented_at: "2026-10-02T00:00:00Z" };
    for (const actor of ["member", "admin"] as const) {
      const result = await updateProfilePhone("u1", { phone: "01012345678", consent: false }, actor);
      expect(result.ok).toBe(true);
    }
    current = { ...current, phone: null, phone_consented_at: null };
    expect((await updateProfilePhone("u1", { phone: "", consent: false }, "member")).ok).toBe(true);
    expect(updates()).toEqual([]);
  });

  it("비우면 번호와 동의 기록을 함께 지운다 — 동의 철회다", async () => {
    current = { ...current, phone: "010-1234-5678", phone_consented_at: "2026-10-02T00:00:00Z" };
    const result = await updateProfilePhone("u1", { phone: "", consent: false }, "member");
    expect(result.ok).toBe(true);
    expect(updates()).toEqual([expect.objectContaining({ phone: null, phone_consented_at: null })]);
  });
});

describe("관리자가 회원 번호를 고친다", () => {
  it("동의한 적 없는 회원에게 번호를 넣지 않는다", async () => {
    const result = await updateProfilePhone("u1", { phone: "010-1234-5678", consent: false }, "admin");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("회원이 직접");
    expect(updates()).toEqual([]);
  });

  it("이미 동의한 번호는 고치되, 동의 시각은 그대로 둔다", async () => {
    current = { ...current, phone: "010-1234-5678", phone_consented_at: "2026-10-02T00:00:00Z" };
    const result = await updateProfilePhone("u1", { phone: "010 9999 8888", consent: false, expected: "010-1234-5678" }, "admin");
    expect(result.ok).toBe(true);
    const [values] = updates();
    expect(values.phone).toBe("010-9999-8888");
    expect(values).not.toHaveProperty("phone_consented_at");
  });

  /** 관리자 화면을 오래 열어 둔 사이 회원이 번호를 바꾸면, 관리자가 보던 값으로 덮지 않는다(독립 리뷰 M2). */
  it("관리자가 보던 번호와 지금 번호가 다르면 아무것도 쓰지 않는다", async () => {
    current = { ...current, phone: "010-5555-6666", phone_consented_at: "2026-10-02T01:00:00Z" };
    for (const phone of ["", "010-9999-8888"]) {
      const result = await updateProfilePhone("u1", { phone, consent: false, expected: "010-1234-5678" }, "admin");
      expect(result.ok).toBe(false);
      expect(result.message).toContain("새로고침");
    }
    current = { ...current, phone: "010-5555-6666" };
    const fromEmpty = await updateProfilePhone("u1", { phone: "", consent: false, expected: null }, "admin");
    expect(fromEmpty.ok).toBe(false);
    expect(updates()).toEqual([]);
  });

  it("지울 수는 있다 — 동의 기록도 함께 지운다", async () => {
    current = { ...current, phone: "010-1234-5678", phone_consented_at: "2026-10-02T00:00:00Z" };
    const result = await updateProfilePhone("u1", { phone: " ", consent: false, expected: "010-1234-5678" }, "admin");
    expect(result.ok).toBe(true);
    expect(updates()).toEqual([expect.objectContaining({ phone: null, phone_consented_at: null })]);
  });
});

describe("읽기", () => {
  it("번호를 함께 읽는다", async () => {
    current = { ...current, phone: "010-1234-5678" };
    const extras = await readProfileExtras(["u1"]);
    expect(extras.get("u1")?.phone).toBe("010-1234-5678");
  });

  it("번호 칸이 아직 없는 서버에서도 이름·추천코드는 읽는다", async () => {
    selectError = { code: "42703", message: "column profiles.phone does not exist" };
    const extras = await readProfileExtras(["u1"]);
    expect(extras.get("u1")?.displayName).toBe("김회원");
    expect(extras.get("u1")?.phone).toBeNull();
  });
});
