import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const caddy = readFileSync(join(__dirname, "..", "..", "..", "..", "deploy", "ec2", "Caddyfile.template"), "utf8");

describe("Caddyfile.template", () => {
  it("정적 파일은 사본이 있을 때만 Caddy 가 내준다 — 없으면 Node 로", () => {
    // 파일 검사(`file`)가 빠지면 사본에 없는 조각(배포 중·옛 릴리스)이 404 가 된다.
    expect(caddy).toMatch(/@static \{[\s\S]*?path \/_next\/static\/\*[\s\S]*?file \{[\s\S]*?root \/var\/www\/fixup-image-agent\/static\/current/);
    expect(caddy).toMatch(/handle @static \{[\s\S]*?file_server/);
  });

  it("나머지는 Node 로, 재시작 틈에는 502 대신 기다린다", () => {
    expect(caddy).toMatch(/handle \{[\s\S]*?reverse_proxy 127\.0\.0\.1:3000 \{[\s\S]*?lb_try_duration 20s/);
  });
});
