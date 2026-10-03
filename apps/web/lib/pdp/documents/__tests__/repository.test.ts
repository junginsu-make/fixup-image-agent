import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalDocumentRepository } from "../local-repository";
import type { ServerDocument } from "../model";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const roots: string[] = [];
function setup() {
  const root = mkdtempSync(join(tmpdir(), "pdp-doc-test-")); roots.push(root);
  return { root, repo: createLocalDocumentRepository(root) };
}
const doc = (title = "초안"): ServerDocument => ({
  schemaVersion: 3, id, title, stage: "input", sourceMode: "image",
  assets: {}, body: { sections: [], inputs: {}, settings: {}, references: [], blueprint: {}, editor: null },
});
afterEach(() => { for (const root of roots.splice(0)) {
  if(!root.startsWith(join(tmpdir(),"pdp-doc-test-")))throw Error("unsafe test cleanup");
  rmSync(root, { recursive: true, force: true });
} });
describe("문서 저장소 계약", () => {
  it("소유자만 읽고 저장하며 같은 원본 이관은 하나만 만든다", async () => {
    const { repo } = setup();
    await repo.create(owner, id, "legacy");
    expect((await repo.create(owner, crypto.randomUUID(), "legacy")).id).toBe(id);
    expect(await repo.get(other, id)).toBeNull();
    await expect(repo.save(other, id, 0, doc(), crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
    await expect(repo.create(other, id)).rejects.toMatchObject({ status: 404 });
  });
  it("같은 버전에서 동시에 저장하면 한쪽만 성공하고 다시 읽어도 남는다", async () => {
    const { repo, root } = setup(); await repo.create(owner, id);
    const a = createLocalDocumentRepository(root), b = createLocalDocumentRepository(root);
    const writes = await Promise.allSettled([
      a.save(owner, id, 0, doc("A"), crypto.randomUUID()),
      b.save(owner, id, 0, doc("B"), crypto.randomUUID()),
    ]);
    expect(writes.filter(x => x.status === "fulfilled")).toHaveLength(1);
    expect(writes.find(x => x.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    expect((await createLocalDocumentRepository(root).get(owner, id))?.revision).toBe(1);
  });
  it("응답이 유실돼 같은 요청을 재전송해도 버전이 늘지 않는다", async () => {
    const { repo } = setup(); await repo.create(owner, id); const requestId = crypto.randomUUID();
    await repo.save(owner, id, 0, doc(), requestId);
    expect((await repo.save(owner, id, 0, doc(), requestId)).revision).toBe(1);
    await expect(repo.save(owner, id, 0, doc("다른 내용"), requestId)).rejects.toMatchObject({ status: 400 });
  });
  it("최근 이전 버전 20개를 남기고 과거 복원도 새 버전으로 저장한다", async () => {
    const { repo } = setup(); await repo.create(owner, id);
    for (let n = 0; n < 24; n++) await repo.save(owner, id, n, doc(String(n)), crypto.randomUUID());
    const revisions = await repo.revisions(owner, id);
    expect(revisions).toHaveLength(20);
    expect(revisions.map(x => x.revision)).toEqual(Array.from({ length: 20 }, (_, i) => 23 - i));
    const past = await repo.get(owner, id, 4);
    expect((await repo.save(owner, id, 24, past!.document!, crypto.randomUUID())).revision).toBe(25);
    expect(await repo.get(other, id, 4)).toBeNull();
  });
  it("삭제 표시 후 옛 창이 되살리지 못하며 정리 실패를 재시도할 수 있다", async () => {
    const { repo } = setup(); await repo.create(owner, id);
    await repo.save(owner, id, 0, doc(), crypto.randomUUID());
    await expect(repo.markDeleted(other, id)).rejects.toMatchObject({ status: 404 });
    await repo.markDeleted(owner, id);
    expect(await repo.get(owner, id)).toBeNull();
    expect(await repo.list(owner)).toEqual([]);
    await expect(repo.save(owner, id, 1, doc(), crypto.randomUUID())).rejects.toMatchObject({ status: 404 });
    expect((await repo.markDeleted(owner, id)).id).toBe(id);
    await repo.finishDelete(owner, id);
    await expect(repo.create(owner, id)).rejects.toMatchObject({ status: 404 });
  });
});
