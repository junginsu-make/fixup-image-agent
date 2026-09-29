import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 저장소는 `core.filemode=false` 라 실행 권한이 git 에 안 남는다. CI 가 릴리스
 * 꾸러미(tar)를 풀면 형제 `.sh` 파일에 실행 권한이 없을 수 있다 — 그런데
 * `install-host.sh` 가 `render-caddy-site.sh` 를 `bash` 없이 직접 실행하다가
 * (`"${script_dir}/render-caddy-site.sh" …`) 이 문제로 "Permission denied"(126)
 * 로 멈춘 적이 있다. 시험 서버 A 에서는 Windows `scp` 가 파일을 0755 로 올려서
 * 안 드러났다.
 *
 * `deploy-release.sh`·`rollback-release.sh` 는 형제 스크립트를 항상
 * `bash "$(dirname "$0")/x.sh"` 로 부르는 관례가 있다. 그 관례를 어기지
 * 않았는지 정적으로 검사한다 — 줄 머리(명령 위치)에 형제 `.sh` 경로가
 * `bash` 없이 나오면 실패한다. `install`·`cp` 등의 **인자**로 쓰인 경로는
 * (파일을 실행하는 게 아니라 옮기는 것이므로) 걸리지 않는다.
 */

const DIR = join(__dirname, "..", "..", "..", "..", "deploy", "ec2");
const FILES = ["install-host.sh", "deploy-release.sh", "rollback-release.sh"];

// 줄(trim 됨)이 형제 .sh 경로로 "시작"하면 그 자리가 명령 위치라는 뜻이다.
// `bash` 로 시작하는 줄은 이미 올바르게 부른 것이므로 이 패턴 자체가
// 매치되지 않는다(패턴이 줄의 맨 앞부터 매치해야 하기 때문).
const SIBLING_SH_AT_LINE_START =
  /^"?(?:\$\{script_dir\}|\$\(dirname\s+"\$0"\))\/[\w.-]+\.sh"?(?:\s|$)/;

describe("deploy/ec2 형제 스크립트 호출에는 항상 bash 접두어가 있다", () => {
  it.each(FILES)("%s", (file) => {
    const content = readFileSync(join(DIR, file), "utf8");
    const offenders = content
      .split("\n")
      .map((line, index) => ({ index: index + 1, line: line.trim() }))
      .filter(({ line }) => SIBLING_SH_AT_LINE_START.test(line));

    expect(offenders).toEqual([]);
  });
});
