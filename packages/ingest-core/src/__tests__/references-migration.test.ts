import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.join(process.cwd(), "../../supabase/migrations/202608310003_references.sql"),
  "utf8",
);

describe("참고 이미지 마이그레이션", () => {
  it("세 테이블을 만든다", () => {
    for (const table of ["reference_images", "reference_sets", "reference_set_items"]) {
      expect(sql).toContain(`create table public.${table}`);
    }
  });

  it("기존 library_items 를 건드리지 않는다", () => {
    // tool CHECK 를 고치면 개인 배포가 영향을 받는다. 아예 손대지 않는다.
    expect(sql).not.toContain("library_items");
    expect(sql).not.toMatch(/drop constraint/);
  });

  it("소유자 규약을 따른다", () => {
    expect(sql).toContain("references public.profiles(id)");
    expect(sql).toContain("(select auth.uid()) = user_id");
    expect(sql).not.toContain("auth.users(id)");
  });

  it("Storage 정책을 새로 만들지 않는다", () => {
    // 경로 첫 칸이 user_id 라 기존 정책이 그대로 적용된다.
    expect(sql).not.toContain("storage.objects");
    expect(sql).not.toContain("storage.buckets");
  });

  it("역할은 셋뿐이다", () => {
    expect(sql).toContain("check (role in ('cover','body','ending'))");
  });

  it("용도로 카드뉴스와 포스터를 가른다", () => {
    expect(sql).toContain("check (purpose in ('cardnews','poster','both'))");
  });

  it("컬럼 권한을 회수 먼저, 허용 목록 나중에", () => {
    for (const table of ["reference_images", "reference_sets", "reference_set_items"]) {
      const revokeAt = sql.indexOf(`revoke update on public.${table}`);
      const grantAt = sql.indexOf("grant update (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("Storage 경로는 사용자와 이미지 id 아래 references 경로다", () => {
    expect(sql).toContain("user_id::text || '/references/' || id::text");
    expect(sql).toContain("'\\.[^/]+$'");
  });

  it("INSERT 권한도 회수 먼저, 허용 목록 나중에", () => {
    for (const table of ["reference_images", "reference_sets", "reference_set_items"]) {
      const revokeAt = sql.indexOf(`revoke insert on public.${table}`);
      const grantAt = sql.indexOf("grant insert (", revokeAt);
      expect(revokeAt).toBeGreaterThan(-1);
      expect(grantAt).toBeGreaterThan(revokeAt);
    }
  });

  it("INSERT 와 UPDATE 는 허용 컬럼만 연다", () => {
    const compactSql = sql.replace(/\s+/g, " ");

    expect(compactSql).toContain(
      "grant insert (user_id, storage_path, title, purpose, width, height) on public.reference_images to authenticated",
    );
    expect(compactSql).toContain(
      "grant insert (user_id, name, purpose) on public.reference_sets to authenticated",
    );
    expect(compactSql).toContain(
      "grant insert (set_id, reference_image_id, role, position) on public.reference_set_items to authenticated",
    );
    expect(compactSql).toContain(
      "grant update (title, purpose) on public.reference_images to authenticated",
    );
    expect(compactSql).toContain(
      "grant update (name, purpose, updated_at) on public.reference_sets to authenticated",
    );
    expect(compactSql).toContain(
      "grant update (role, position) on public.reference_set_items to authenticated",
    );
  });
});
