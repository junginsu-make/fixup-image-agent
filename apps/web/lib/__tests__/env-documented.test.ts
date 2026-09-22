import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **코드가 읽는 이름은 배포 문서에 다 있어야 한다.**
 *
 * `deploy/ec2/app.env.example` 은 스스로 이렇게 적어 두었다.
 *
 *   「여기 적힌 이름은 전부 코드가 실제로 읽는 것이다. 안 읽는 이름을 적어 두면
 *     채워 놓고도 안 되는 이유를 찾느라 시간을 쓴다.」
 *
 * 그런데 **반대 방향은 아무도 안 지켰다.** 2026-09-22 에 재 보니 코드가 읽는
 * 36 개 중 넷이 문서에 없었다.
 *
 *   CREDIT_LEDGER            크레딧 장부 전체를 여는 스위치
 *   OWNER_EMAIL              소유자 계정 보호 (관리자끼리 서로 못 지우게)
 *   LOCAL_CREDIT_PREVIEW     로컬 미리보기
 *   NEXT_PUBLIC_API_BASE_URL API 주소 바꾸기
 *
 * 배포하는 사람은 그 파일만 본다. 거기 없으면 **기능이 있는 줄도 모른다.**
 * `CREDIT_LEDGER` 가 딱 그 상태였다 — 다 만들어 놓고 켤 방법이 문서에 없었다.
 *
 * ── 빼는 이름은 문서가 정한다 ──────────────────────────────────
 *
 * 그 파일 맨 아래 「여기에 넣지 않는다」 절이 `LOCAL_*` 을 이유와 함께 빼 두었다.
 * 여기서 새로 정하지 않고 그 판단을 그대로 따른다. `NODE_ENV` 는 Next 가 정하는
 * 것이라 우리가 채울 값이 아니다.
 */

const root = join(__dirname, "..", "..", "..", "..");
const example = readFileSync(join(root, "deploy", "ec2", "app.env.example"), "utf8");

/** 이 파일이 스스로 「넣지 않는다」고 적어 둔 것들. */
const NOT_DEPLOYED = /^(NODE_ENV$|LOCAL_)/;

const SOURCE_ROOTS = [
  join(root, "apps", "web", "app"),
  join(root, "apps", "web", "lib"),
  join(root, "apps", "worker", "src"),
  join(root, "packages"),
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "__tests__" || name === "dist") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(path);
  }
  return out;
}

describe("배포 문서가 코드보다 뒤처지지 않는다", () => {
  it("코드가 읽는 환경변수는 전부 app.env.example 에 있다", () => {
    const documented = new Set(example.match(/^[A-Z][A-Z0-9_]*(?==)/gm) ?? []);
    /**
     * 별칭도 적힌 것으로 본다 — 주석에 나오면 배포하는 사람이 찾을 수 있다.
     *
     * **단어 경계로 본다.** 부분일치로 두었더니 `KNOWLEDGE_ACCESS_KEY`(단수
     * 폴백)가 문서의 `KNOWLEDGE_ACCESS_KEYS`(복수)에 먹혀 통과했다 — 배포하는
     * 사람은 단수 이름이 있는 줄도 몰랐다. 이 검사가 막으려던 바로 그 상황이다.
     */
    const mentioned = (name: string) =>
      documented.has(name) || new RegExp(String.raw`\b${name}\b`).test(example);

    const missing = new Set<string>();
    for (const dir of SOURCE_ROOTS) {
      for (const file of walk(dir)) {
        const source = readFileSync(file, "utf8");
        for (const hit of source.match(/process\.env\.[A-Z][A-Z0-9_]*/g) ?? []) {
          const name = hit.slice("process.env.".length);
          if (NOT_DEPLOYED.test(name) || mentioned(name)) continue;
          missing.add(name);
        }
      }
    }

    expect(
      [...missing].sort(),
      "코드는 읽는데 deploy/ec2/app.env.example 에 없습니다. 적어 두지 않으면 배포하는 사람이 기능이 있는 줄도 모릅니다.",
    ).toEqual([]);
  });
});
