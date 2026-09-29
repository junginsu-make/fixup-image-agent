import { readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

/**
 * N6(2026-09-29 최종 고침 §6): install-host.sh 의 중복 사이트 검사는
 * site_address 와 다른 `*.caddy` 파일의 블록 머리글을 비교해 이미 같은
 * 주소가 있으면 아무것도 바꾸지 않고 멈춘다(설치 스크립트가 실행되기 전,
 * useradd/install 등 시스템 변경 전이다). 기존 두 조건은 스킴이 다르면
 * 놓친다 — `site_address="https://formwith.fix-up.kr"` 로 줬는데 다른
 * 파일에 스킴 없는 맨 도메인 블록(`formwith.fix-up.kr {`)이 있는 경우다.
 * 세 번째 조건을 더해 이 경우도 잡는다.
 *
 * install-host.sh 전체는 root·systemd·`/etc/caddy` 접근이 있어야 돌릴 수
 * 있어(정적 시험으로는 한계가 있다), 여기서는 (1) 해당 OR 조건이 스크립트
 * 본문에 있는지 정적으로 확인하고, (2) 그 조건과 완전히 같은 grep 판정
 * 로직을 스크립트에서 그대로 뽑아 임시 디렉터리에 대해 실제로 실행해
 * 참·거짓 판정이 맞는지 확인한다.
 */
const DEPLOY_DIR = join(__dirname, "..", "..", "..", "..", "deploy", "ec2");
const installHostPath = join(DEPLOY_DIR, "install-host.sh");
const installHost = readFileSync(installHostPath, "utf8");

describe("install-host.sh 의 중복 사이트 검사 — 세 번째 조건 (N6)", () => {
  it("site_address 가 https:// 이면 스킴 없는 도메인 블록도 같은 주소로 본다는 조건이 있다", () => {
    expect(installHost).toContain('[[ ${site_address} == https://* ]] && grep -Eq "^${host_pattern}[[:space:]]*\\{" "${other}"');
  });

  it("세 번째 조건이 기존 두 조건과 OR 로 묶여 있다", () => {
    const pattern =
      /grep -Eq "\^\$\{site_pattern\}\[\[:space:\]\]\*\\\{" "\$\{other\}"[\s\S]{0,40}\|\|[\s\S]{0,80}grep -Eq "\^https\?:\/\/\$\{host_pattern\}" "\$\{other\}"[\s\S]{0,80}\|\|[\s\S]{0,120}\$\{site_address\} == https:\/\/\*/;
    expect(installHost).toMatch(pattern);
  });

  // 스크립트에서 판정 로직만 그대로 뽑아(root·systemd 없이) 실제 bash 로
  // 돌려, 세 조건을 가르는 정확한 시나리오를 확인한다.
  const runDuplicateCheck = (siteAddress: string, otherFileContent: string) => {
    const dir = mkdtempSync(join(tmpdir(), "dup-site-"));
    try {
      const otherFile = join(dir, "formwith.caddy");
      writeFileSync(otherFile, otherFileContent);
      const script = `
set -euo pipefail
site_address=$1
other=$2
host=\${site_address#http://}
host=\${host#https://}
site_pattern=$(printf '%s' "\${site_address}" | sed 's/\\./\\\\./g')
host_pattern=$(printf '%s' "\${host}" | sed 's/\\./\\\\./g')
if grep -Eq "^\${site_pattern}[[:space:]]*\\{" "\${other}" \\
    || grep -Eq "^https?://\${host_pattern}" "\${other}" \\
    || { [[ \${site_address} == https://* ]] && grep -Eq "^\${host_pattern}[[:space:]]*\\{" "\${other}"; }; then
  echo DUPLICATE
else
  echo OK
fi
`;
      const scriptFile = join(dir, "check.sh");
      writeFileSync(scriptFile, script);
      return execFileSync("bash", [scriptFile, siteAddress, otherFile], { encoding: "utf8" }).trim();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("https://도메인 을 주고 다른 파일에 스킴 없는 같은 도메인 블록이 있으면 중복으로 본다", () => {
    expect(runDuplicateCheck("https://formwith.fix-up.kr", "formwith.fix-up.kr {\n\treverse_proxy 127.0.0.1:3000\n}\n")).toBe(
      "DUPLICATE",
    );
  });

  it("서로 다른 도메인이면 중복으로 보지 않는다", () => {
    expect(runDuplicateCheck("https://other.example.com", "formwith.fix-up.kr {\n\treverse_proxy 127.0.0.1:3000\n}\n")).toBe(
      "OK",
    );
  });

  it("http:// (IP) 이면 세 번째 조건을 타지 않는다 — 스킴 없는 IP 블록과는 원래도 안 겹친다", () => {
    expect(runDuplicateCheck("http://203.0.113.10", "203.0.113.10 {\n\treverse_proxy 127.0.0.1:3000\n}\n")).toBe("OK");
  });
});
