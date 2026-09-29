import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * C1(2026-09-29 최종 고침 §1): install-host.sh 가 잠긴(masked) 워커 유닛을
 * 실제 파일로 덮거나 enable 하면, 다음 deploy-release.sh 가 워커를 다시
 * 띄워 수집이 돈다(외부 과금 가능, 메모리 상한 없는 프로세스 추가). 운영
 * 워커(fixup-image-agent-worker)는 2026-09-10 부터 사용자가 일부러 masked
 * 상태로 잠가 뒀다.
 *
 * install-host.sh 전체를 systemd·root 권한 없이 돌려 볼 수는 없어서, 여기서는
 * "워커 유닛 install/enable 줄이 masked 판정 분기 안에 있다"를 정적으로
 * 고정한다. 실제 systemd 동작(마스크 유지, /dev/null 심볼릭 링크 보존)은
 * 시험 서버 A 에서 손으로 확인했다 — final-fix-report.md §1 참고.
 *
 * 판정 방식은 deploy-release.sh 가 이미 쓰는 것과 글자 그대로 맞춘다(브리프
 * §1 지시) — 두 파일 모두 아래 대입·분기 줄이 있어야 한다.
 */
const DEPLOY_DIR = join(__dirname, "..", "..", "..", "..", "deploy", "ec2");
const WORKER_STATE_ASSIGNMENT =
  'worker_state="$(systemctl is-enabled fixup-image-agent-worker.service 2>/dev/null || true)"';
const WORKER_MASKED_CHECK = "[[ ${worker_state} == masked* ]]";
const WORKER_NOT_MASKED_CHECK = "[[ ${worker_state} != masked* ]]";

describe("install-host.sh 가 잠긴 워커를 풀지 않는다 (C1)", () => {
  const installHost = readFileSync(join(DEPLOY_DIR, "install-host.sh"), "utf8");
  const deployRelease = readFileSync(join(DEPLOY_DIR, "deploy-release.sh"), "utf8");

  it("deploy-release.sh 와 같은 worker_state 판정 문구를 그대로 재사용한다", () => {
    expect(installHost).toContain(WORKER_STATE_ASSIGNMENT);
    expect(deployRelease).toContain(WORKER_STATE_ASSIGNMENT);
    expect(installHost).toContain(WORKER_MASKED_CHECK);
    expect(deployRelease).toContain(WORKER_MASKED_CHECK);
  });

  it("worker_state 판정이 유닛 install·enable 보다 먼저 나온다", () => {
    const stateIndex = installHost.indexOf(WORKER_STATE_ASSIGNMENT);
    const installIndex = installHost.indexOf(
      'install -m 0644 "${script_dir}/fixup-image-agent-worker.service"',
    );
    const enableIndex = installHost.indexOf("systemctl enable fixup-image-agent-worker.service");
    expect(stateIndex).toBeGreaterThan(-1);
    expect(installIndex).toBeGreaterThan(-1);
    expect(enableIndex).toBeGreaterThan(-1);
    expect(stateIndex).toBeLessThan(installIndex);
    expect(stateIndex).toBeLessThan(enableIndex);
  });

  it("워커 유닛 install 줄이 '잠기지 않음' 분기 안에서만 실행된다", () => {
    // "[[ ${worker_state} != masked* ]]; then" 로 시작하는 분기 안에 install
    // 줄이 있어야 한다 — 분기 밖이면 masked 여도 install 이 그대로 돈다.
    const pattern = new RegExp(
      `${escapeRegExp(WORKER_NOT_MASKED_CHECK)}[\\s\\S]{0,40}then[\\s\\S]{0,200}install -m 0644 "\\$\\{script_dir\\}/fixup-image-agent-worker\\.service"[\\s\\S]{0,80}fi`,
    );
    expect(installHost).toMatch(pattern);
  });

  it("워커 유닛 enable 줄이 '잠기지 않음' 분기 안에서만 실행된다", () => {
    const pattern = new RegExp(
      `${escapeRegExp(WORKER_NOT_MASKED_CHECK)}[\\s\\S]{0,40}then[\\s\\S]{0,120}systemctl enable fixup-image-agent-worker\\.service[\\s\\S]{0,80}fi`,
    );
    expect(installHost).toMatch(pattern);
  });

  it("워커가 잠겨 있으면 그대로 둔다는 안내 문구가 있다", () => {
    expect(installHost).toContain("워커가 잠겨 있어 그대로 둡니다");
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
