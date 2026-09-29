import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * **멈추면 운영자가 먼저 안다**(설계 §3.1-5). 2026-09-28 에는 고객 문의로만 알 수
 * 있었다. 추가 과금 없이 이미 있는 SMTP 계정으로 보낸다. 같은 사건은 한 시간에 한 번.
 *
 * 명령(curl·systemctl·journalctl)은 가짜로 바꿔 끼워 돌린다 — 파일 하나가 한 명령이다.
 *
 * SMTP 해석은 앱이 메일을 보내는 곳(`apps/web/lib/email/approval.ts`)과 맞춘다 —
 * `secure = SMTP_SECURE === "true" || port === 465`, `from = SMTP_FROM || SMTP_USER`.
 * 제목은 RFC 2047 로 인코딩한다 — 안 그러면 한글 제목이 메일함에서 깨진다.
 */
const SCRIPT = join(__dirname, "..", "..", "..", "..", "deploy", "ec2", "monitor.sh");
let dir = "";
const shim = (name: string, body: string) => {
  const path = join(dir, "bin", name);
  writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path, 0o755);
};
const world = (o: { healthy: boolean; restarts: number; memory: number; high: string; oom?: string; mailFails?: boolean }) => {
  shim("curl", `for a in "$@"; do case "$a" in *health*) ${o.healthy ? "exit 0" : "exit 7"};; smtp*) ${o.mailFails ? "exit 67" : "exit 0"};; esac; done; exit 0`);
  shim("systemctl", `case "$*" in *NRestarts*) echo ${o.restarts};; *MemoryCurrent*) echo ${o.memory};; *MemoryHigh*) echo ${o.high};; esac`);
  shim("journalctl", `echo "${o.oom ?? ""}"`);
};
const run = (extra: Record<string, string> = {}) =>
  execFileSync("bash", [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      MONITOR_STATE_DIR: join(dir, "state"),
      MONITOR_APP_ENV: join(dir, "app.env"),
      MONITOR_DRY_RUN: "1",
      ...extra,
    },
  });

// 이 describe 는 Windows(Git Bash)에서는 돌리지 않는다 — PATH 앞자리 shim 으로
// curl·systemctl·journalctl 을 바꿔 끼우는 트릭을 실제로 두 번 돌려 보니 한 번은
// 12/12 통과, 한 번은 5개가 타임아웃(MSYS 의 PATH 해석이 들쭉날쭉해 실제 명령이
// 섞여 불리는 것으로 보인다) — 믿을 수 없어 건너뛴다. Linux 시험 서버(B)와
// CI(Linux)에서 실제로 RED→GREEN 을 받았다 — 자세한 명령은 task-7-report.md.
const isFaithfulHere = process.platform !== "win32";
const maybeDescribe = isFaithfulHere ? describe : describe.skip;

maybeDescribe("monitor.sh", () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "monitor-"));
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "app.env"), "ALERT_EMAIL=ops@example.invalid\nSMTP_HOST=smtp.example.invalid\nSMTP_PORT=465\nSMTP_SECURE=true\nSMTP_USER=u\nSMTP_PASS=p\nSMTP_FROM=FormWith <noreply@example.invalid>\n");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("모두 정상이면 아무 메일도 없다", () => {
    world({ healthy: true, restarts: 0, memory: 1_000_000_000, high: "3145728000" });
    expect(run()).not.toContain("MAIL");
  });

  it("두 번 연속 응답이 없으면 한 번 알린다 — 배포 재시작 한 번은 넘긴다", () => {
    world({ healthy: false, restarts: 0, memory: 1, high: "infinity" });
    expect(run()).not.toContain("MAIL");
    expect(run()).toContain("MAIL [down]");
    expect(run()).not.toContain("MAIL"); // 같은 사건은 한 시간에 한 번
  });

  it("다시 살아나면 회복 메일을 보낸다", () => {
    world({ healthy: false, restarts: 0, memory: 1, high: "infinity" });
    run(); run();
    world({ healthy: true, restarts: 0, memory: 1, high: "infinity" });
    expect(run()).toContain("MAIL [recovered]");
  });

  it("자동 재시작 횟수가 늘면 알린다", () => {
    world({ healthy: true, restarts: 0, memory: 1, high: "infinity" });
    run();
    world({ healthy: true, restarts: 1, memory: 1, high: "infinity" });
    expect(run()).toContain("MAIL [restart]");
  });

  it("메모리가 MemoryHigh 의 90% 를 넘으면 알린다", () => {
    world({ healthy: true, restarts: 0, memory: 2_900_000_000, high: "3145728000" });
    expect(run()).toContain("MAIL [memory]");
  });

  it("커널이 프로세스를 죽였으면 알린다", () => {
    world({ healthy: true, restarts: 0, memory: 1, high: "infinity", oom: "Out of memory: Killed process 123 (node)" });
    expect(run()).toContain("MAIL [oom]");
  });

  it("메일 서버가 죽어도 감시는 성공으로 끝나고, 다음 차례에 다시 보낸다", () => {
    world({ healthy: false, restarts: 0, memory: 1, high: "infinity", mailFails: true });
    run();
    expect(() => run({ MONITOR_DRY_RUN: "0" })).not.toThrow();
    // 보내지 못했으니 쉬는 시간이 시작되지 않았다 — 다음 차례에 다시 시도한다.
    world({ healthy: false, restarts: 0, memory: 1, high: "infinity" });
    expect(run()).toContain("MAIL [down]");
  });

  it("받을 주소가 없으면 메일 없이 끝난다", () => {
    writeFileSync(join(dir, "app.env"), "SMTP_HOST=x\n");
    world({ healthy: false, restarts: 0, memory: 1, high: "infinity" });
    run();
    expect(run()).not.toContain("MAIL");
  });

  // 리뷰 결정(수정 1차) 2: 상태 파일이 깨져 있어도(숫자가 아님) set -u 산술에서
  // "unbound variable" 로 죽지 않는다 — state() 가 숫자 기본값이면 스스로 거른다.
  // 가드 기본값 0 기준: corrupt 는 0 취급 → 1번째 호출에서 count=1(<2, 메일 없음),
  // 2번째 호출에서 count=2(>=2, MAIL [down]).
  it("down.count 상태 파일이 깨져 있어도 예외 없이 끝나고, 기본값 0 취급으로 두 번째에 알린다", () => {
    const stateDir = join(dir, "state");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(join(stateDir, "down.count"), "corrupt");
    world({ healthy: false, restarts: 0, memory: 1, high: "infinity" });
    let firstOutput = "";
    expect(() => {
      firstOutput = run();
    }).not.toThrow();
    expect(firstOutput).not.toContain("MAIL"); // corrupt → 0 취급, 1번째는 count=1(<2)
    expect(run()).toContain("MAIL [down]"); // 2번째는 count=2(>=2)
  });

  // ── 통제관 결정 1·2: 실제 SMTP 발송(MONITOR_DRY_RUN=0)에서 앱과 같은 해석,
  // RFC 2047 제목 인코딩을 고정한다. curl 가짜는 smtp*:// 호출의 인자 전체를
  // 파일로 남기고, --upload-file 로 넘긴 본문 파일도 복사해 둔다.
  const captureMail = () => {
    const argsFile = join(dir, "mail-args.txt");
    const bodyFile = join(dir, "mail-body.txt");
    shim(
      "curl",
      [
        `args_file="${argsFile.replace(/\\/g, "/")}"`,
        `body_file="${bodyFile.replace(/\\/g, "/")}"`,
        `for a in "$@"; do case "$a" in *health*) exit 7;; esac; done`,
        `is_mail=0`,
        `for a in "$@"; do case "$a" in smtp*://*) is_mail=1;; esac; done`,
        `if [[ $is_mail -eq 1 ]]; then`,
        `  printf '%s\\n' "$@" >> "$args_file"`,
        `  prev=""`,
        `  for a in "$@"; do`,
        `    if [[ "$prev" == "--upload-file" ]]; then cp "$a" "$body_file"; fi`,
        `    prev="$a"`,
        `  done`,
        `fi`,
        `exit 0`,
      ].join("\n"),
    );
    shim("systemctl", `case "$*" in *NRestarts*) echo 0;; *MemoryCurrent*) echo 1;; *MemoryHigh*) echo infinity;; esac`);
    shim("journalctl", `echo ""`);
    // 두 번 연속 실패해야 실제 발송(send)까지 간다.
    run();
    run({ MONITOR_DRY_RUN: "0" });
    return { argsFile, bodyFile };
  };
  const readMailArgs = (argsFile: string) => readFileSync(argsFile, "utf8");

  it("SMTP_PORT=465 이고 SMTP_SECURE 가 없으면 smtps:// 를 쓴다", () => {
    writeFileSync(join(dir, "app.env"), "ALERT_EMAIL=ops@example.invalid\nSMTP_HOST=smtp.example.invalid\nSMTP_PORT=465\nSMTP_USER=u\nSMTP_PASS=p\nSMTP_FROM=FormWith <noreply@example.invalid>\n");
    const { argsFile } = captureMail();
    const args = readMailArgs(argsFile);
    expect(args).toMatch(/smtps:\/\/smtp\.example\.invalid:465/);
  });

  it("SMTP_PORT=587 이고 SMTP_SECURE=false 면 smtp:// 와 --ssl-reqd 를 쓴다", () => {
    writeFileSync(join(dir, "app.env"), "ALERT_EMAIL=ops@example.invalid\nSMTP_HOST=smtp.example.invalid\nSMTP_PORT=587\nSMTP_SECURE=false\nSMTP_USER=u\nSMTP_PASS=p\nSMTP_FROM=FormWith <noreply@example.invalid>\n");
    const { argsFile } = captureMail();
    const args = readMailArgs(argsFile);
    expect(args).toMatch(/smtp:\/\/smtp\.example\.invalid:587/);
    expect(args).not.toMatch(/smtps:\/\//);
    expect(args).toContain("--ssl-reqd");
  });

  // 리뷰 결정(수정 1차) 3: 위 두 시험(465+SECURE 없음, 587+SECURE=false)은 브리프
  // 원안(`SECURE=="false"` 아니면 smtps)으로 되돌려도 우연히 통과한다 — 둘을
  // 가르는 조합은 "포트가 465 가 아니고 SECURE 도 안 적힌" 경우뿐이다. 원안이면
  // smtps(기본값), 결정 1(통제관 규칙)이면 smtp 다.
  it("SMTP_PORT=587 이고 SMTP_SECURE 가 아예 없으면 smtp:// 를 쓴다 — 원안과 갈리는 경우", () => {
    writeFileSync(join(dir, "app.env"), "ALERT_EMAIL=ops@example.invalid\nSMTP_HOST=smtp.example.invalid\nSMTP_PORT=587\nSMTP_USER=u\nSMTP_PASS=p\nSMTP_FROM=FormWith <noreply@example.invalid>\n");
    const { argsFile } = captureMail();
    const args = readMailArgs(argsFile);
    expect(args).toMatch(/smtp:\/\/smtp\.example\.invalid:587/);
    expect(args).not.toMatch(/smtps:\/\//);
  });

  it("SMTP_FROM 이 비어 있으면 --mail-from 에 SMTP_USER 를 쓴다", () => {
    writeFileSync(join(dir, "app.env"), "ALERT_EMAIL=ops@example.invalid\nSMTP_HOST=smtp.example.invalid\nSMTP_PORT=465\nSMTP_SECURE=true\nSMTP_USER=fallback@example.invalid\nSMTP_PASS=p\nSMTP_FROM=\n");
    const { argsFile } = captureMail();
    const args = readMailArgs(argsFile);
    expect(args).toContain("--mail-from");
    expect(args).toContain("fallback@example.invalid");
  });

  it("보낸 편지에 RFC 2047 제목과 MIME 머리글이 있다", () => {
    const { bodyFile } = captureMail();
    const body = readFileSync(bodyFile, "utf8");
    expect(body).toContain("Subject: =?UTF-8?B?");
    expect(body).toContain("MIME-Version: 1.0");
    expect(body).toContain("Content-Type: text/plain; charset=UTF-8");
    expect(body).toContain("Content-Transfer-Encoding: 8bit");
    expect(body).toMatch(/^Date: /m);
  });
});
