import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **지운(지우는 중인) 문서의 늦은 결과는 라이브러리에 쓰지 않는다**(3차 리뷰 W12).
 *
 * 문서를 지우면 그 문서의 라이브러리 작업도 정리한다. 그 뒤에 끝난 생성이 라이브러리에 새 작업을
 * 열면, 목록은 지운 문서의 것이라 숨기는데(`excluded`) 줄과 파일은 영영 남는다 — 아무도 못 보고
 * 못 지우는 그림이 된다. 문서 기능이 꺼져 있으면 문서 표를 건드리지 않고 지금처럼 맞춘다.
 */
const st = vi.hoisted(() => ({
  flag: true,
  deleted: [] as string[],
  asked: [] as string[],
  /** 회원의 지운 문서 목록 전체를 읽은 횟수 — 동기화마다 읽으면 안 된다(최종 리뷰 L4). */
  listed: 0,
  checkFails: false,
  /** 라이브러리 작업을 찾을 때 건 `is` 조건. */
  isCalls: [] as Array<[string, unknown]>,
  save: vi.fn(async () => ({ ok: true, id: "new-item", imageCount: 1 })),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../local-store", () => ({ isLocalStoreEnabled: () => false, localStoreRoot: () => "x" }));
vi.mock("../../documents/flags", () => ({ serverDocumentsEnabled: () => st.flag }));
vi.mock("../../documents/index", () => ({
  serverDocumentsEnabled: () => st.flag,
  documentServices: () => ({
    repo: {
      deletedDraftIds: async () => { st.listed += 1; return st.deleted; },
      isDeleted: async (userId: string, key: string) => {
        st.asked.push(`${userId}:${key}`);
        if (st.checkFails) throw new Error("db down");
        return st.deleted.includes(key);
      },
    },
  }),
}));
vi.mock("../../../server-library", () => ({
  saveLibraryItem: st.save,
  replaceLibraryImageAt: vi.fn(async () => ({ ok: true })),
  reorderLibraryImages: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../../../supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {
        select: () => q, eq: () => q, is: (column: string, value: unknown) => { st.isCalls.push([column, value]); return q; }, in: () => q, order: () => q, limit: () => q,
        then: (ok: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
      };
      return q;
    },
  }),
}));

import { syncDocumentLibraryLater, syncDocumentLibraryNow } from "../library-sync";

const U = "11111111-1111-4111-8111-111111111111";
const DOC = "22222222-2222-4222-8222-222222222222";
const job = { userId: U, documentId: DOC, pageSectionIds: ["s1"], images: [{ sectionId: "s1", image: { base64: "iVBORw0KGgo=", mimeType: "image/png" } }] };

beforeEach(() => {
  Object.assign(st, { flag: true, deleted: [], asked: [], listed: 0, checkFails: false, isCalls: [] });
  st.save.mockClear();
  vi.restoreAllMocks();
});

describe("W12 지운 문서의 늦은 생성", () => {
  it("문서를 지운 뒤 끝난 생성(생성 라우트) → 라이브러리에 아무것도 쓰지 않는다", async () => {
    st.deleted = [DOC];
    await syncDocumentLibraryLater(job);
    expect(st.save).not.toHaveBeenCalled();
    // 이 문서 한 건만 묻는다. 지운 문서 목록 전체는 읽지 않는다(L4).
    expect(st.asked).toEqual([`${U}:${DOC}`]);
    expect(st.listed).toBe(0);
  });

  it("화면의 확인 문도 지운 문서는 맞추지 않고 「모자란 것 없음」으로 답한다", async () => {
    st.deleted = ["other", DOC];
    expect(await syncDocumentLibraryNow(job)).toEqual({ desired: 0, covered: 0, missing: [] });
    expect(st.save).not.toHaveBeenCalled();
  });

  it("살아 있는 문서는 지금처럼 맞춘다(창을 닫아도 결과가 남는다, F11)", async () => {
    await syncDocumentLibraryLater(job);
    expect(st.save).toHaveBeenCalledTimes(1);
    expect(st.asked).toEqual([`${U}:${DOC}`]);
    expect(st.listed).toBe(0);
  });

  it("문서 기능이 꺼져 있으면 문서 표를 묻지 않고 맞춘다", async () => {
    st.flag = false;
    await syncDocumentLibraryLater(job);
    expect(st.asked).toEqual([]);
    expect(st.save).toHaveBeenCalledTimes(1);
  });

  it("지웠는지 확인을 못 하면 결과를 잃지 않게 맞춘다(로그는 남긴다)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    st.checkFails = true;
    await syncDocumentLibraryLater(job);
    expect(st.save).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});

/**
 * **회원이 지운 라이브러리 작업은 보관 중인 자료다**(2026-10-08). 맞추기가 그 작업을 후보로 고르면 그림을 덧붙이거나
 * 갈아 끼우면서 옛 파일을 지운다 — 보관한 증거가 바뀐다(리뷰).
 */
describe("지운 라이브러리 작업", () => {
  it("맞출 작업을 찾을 때 지운 작업은 고르지 않는다", async () => {
    await syncDocumentLibraryLater(job);
    expect(st.isCalls).toContainEqual(["deleted_at", null]);
  });
});
