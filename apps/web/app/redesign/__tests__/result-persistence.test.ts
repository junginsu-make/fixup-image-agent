import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { persistRedesignResult } from "../result-persistence";
import { saveProjectToDb } from "../redesign-storage";
import type { Project } from "../redesign-model";

describe("T-SAVE: 리디자인 자동 저장의 결과", () => {
  it("IndexedDB transaction abort도 실패로 완료되어 화면에 알릴 수 있다", async () => {
    const original = IDBObjectStore.prototype.put;
    const spy = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (this: IDBObjectStore, value) {
      const request = original.call(this, value); this.transaction.abort(); return request;
    });
    try {
      const project: Project = { id: "aborted", title: "test", sections: [], createdAt: new Date().toISOString(),
        channel: "store", model: "openai", count: 1, ratio: "3:4", status: "done", files: [], request: "" };
      const saving = saveProjectToDb(project);
      const result = await Promise.race([saving.then(() => "saved", () => "failed"), new Promise((resolve) => setTimeout(() => resolve("hung"), 150))]);
      expect(result).toBe("failed");
    } finally { spy.mockRestore(); }
  });
  it("HTTP 실패를 성공으로 취급하지 않고 로컬 결과는 보존한다", async () => {
    const local = vi.fn(async () => {});
    const result = await persistRedesignResult(local, async () => new Response("error", { status: 500 }));
    expect(local).toHaveBeenCalledOnce();
    expect(result).toEqual({ localSaved: true, librarySaved: false });
  });
  it("로컬 실패여도 서버 저장을 시도하고 각각의 상태를 반환한다", async () => {
    const upload = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await persistRedesignResult(async () => { throw new Error("quota"); }, upload))
      .toEqual({ localSaved: false, librarySaved: true });
    expect(upload).toHaveBeenCalledOnce();
  });
});
