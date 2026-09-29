import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * **정적 파일은 Caddy 가 직접 내준다**(2026-09-29 설계 §3.1-3). Node 한 코어가 초당
 * 32~40건에서 막히던 로그인 전 화면 부담을 던다. 릴리스 폴더는 앱 계정만 읽으므로
 * (비밀값이 옆에 있다) Caddy 는 **사본**만 읽는다.
 */
const SCRIPT = join(__dirname, "..", "..", "..", "..", "deploy", "ec2", "sync-static.sh");
function canSymlink(): boolean {
  const probe = mkdtempSync(join(tmpdir(), "static-probe-"));
  try { mkdirSync(join(probe, "t")); symlinkSync(join(probe, "t"), join(probe, "l")); return true; }
  catch { return false; } finally { rmSync(probe, { recursive: true, force: true }); }
}
const onLinuxLike = canSymlink() ? describe : describe.skip;

let root = "";
const release = (id: string, withStatic = true) => {
  const dir = join(root, "releases", id);
  mkdirSync(join(dir, "apps", "web"), { recursive: true });
  if (withStatic) {
    mkdirSync(join(dir, "apps", "web", ".next", "static", "chunks"), { recursive: true });
    writeFileSync(join(dir, "apps", "web", ".next", "static", "chunks", "a.js"), `// ${id}\n`);
  }
  return dir;
};
const sync = (dir: string, id: string) =>
  execFileSync("bash", [SCRIPT, dir, id, join(root, "static")], { encoding: "utf8" });

onLinuxLike("sync-static.sh", () => {
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), "static-")); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("릴리스의 .next/static 을 _next/static 경로로 복사하고 current 를 옮긴다", () => {
    sync(release("r1"), "r1");
    expect(readFileSync(join(root, "static", "r1", "_next", "static", "chunks", "a.js"), "utf8")).toBe("// r1\n");
    expect(readlinkSync(join(root, "static", "current"))).toBe(join(root, "static", "r1"));
  });

  it("새 릴리스로 current 를 옮겨도 옛 사본은 남는다 — 옛 화면이 부르는 조각", () => {
    sync(release("r1"), "r1");
    sync(release("r2"), "r2");
    expect(readlinkSync(join(root, "static", "current"))).toBe(join(root, "static", "r2"));
    expect(existsSync(join(root, "static", "r1", "_next", "static", "chunks", "a.js"))).toBe(true);
  });

  it("정적 폴더가 없는 릴리스는 아무것도 안 바꾸고 성공한다 — Caddy 가 Node 로 넘긴다", () => {
    sync(release("r1"), "r1");
    sync(release("old", false), "old");
    expect(readlinkSync(join(root, "static", "current"))).toBe(join(root, "static", "r1"));
    expect(existsSync(join(root, "static", "old"))).toBe(false);
  });

  it("릴리스 id 에 경로 문자가 있거나 점으로 시작하면 종료 코드 2 로 이유를 남기고 거절한다", () => {
    for (const badId of ["../x", ".x"]) {
      let error: unknown;
      try {
        sync(release("r1"), badId);
      } catch (caught) {
        error = caught;
      }
      const execError = error as { status?: number | null; stderr?: string };
      expect(execError.status).toBe(2);
      expect(execError.stderr).toContain("잘못된 릴리스 id");
    }
  });

  it("사본의 폴더는 0750, 파일은 0640 권한이다 — Caddy 는 일반 계정이라 더 넓으면 안 된다", () => {
    sync(release("r1"), "r1");
    const dirMode = (statSync(join(root, "static", "r1", "_next", "static")).mode & 0o777).toString(8);
    const fileMode = (statSync(join(root, "static", "r1", "_next", "static", "chunks", "a.js")).mode & 0o777).toString(8);
    expect(dirMode).toBe("750");
    expect(fileMode).toBe("640");
  });

  it("같은 id 로 두 번 동기화해도 성공하고 current 가 그대로다 — 서비스 중인 사본을 다시 쓰지 않는다", () => {
    const dir = release("r1");
    sync(dir, "r1");
    expect(() => sync(dir, "r1")).not.toThrow();
    expect(readlinkSync(join(root, "static", "current"))).toBe(join(root, "static", "r1"));
    expect(readFileSync(join(root, "static", "r1", "_next", "static", "chunks", "a.js"), "utf8")).toBe("// r1\n");
  });

  it("전에 죽은 채 남은 .tmp 가 있어도 새로 시작해 정상 처리한다 — 서비스 중인 사본 위에 덮어쓰지 않는다", () => {
    mkdirSync(join(root, "static", ".r1.tmp", "stale"), { recursive: true });
    writeFileSync(join(root, "static", ".r1.tmp", "stale", "junk.txt"), "leftover");
    sync(release("r1"), "r1");
    expect(readFileSync(join(root, "static", "r1", "_next", "static", "chunks", "a.js"), "utf8")).toBe("// r1\n");
    expect(existsSync(join(root, "static", ".r1.tmp"))).toBe(false);
    expect(readlinkSync(join(root, "static", "current"))).toBe(join(root, "static", "r1"));
  });
});
