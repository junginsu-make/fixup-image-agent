import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readdirSync, symlinkSync, writeFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * 오래된 릴리스를 지우는 스크립트.
 *
 * **지우는 코드다.** 한 번 잘못 돌면 되돌릴 수 없고, 최악은 지금 돌고 있는
 * 릴리스를 지워 서비스가 파일을 잃는 것이다. 그래서 시험을 먼저 쓴다.
 *
 * 왜 필요한가 — `deploy-release.sh` 가 릴리스를 쌓기만 하고 지우지 않아
 * 2026-09-15 기준 96개 15G 가 쌓였다. 디스크 29G 중 2.8G 남았고, 배포 한 번이
 * 225MB(릴리스 163M + 꾸러미 62M)를 먹어 열두 번이면 찬다.
 */

const SCRIPT = join(__dirname, "..", "..", "..", "..", "deploy", "ec2", "prune-releases.sh");

/**
 * Windows 는 권한 없이 심볼릭 링크를 못 만든다.
 *
 * 이 스크립트는 `current` 심볼릭 링크를 보고 "돌고 있는 릴리스"를 가려내므로
 * 링크 없이 시험하면 정작 지켜야 할 것을 못 지킨다. **거짓 초록을 내느니
 * 건너뛴다.** 이 시험이 실제로 도는 곳은 CI(리눅스)와 운영 서버다.
 */
function canSymlink(): boolean {
  const probe = mkdtempSync(join(tmpdir(), "prune-probe-"));
  try {
    mkdirSync(join(probe, "target"));
    symlinkSync(join(probe, "target"), join(probe, "link"));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
}

const onLinuxLike = canSymlink() ? describe : describe.skip;

let root = "";

/** 릴리스 하나를 만든다. `age` 가 클수록 오래된 것이다. */
function makeRelease(id: string, ageMinutes: number): string {
  const path = join(root, "releases", id);
  mkdirSync(join(path, "apps", "web"), { recursive: true });
  writeFileSync(join(path, "apps", "web", "server.js"), "// 릴리스\n");
  const when = new Date(Date.now() - ageMinutes * 60_000);
  utimesSync(path, when, when);
  return path;
}

function remaining(): string[] {
  return readdirSync(join(root, "releases")).sort();
}

function prune(keep: number): string {
  return execFileSync("bash", [SCRIPT, String(keep), root], { encoding: "utf8" });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "prune-"));
  mkdirSync(join(root, "releases"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

onLinuxLike("prune-releases.sh", () => {
  it("최근 N 개만 남기고 나머지를 지운다", () => {
    for (let i = 0; i < 8; i += 1) makeRelease(`r${i}`, i * 10);
    symlinkSync(join(root, "releases", "r0"), join(root, "current"));

    prune(5);

    expect(remaining()).toEqual(["r0", "r1", "r2", "r3", "r4"]);
  });

  it("지금 돌고 있는 릴리스는 오래됐어도 남긴다", () => {
    // **이것이 이 시험의 핵심이다.** 옛 릴리스로 되돌려 둔 서버에서 배포하면
    // `current` 가 목록 아래쪽에 있다. 그걸 지우면 돌고 있는 서비스가
    // 파일을 잃는다.
    for (let i = 0; i < 8; i += 1) makeRelease(`r${i}`, i * 10);
    symlinkSync(join(root, "releases", "r7"), join(root, "current"));

    prune(3);

    expect(remaining()).toContain("r7");
    expect(remaining().sort()).toEqual(["r0", "r1", "r2", "r7"]);
  });

  it("남길 개수보다 적으면 아무것도 안 지운다", () => {
    for (let i = 0; i < 3; i += 1) makeRelease(`r${i}`, i * 10);
    symlinkSync(join(root, "releases", "r0"), join(root, "current"));

    prune(5);

    expect(remaining()).toEqual(["r0", "r1", "r2"]);
  });

  it("남길 개수가 1 보다 작으면 거부한다", () => {
    // 0 을 넘기면 전부 지운다는 뜻이 된다. 그런 뜻으로 부를 일이 없다.
    for (let i = 0; i < 3; i += 1) makeRelease(`r${i}`, i * 10);
    symlinkSync(join(root, "releases", "r0"), join(root, "current"));

    expect(() => prune(0)).toThrow();
    expect(remaining()).toEqual(["r0", "r1", "r2"]);
  });

  it("releases 폴더가 없으면 조용히 끝난다", () => {
    // 처음 설치한 서버다. 여기서 실패하면 배포 전체가 멎는다.
    rmSync(join(root, "releases"), { recursive: true, force: true });

    expect(() => prune(5)).not.toThrow();
  });

  it("무엇을 지웠는지 이름을 남긴다", () => {
    // 지운 것을 안 적으면 나중에 "왜 없지" 를 풀 길이 없다.
    for (let i = 0; i < 7; i += 1) makeRelease(`r${i}`, i * 10);
    symlinkSync(join(root, "releases", "r0"), join(root, "current"));

    const output = prune(5);

    expect(output).toContain("r5");
    expect(output).toContain("r6");
    expect(output).not.toContain("r0");
  });
});
