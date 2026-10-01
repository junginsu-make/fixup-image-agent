import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **브라우저 번들은 서버 전용 모듈을 끌어오면 안 된다.**
 *
 * 2026-10-01 S3b 시험 서버 빌드가 `next build` 에서 멈췄다. `"use client"` 인 카드뉴스 화면이
 * `lib/sns/queued-flow.ts` 의 순수 도우미 하나를 들였는데, 그 파일이 `lib/fal/upload.ts` 를 통해
 * 계정 풀(`lib/fal/pool/*`) → `lib/supabase/admin.ts` → `server-only` 까지 끌고 왔다. tsc·vitest 는
 * 번들을 만들지 않으니 통과했다.
 *
 * 그래서 `"use client"` 파일마다 상대 경로 import 를 끝까지 따라가, 그 안에 서버 전용 표시가 없는지 본다.
 * `import type` 은 지워지므로 따라가지 않는다. 패키지(`@…`, 이름) import 는 이 저장소 밖이라 보지 않는다.
 */
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SERVER_ONLY = /^\s*import\s+["']server-only["']/m;
/** 서버 액션 파일은 번들에 들어가지 않고 참조만 간다 — 그 안은 따라가지 않는다. */
const USE_SERVER = /^\s*["']use server["']/;
const SKIP_DIRS = new Set(["node_modules", ".next", "__tests__", "public"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function resolveImport(from: string, spec: string): string | null {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** 값으로 쓰이는 상대 경로 import(정적·동적)만 돌려준다. */
function relativeImportsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specs: string[] = [];
  for (const match of source.matchAll(/^\s*import\s+(?!type\s)[^;]*?from\s+["'](\.[^"']+)["']/gm)) specs.push(match[1]!);
  for (const match of source.matchAll(/^\s*export\s+(?!type\s)[^;]*?from\s+["'](\.[^"']+)["']/gm)) specs.push(match[1]!);
  for (const match of source.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) specs.push(match[1]!);
  return specs.map((spec) => resolveImport(file, spec)).filter((path): path is string => path !== null);
}

/** 클라이언트 파일에서 서버 전용 파일까지 가는 길 하나를 찾는다. 없으면 null. */
function serverOnlyPath(entry: string): string[] | null {
  const seen = new Set<string>();
  const stack: Array<{ file: string; path: string[] }> = [{ file: entry, path: [entry] }];
  while (stack.length > 0) {
    const { file, path } = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    if (file !== entry && USE_SERVER.test(source)) continue;
    if (SERVER_ONLY.test(source)) return path;
    for (const next of relativeImportsOf(file)) stack.push({ file: next, path: [...path, next] });
  }
  return null;
}

const clientFiles = [...walk(join(WEB_ROOT, "app")), ...walk(join(WEB_ROOT, "lib"))].filter((file) =>
  /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
);

describe("브라우저 번들 경계", () => {
  it("클라이언트 파일을 찾았다(시험이 빈손으로 통과하지 않게)", () => {
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it.each(clientFiles.map((file) => [relative(WEB_ROOT, file)]))("%s 는 server-only 를 끌어오지 않는다", (file) => {
    const path = serverOnlyPath(join(WEB_ROOT, file));
    expect(path?.map((step) => relative(WEB_ROOT, step)) ?? null).toBeNull();
  });
});
