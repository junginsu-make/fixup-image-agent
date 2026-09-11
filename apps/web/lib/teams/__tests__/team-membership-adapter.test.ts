import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.hoisted(() => vi.fn(async (_name: string, _input: Record<string, unknown>) => ({ error: null as { message: string } | null })));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => ({ rpc }) }));
vi.mock("../../membership/server", () => ({ requireActiveMember: async () => ({ user: { id: "authenticated-actor" } }) }));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));
import { assignMember, removeMember, setMemberRole } from "../store";

// Last-leader protection, movement, rollback, and isolation are tested against
// real PostgreSQL in scripts/tests/membership-transaction.test.mjs.
describe("team mutation adapter", () => {
  beforeEach(() => { rpc.mockClear(); rpc.mockResolvedValue({ error: null }); });
  it("uses one transaction and the authenticated actor for an assignment", async () => {
    await assignMember("target", "team", "leader");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("change_team_membership_v2", {
      p_actor: "authenticated-actor", p_target: "target", p_action: "assign", p_team: "team", p_role: "leader",
    });
  });
  it("uses the same transaction boundary for removal and demotion", async () => {
    await removeMember("target"); await setMemberRole("target", "member");
    expect(rpc.mock.calls.map(call => call[1].p_action)).toEqual(["remove", "role"]);
  });
  it("does not report success when the database rejects a mutation", async () => {
    rpc.mockResolvedValue({ error: { message: "last_team_leader" } });
    await expect(assignMember("target", "team", "member")).rejects.toThrow("last_team_leader");
  });
});
