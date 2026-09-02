import { describe, expect, it } from "vitest";
import {
  imageInsertRows,
  posterAssetPath,
  projectInsertRow,
  projectPatchRow,
  requestInsertRow,
  toImageRecord,
  toProjectRecord,
} from "../poster/supabase-store-core";

const slots = { kind: "행사 포스터", headline: "여름 세일" } as never;

describe("작업 행을 기록으로", () => {
  it("뱀 표기를 낙타 표기로 바꾼다", () => {
    const record = toProjectRecord({
      id: "p1", user_id: "u1", title: "여름 세일", status: "done",
      ratio: "4:5", model_id: "gpt-image-2",
      data: { instruction: "시원하게", variants: 2, referenceIds: [], preservedIds: [], slots },
      created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z",
    });
    expect(record).toMatchObject({
      id: "p1", title: "여름 세일", status: "done", ratio: "4:5", modelId: "gpt-image-2",
      createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-02T00:00:00.000Z",
    });
    expect(record.data.instruction).toBe("시원하게");
  });

  it("user_id 는 기록에 넣지 않는다", () => {
    // 화면으로 나가는 값이다. 남의 것이 아니라는 판단은 이미 질의에서 끝났다.
    const record = toProjectRecord({
      id: "p1", user_id: "u1", title: "t", status: "draft", ratio: "1:1", model_id: "m",
      data: { instruction: "", variants: 1, referenceIds: [], preservedIds: [], slots },
      created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-01T00:00:00.000Z",
    });
    expect(record).not.toHaveProperty("userId");
    expect(record).not.toHaveProperty("user_id");
  });
});

describe("작업을 만들 때", () => {
  it("본문에 섞인 소유자를 무시하고 세션 사용자로 넣는다", () => {
    const row = projectInsertRow("session-user", Object.assign({
      title: "여름 세일", status: "draft" as const, ratio: "4:5", modelId: "gpt-image-2",
      data: { instruction: "", variants: 1, referenceIds: [], preservedIds: [], slots },
    }, { user_id: "attacker", userId: "attacker" }));

    expect(row.user_id).toBe("session-user");
    expect(Object.keys(row).sort()).toEqual(["data", "model_id", "ratio", "title", "user_id"]);
  });

  it("status 는 보내지 않는다 — 기본값이 draft 다", () => {
    // 마이그레이션이 authenticated 에게 status INSERT 권한을 주지 않았다.
    const row = projectInsertRow("u1", {
      title: "t", status: "done" as const, ratio: "1:1", modelId: "m",
      data: { instruction: "", variants: 1, referenceIds: [], preservedIds: [], slots },
    });
    expect(row).not.toHaveProperty("status");
  });
});

describe("작업을 고칠 때", () => {
  it("보낸 칸만 바꾸고 수정 시각을 찍는다", () => {
    const row = projectPatchRow({ status: "done" }, "2026-09-02T01:00:00.000Z");
    expect(row).toEqual({ status: "done", updated_at: "2026-09-02T01:00:00.000Z" });
  });

  it("안 보낸 칸은 넣지 않는다", () => {
    // undefined 를 넣으면 supabase-js 가 null 로 덮어쓴다.
    const row = projectPatchRow({ title: "새 제목" }, "2026-09-02T01:00:00.000Z");
    expect(row).not.toHaveProperty("status");
    expect(row).not.toHaveProperty("data");
  });
});

describe("비용 장부", () => {
  it("세션 사용자로 묶고 뱀 표기로 바꾼다", () => {
    const row = requestInsertRow("session-user", {
      projectId: "p1", parentImageId: null, editInstruction: null,
      modelId: "gpt-image-2", ratioId: "4:5", mode: "i2i",
      size: { width: 1088, height: 1360 }, requestedImages: 2,
      unitCostUsd: 0.178, costApproximate: false,
    });
    expect(row).toEqual({
      user_id: "session-user", project_id: "p1", parent_image_id: null, edit_instruction: null,
      model_id: "gpt-image-2", ratio_id: "4:5", mode: "i2i",
      size: { width: 1088, height: 1360 }, requested_images: 2,
      unit_cost_usd: 0.178, cost_approximate: false,
    });
  });
});

describe("결과 이미지 행", () => {
  it("한 번에 여러 장을 세션 사용자로 묶는다", () => {
    const rows = imageInsertRows("u1", [
      { projectId: "p1", generationRequestId: "r1", variantIndex: 0, assetPath: "a.png", width: 1, height: 2, review: null },
      { projectId: "p1", generationRequestId: "r1", variantIndex: 1, assetPath: "b.png", width: null, height: null, review: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      user_id: "u1", project_id: "p1", generation_request_id: "r1",
      variant_index: 0, asset_path: "a.png", width: 1, height: 2, review: null,
    });
    expect(rows[1]!.variant_index).toBe(1);
  });

  it("기록으로 되돌릴 때 화면이 읽을 주소를 함께 준다", () => {
    // 화면은 저장 경로를 모른다. 로컬이든 운영이든 같은 주소로 읽는다.
    const record = toImageRecord({
      id: "i1", user_id: "u1", project_id: "p1", generation_request_id: "r1",
      variant_index: 2, selected: true, asset_path: "u1/poster/p1/2.png",
      width: 1088, height: 1360, review: null, created_at: "2026-09-01T00:00:00.000Z",
    });
    expect(record).toMatchObject({ id: "i1", projectId: "p1", variantIndex: 2, selected: true });
    expect(record.url).toBe("/api/poster/projects/p1/images/2/file");
  });
});

describe("저장 경로", () => {
  it("소유자가 첫 칸이다", () => {
    // library 버킷의 정책이 경로 첫 칸으로 소유자를 판정한다.
    expect(posterAssetPath("u1", "p1", 0)).toBe("u1/poster/p1/0.png");
  });
});
