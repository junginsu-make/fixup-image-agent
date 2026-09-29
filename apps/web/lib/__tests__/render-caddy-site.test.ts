import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Caddy 사이트 파일 내용을 만드는 스크립트.
 *
 * 왜 따로 뗐나 — `install-host.sh` 가 직접 `sed` 로 파일을 쓰면 잘못된
 * 인자(설정 파일에 끼어드는 문자열)를 걸러낼 데가 없다. 여기서 표준출력으로만
 * 내고 인자를 검사하면, 파일을 실제로 건드리지 않고도 결과를 시험할 수 있다.
 *
 * 심볼릭 링크가 필요 없어 이 PC(Windows + Git Bash)에서도 그대로 돈다.
 */

const SCRIPT = join(__dirname, "..", "..", "..", "..", "deploy", "ec2", "render-caddy-site.sh");

type ExecError = Error & { status?: number | null; stderr?: Buffer | string };

function render(args: string[]): string {
  return execFileSync("bash", [SCRIPT, ...args], { encoding: "utf8" });
}

function renderExitCode(args: string[]): number | null | undefined {
  try {
    render(args);
    throw new Error(`render(${JSON.stringify(args)}) 가 실패했어야 하는데 성공했습니다`);
  } catch (error) {
    return (error as ExecError).status;
  }
}

describe("render-caddy-site.sh", () => {
  it("도메인만 주면 템플릿을 그대로 채우고 리다이렉트 블록은 없다", () => {
    const out = render(["formwith.fix-up.kr"]);

    expect(out).not.toContain("{{SITE}}");
    expect(out).toMatch(/^formwith\.fix-up\.kr \{/);
    expect(out).not.toContain("redir");
  });

  it("도메인 + IP 를 주면 리다이렉트 블록이 먼저 온다", () => {
    const out = render(["formwith.fix-up.kr", "http://54.180.68.212"]);

    const redirectIndex = out.indexOf("http://54.180.68.212 {");
    const siteIndex = out.indexOf("formwith.fix-up.kr {");

    expect(redirectIndex).toBeGreaterThanOrEqual(0);
    expect(siteIndex).toBeGreaterThan(redirectIndex);
    expect(out).toContain("redir https://formwith.fix-up.kr{uri} 308");
  });

  it("IP 만(http:// 를 붙여서) 주면 그대로 치환한다 — 시험 서버 A 모양", () => {
    const out = render(["http://172.31.13.128"]);

    expect(out).not.toContain("{{SITE}}");
    expect(out).toMatch(/^http:\/\/172\.31\.13\.128 \{/);
    expect(out).not.toContain("redir");
  });

  it.each([["a b"], ["x;y"], ["example.com {"], ["example.com\nfoo"]])(
    "잘못된 주소면 종료 코드 2: %s",
    (bad) => {
      expect(renderExitCode([bad])).toBe(2);
    },
  );

  it("http:// 사이트(HTTPS 가 아님)에 redirect_from 을 주면 거절한다(종료 2)", () => {
    expect(renderExitCode(["http://172.31.13.128", "http://1.2.3.4"])).toBe(2);
  });

  it("인자가 없으면 종료 코드 2", () => {
    expect(renderExitCode([])).toBe(2);
  });
});
