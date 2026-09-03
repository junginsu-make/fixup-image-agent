import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readJsonRows, writeJsonRows } from "../json-file";

const made: string[] = [];

async function scratch(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "layout-json-"));
  made.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(made.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("readJsonRows", () => {
  it("아직 아무도 저장하지 않았으면 빈 목록이다", async () => {
    expect(await readJsonRows(path.join(await scratch(), "none.json"))).toEqual([]);
  });

  /**
   * 「파일이 없다」와 「파일이 깨졌다」는 다르다. 깨진 것을 없는 것으로 삼키면
   * 다음 저장이 그 위를 덮어 사람이 저장해 둔 것이 통째로 사라진다.
   */
  it("깨진 파일은 삼키지 않고 알린다", async () => {
    const target = path.join(await scratch(), "broken.json");
    await writeFile(target, "{ 잘린", "utf8");

    await expect(readJsonRows(target)).rejects.toThrow();
  });

  it("목록이 아닌 것이 들어 있어도 알린다", async () => {
    const target = path.join(await scratch(), "object.json");
    await writeFile(target, '{"a":1}', "utf8");

    await expect(readJsonRows(target)).rejects.toThrow();
  });
});

describe("writeJsonRows", () => {
  it("쓴 것을 그대로 다시 읽는다", async () => {
    const target = path.join(await scratch(), "rows.json");
    await writeJsonRows(target, [{ id: "a" }, { id: "b" }]);

    expect(await readJsonRows<{ id: string }>(target)).toEqual([{ id: "a" }, { id: "b" }]);
  });

  it("폴더가 없어도 만들어 쓴다", async () => {
    const target = path.join(await scratch(), "deep", "down", "rows.json");
    await writeJsonRows(target, [{ id: "a" }]);

    expect(await readJsonRows(target)).toEqual([{ id: "a" }]);
  });

  it("쓰는 도중 이름이 남지 않는다 — 임시 파일을 옮겨 붙인다", async () => {
    const root = await scratch();
    const target = path.join(root, "rows.json");
    await writeJsonRows(target, [{ id: "a" }]);

    // 임시 파일이 남아 있으면 다음 읽기가 그걸 목록으로 착각할 수 있다.
    await expect(readFile(`${target}.tmp`, "utf8")).rejects.toThrow();
  });
});
