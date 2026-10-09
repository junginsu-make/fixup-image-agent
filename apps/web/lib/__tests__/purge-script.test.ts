import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * **6개월 자동 파기를 부르는 서버 스크립트**(2026-10-08 — 계획 3단계). 하루 한 번 systemd 타이머가 돌린다.
 *
 * 비밀값(`CRON_SECRET`)은 app.env 에서 읽어 **명령줄에 싣지 않는다** — 명령줄은 서버의 누구나 `ps` 로 본다.
 * curl 이 표준 입력에서 머리를 읽는다. 값이 없거나 짧으면 부르지 않고 실패로 끝난다(타이머 기록에 남는다).
 * curl 은 가짜로 바꿔 끼워 받은 인자와 표준 입력을 적어 둔다.
 */
const SCRIPT = join(__dirname, "..", "..", "..", "..", "deploy", "ec2", "purge.sh");
let dir = "";

const run = (appEnv: string) => {
  writeFileSync(join(dir, "app.env"), appEnv);
  try {
    execFileSync("bash", [SCRIPT], {
      env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, PURGE_APP_ENV: join(dir, "app.env") },
      stdio: "pipe",
    });
    return 0;
  } catch (error) {
    return (error as { status?: number }).status ?? 1;
  }
};
const curlArgs = () => (existsSync(join(dir, "args")) ? readFileSync(join(dir, "args"), "utf8") : "");
const curlStdin = () => (existsSync(join(dir, "stdin")) ? readFileSync(join(dir, "stdin"), "utf8") : "");
const SECRET = "a".repeat(40);

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "purge-sh-"));
  mkdirSync(join(dir, "bin"));
  const unix = dir.split("\\").join("/");
  const curl = join(dir, "bin", "curl");
  writeFileSync(curl, [
    "#!/usr/bin/env bash",
    `printf '%s\\n' "$@" > "${unix}/args"`,
    `cat > "${unix}/stdin"`,
    "exit 0",
    "",
  ].join("\n"));
  chmodSync(curl, 0o755);
});
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe("자동 파기 스크립트", () => {
  it("서버 안 주소를 POST 로 부르고, 비밀값은 표준 입력으로만 넘긴다", () => {
    expect(run(`NODE_ENV=production\nCRON_SECRET=${SECRET}\n`)).toBe(0);
    expect(curlArgs()).toContain("http://127.0.0.1:3000/api/internal/purge-deleted");
    expect(curlArgs()).toContain("POST");
    expect(curlArgs()).not.toContain(SECRET);
    expect(curlStdin()).toBe(`x-cron-secret: ${SECRET}\n`);
  });

  it("따옴표와 윈도 줄끝을 벗긴다", () => {
    expect(run(`CRON_SECRET="${SECRET}"\r\n`)).toBe(0);
    expect(curlStdin()).toBe(`x-cron-secret: ${SECRET}\n`);
  });

  it("값이 없거나 짧으면 부르지 않고 실패로 끝난다", () => {
    expect(run("NODE_ENV=production\n")).not.toBe(0);
    expect(run("CRON_SECRET=short\n")).not.toBe(0);
    expect(curlArgs()).toBe("");
  });
});
