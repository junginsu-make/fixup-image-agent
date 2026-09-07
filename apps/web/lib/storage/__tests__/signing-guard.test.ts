import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **서명은 서버 권한으로만 한다.**
 *
 * Storage 정책이 경로의 첫 칸을 소유자로 본다. 회원 세션으로 서명하면 남의
 * 파일에 서명할 수 없고, 팀이 생기는 순간 같은 팀 사람의 그림을 목록에 못
 * 건다 — 파일을 옮기지 않고 그 자리를 푸는 방법이 서명을 옮기는 것이었다.
 *
 * 이 규칙은 **되돌아가기 쉽다.** 다음에 서명이 필요한 자리를 만드는 사람이
 * 바로 옆의 세션 클라이언트를 그대로 쓰면 그만이고, 그때는 아무 오류도 안
 * 난다 — 자기 파일에는 서명이 되기 때문이다. 팀원의 그림이 안 뜨는 것으로만
 * 드러나고, 그때는 원인을 찾기 어렵다.
 *
 * 그래서 글로 막는다.
 */

const libDir = fileURLToPath(new URL("../..", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // 시험 자신은 흉내를 위해 두 이름을 함께 적는다.
      return entry === "__tests__" || entry === "node_modules" ? [] : sourceFiles(full);
    }
    return entry.endsWith(".ts") ? [full] : [];
  });
}

/** 한 파일 안에서 세션 클라이언트로 만든 것에 서명을 시키고 있나. */
function signsWithSessionClient(source: string): boolean {
  // 세션 클라이언트를 아예 안 쓰면 볼 것이 없다. DB 질의에는 그대로 써야 한다.
  if (!source.includes("createSupabaseServerClient")) return false;
  return /createSignedUrls?\s*\(/.test(source);
}

describe("서명은 서버 권한으로만", () => {
  const offenders = sourceFiles(libDir)
    .filter((file) => !file.includes(`${path.sep}storage${path.sep}signing.ts`))
    .filter((file) => signsWithSessionClient(readFileSync(file, "utf8")))
    .map((file) => path.relative(libDir, file));

  it("세션 클라이언트로 서명하는 파일이 없다", () => {
    // 걸렸다면 `lib/storage/signing.ts` 의 `signPath`·`signPaths` 를 쓰면 된다.
    expect(offenders).toEqual([]);
  });
});
