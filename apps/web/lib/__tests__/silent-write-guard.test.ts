import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **0줄 쓰기를 성공으로 읽지 않는가.**
 *
 * Supabase 의 `update`/`delete` 는 조건에 걸리는 줄이 없어도 오류가 아니다.
 * 팀 읽기 정책이 select 전용이라, 목록과 상세에는 팀원의 것이 보이는데 쓰기만
 * RLS 가 막는다 — 그 조합이 「지웠습니다」 뒤 새로고침하면 그대로 있는 상태와,
 * 크레딧·fal 값은 나가고 결과는 어디에도 안 남는 상태를 만들었다.
 *
 * 세 곳이 같은 함정에 빠져 있었다. 셋 다 지운 줄을 세는지 여기서 지킨다.
 */
const flowStore = readFileSync(new URL("../sns-flow-store.ts", import.meta.url), "utf8");
const library = readFileSync(new URL("../server-library.ts", import.meta.url), "utf8");
const posterStore = readFileSync(new URL("../poster/supabase-store.ts", import.meta.url), "utf8");
const posterRoute = readFileSync(
  new URL("../../app/api/poster/projects/[id]/route.ts", import.meta.url), "utf8",
);

describe("카드뉴스 저장소", () => {
  it("저장이 소유자 조건을 걸고 쓴 줄을 센다", () => {
    expect(flowStore).toContain('.eq("id", projectId).eq("user_id", userId)');
    expect(flowStore).toContain("if (!(result.data ?? []).length) throw new SnsProjectNotWritable();");
  });

  it("삭제도 지운 줄을 센다", () => {
    expect(flowStore).toContain("if (!(removed.data ?? []).length) throw new SnsProjectNotWritable();");
  });

  it("못 쓰는 것은 500 이 아니라 403 으로 답한다", () => {
    expect(flowStore).toContain("status: 403");
  });
});

describe("라이브러리 삭제", () => {
  it("지운 줄이 없으면 성공이라고 하지 않는다", () => {
    expect(library).toContain('.select("id")');
    expect(library).toContain("denied: true as const");
  });

  it("행을 지우고 나서 파일에 손댄다", () => {
    // 앞뒤가 바뀌면, 지울 권한이 없는 항목의 그림만 지우고 행은 남는다.
    expect(library.indexOf('from("library_items").delete()'))
      .toBeLessThan(library.lastIndexOf("storage.from(BUCKET).remove(paths)"));
  });
});

describe("포스터 삭제", () => {
  it("저장소가 지운 줄이 있었는지 알려 준다", () => {
    expect(posterStore).toContain('.eq("id", id).eq("user_id", userId)\n        .select("id")');
    expect(posterStore).toContain("return (data ?? []).length > 0;");
  });

  it("**정말 지워졌을 때만 파일에 손댄다**", () => {
    // 파일 삭제는 admin 클라이언트라 RLS 를 우회한다. 행 삭제가 막힌 상태로
    // 이어서 돌면 남의 그림만 되돌릴 수 없게 지운다.
    expect(posterRoute).toContain("const removed = await createPosterService(stores.projects).remove(id);");
    expect(posterRoute.indexOf("if (!removed) {"))
      .toBeLessThan(posterRoute.indexOf("await removePosterAssets(paths);"));
  });
});
