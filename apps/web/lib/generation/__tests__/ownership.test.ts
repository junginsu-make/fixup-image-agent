import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  eq: vi.fn(), row: null as { id: string } | null, error: null as { message: string } | null,
  rpc: vi.fn(async (_name: string, _input: unknown) => ({ data: [] as Array<{ path: string }>, error: null as { message: string } | null })),
}));
vi.mock("../../local-store", () => ({ isLocalStoreEnabled: () => false }));
vi.mock("../../supabase/admin", () => ({ createSupabaseAdminClient: () => {
  const query = { select: () => query, eq: (key: string, value: string) => { mock.eq(key,value); return query; }, maybeSingle: async () => ({ data: mock.row, error: mock.error }) };
  return { from: () => query, rpc: mock.rpc };
} }));
import { assertProjectWrite, assertReadableAssetPaths, ProjectWriteDenied } from "../ownership";
beforeEach(() => { mock.eq.mockClear(); mock.row=null; mock.error=null; mock.rpc.mockResolvedValue({data:[],error:null}); });
describe("the actual ownership boundary", () => {
  it("requires both project id and authenticated owner", async () => {
    await expect(assertProjectWrite("actor","poster","project")).rejects.toBeInstanceOf(ProjectWriteDenied);
    expect(mock.eq.mock.calls).toEqual([["id","project"],["user_id","actor"]]);
    mock.row={id:"project"}; await expect(assertProjectWrite("actor","poster","project")).resolves.toBeUndefined();
  });
  it("fails closed on metadata lookup errors or any unapproved asset", async () => {
    mock.error={message:"database unavailable"};
    await expect(assertProjectWrite("actor","sns","project")).rejects.toThrow();
    mock.rpc.mockResolvedValue({data:[{path:"actor/a.png"}],error:null});
    await expect(assertReadableAssetPaths("actor",["actor/a.png","someone-else/b.png"])).rejects.toBeInstanceOf(ProjectWriteDenied);
    await expect(assertReadableAssetPaths("actor",["actor/a.png"])).resolves.toBeUndefined();
  });
});
