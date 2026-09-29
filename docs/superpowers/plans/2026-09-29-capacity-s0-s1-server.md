# 100명 대비 S0·S1 — 기준선 측정과 서버 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 운영과 비슷한 조건의 기준선 숫자를 남기고, 운영 서버를 t3.medium 으로 키우면서 메모리 상한·재시작 틈 대기·정적 파일 직접 제공·장애 메일 감시를 넣는다.

**Architecture:** 코드는 `deploy/ec2/` 스크립트·유닛·Caddy 템플릿만 바꾼다. 새 셸 스크립트는 경로·명령을 인자와 환경변수로 받아, 지금의 `prune-releases.test.ts` 처럼 vitest 가 임시 폴더에서 실제로 돌려 시험한다. 운영 반영은 배포 흐름 밖이므로 `docs/DEPLOY.md` 에 절차를 적고, 먼저 시험 서버 A 에서 같은 절차로 리허설한다.

**Tech Stack:** bash, systemd, Caddy 2.11, vitest 4, k6, Playwright(측정만), AWS 콘솔(사용자)

**Spec:** `docs/superpowers/specs/2026-09-29-capacity-100-design.md` §2·§3.0·§3.1·§4(S0·S1)

**설계와 달라진 점(이유와 함께):**
- 설계 §3.0 의 「가짜 AI 보강(대기열 API·키별 한도·401/403/429)」은 **S3 계획으로 옮긴다** — 그 기능을 재는 것이 S3·S4 기준이고, S0 기준선은 지금 가짜 AI 로 충분하다
- 설계 §3.1-5·6 의 CPU 크레딧 감시는 서버 안에서 읽을 수 없다(CloudWatch 필요). **콘솔에서 크레딧 사양을 `unlimited` 로 확인**하는 절차로 대신한다(Task 8 DEPLOY 절). 감시 메일은 가입 메일과 같은 SMTP 계정을 쓰되 같은 사건은 한 시간에 한 번이라 몫을 크게 먹지 않는다 — 메일 한도 자체는 S6(§3.7)에서 본다

## Global Constraints

- 추가 과금 기능을 쓰지 않는다 — 감시 메일은 이미 있는 SMTP 계정을 `curl` 로 보낸다(외부 감시 서비스 X)
- Windows 에서 배포 꾸러미를 빌드하지 않는다. EC2 에서 빌드하지 않는다(`CLAUDE.md`)
- 운영 파일·릴리스를 지우기 전에 묻는다(`CLAUDE.md`)
- 릴리스 폴더 권한(`root:fixup-agent`, 0750/0640)은 넓히지 않는다 — Caddy 는 정적 파일 **사본**만 읽는다
- 결과 이미지 화질·앱 동작은 바꾸지 않는다(이 계획은 서버·배포만)
- 운영 SSH: `ubuntu@54.180.68.212`, 키 `C:/Users/PC/Desktop/coding/aws/instargram.pem`. 시험 서버 A `3.36.73.188`(사설 172.31.13.128), B `43.200.70.164`(사설 172.31.26.41), 키 `scratchpad/loadtest/loadtest.pem`
- 주석·메시지는 한국어, 이 저장소의 주석 문체를 따른다

## Review Focus

1. **배포 도중 정적 파일 사본이 반쯤 복사된 순간** — 새 HTML 이 아직 없는 조각 파일을 부르면 Caddy 가 404 를 내면 안 된다. 파일이 없으면 Node 로 넘긴다(Task 6 시험 「없는 파일은 Node 로」)
2. **정적 사본이 없는 옛 릴리스로 되돌리기** — `rollback-release.sh` 가 사본을 새로 만들고, 만들 수 없어도 Node 로 넘어가 화면이 깨지지 않는다(Task 6 시험 「정적 폴더가 없는 릴리스」)
3. **메일 서버가 죽었을 때 감시** — 감시 자체가 실패로 멈추거나 1분마다 같은 메일을 쏟으면 안 된다. 보내기 실패는 기록만 하고 다음 차례에 다시(Task 7 시험 「메일 실패」·「같은 사건 한 시간 한 번」)
4. **메모리 상한을 잘못 적어 재시작이 반복** — 힙 상한 < `MemoryHigh` < `MemoryMax` < 실제 램 관계를 시험으로 묶는다(Task 5 시험)
5. **Caddy 설정을 바꾸다 사이트가 통째로 내려감** — 반영 절차가 `caddy validate` 를 먼저 하고, 이전 사이트 파일을 남겨 즉시 되돌린다(Task 8 절차, Task 9 리허설)

---

### Task 1: 기준선 조건 만들기 — 시험 DB 를 MICRO 크기로, 운영과 같은 거리로 (S0)

**Files:** 없음(시험 서버 설정만. 결과는 Task 3 문서에)

- [ ] **Step 1: 시험 DB 컨테이너를 MICRO 에 가깝게 묶는다(B 에서)**

```bash
ssh -i loadtest.pem ubuntu@43.200.70.164 'docker update --cpus 1 --memory 1g --memory-swap 1g supabase_db_sb && docker inspect supabase_db_sb --format "{{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}"'
```
Expected: `1000000000 1073741824`

- [ ] **Step 2: A → B DB 구간에만 왕복 약 0.2초 지연을 넣는다(A 에서)**

```bash
ssh -i loadtest.pem ubuntu@3.36.73.188 'IF=$(ip route get 172.31.26.41 | grep -oP "dev \K\S+");
sudo tc qdisc replace dev $IF root handle 1: prio;
sudo tc qdisc replace dev $IF parent 1:3 handle 30: netem delay 200ms;
sudo tc filter replace dev $IF protocol ip parent 1:0 prio 3 u32 match ip dst 172.31.26.41/32 match ip dport 54321 0xffff flowid 1:3;
for i in 1 2 3; do curl -s -o /dev/null -w "%{time_total}\n" http://172.31.26.41:54321/rest/v1/; done'
```
Expected: 세 줄 모두 0.19~0.25 사이. 가짜 AI(443)·다른 포트는 지연이 없어야 한다: `curl -sk -o /dev/null -w "%{time_total}\n" https://fal.run/__stats` 가 0.05 미만

- [ ] **Step 3: 되돌리는 명령을 기록해 둔다(마지막 Task 에서 씀)**

```bash
# A: sudo tc qdisc del dev <IF> root     B: docker update --cpus 0 --memory 0 supabase_db_sb
```

---

### Task 2: 기준선 측정 (S0)

**Files:** 없음(측정. 결과는 Task 3 문서에)

**Interfaces:**
- Consumes: 시험 도구 `~/tools/k6/run-k6.sh <이름> <스크립트> [ENV=값...]`, `~/tools/k6/pinpoint.sh` 패턴, `setup-users.mjs`(B 의 `~/tools/k6`)
- Produces: 숫자 표(Task 3 이 옮겨 적는다)

- [ ] **Step 1: 로그인 후 화면 25·50·100명(각 60초)**

```bash
ssh -i loadtest.pem ubuntu@43.200.70.164 'cd ~/tools/k6 && . ./envk6.sh && USER_PREFIX=base USER_COUNT=100 node setup-users.mjs >/dev/null 2>&1 &&
for v in 25 50 100; do LEVELS=$v HOLD=60s RAMP=10s k6 run --quiet browse.js > /tmp/k6-base$v.txt 2>&1; echo "== $v"; grep -E "^(page_library|page_sns|page_guide|api_library|api_poster_projects) " /tmp/k6-base$v.txt; done'
```
Expected: 명령이 끝나고 세 묶음의 p50/p95 가 찍힌다. 값은 기록만(판정 없음)

- [ ] **Step 2: 섞임(로그인 50 + 상세페이지 3)과 로그인 전 200명 3분**

```bash
ssh -i loadtest.pem ubuntu@43.200.70.164 'nohup ~/tools/k6/pinpoint.sh > /tmp/pinpoint-base.log 2>&1 &'
# 끝났는지: test -f /tmp/pinpoint.done  → cat /tmp/pinpoint.txt
ssh -i loadtest.pem ubuntu@43.200.70.164 'DUR=180s /tmp/run-fixed.sh pubbase200 200 /tmp/public-fixed.js'
```
Expected: `/tmp/pinpoint.txt` 와 pub200 요약. 재시작 횟수를 반드시 적는다

- [ ] **Step 3: 실제 브라우저가 화면 한 번에 부르는 수 — Playwright(B 에서)**

`scratchpad/loadtest/tools/browser-count.mjs` 로 만든다:

```js
// 로그인 쿠키를 넣고 화면을 열어, 끝날 때까지 나간 요청을 센다(사이드바 prefetch·폴링 포함).
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const users = JSON.parse(readFileSync(process.env.USERS_FILE, "utf8")).users;
const cookieHeader = users[0].cookieHeader;
const cookies = cookieHeader.split("; ").map((pair) => {
  const i = pair.indexOf("=");
  return { name: pair.slice(0, i), value: pair.slice(i + 1), domain: "172.31.13.128", path: "/" };
});
const browser = await chromium.launch();
const context = await browser.newContext();
await context.addCookies(cookies);
for (const path of ["/library", "/sns", "/poster", "/create", "/guide"]) {
  const page = await context.newPage();
  const seen = { app: 0, supabase: 0 };
  page.on("request", (req) => { if (req.url().includes(":54321")) seen.supabase += 1; else seen.app += 1; });
  await page.goto(`http://172.31.13.128${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(3000);
  console.log(path, JSON.stringify(seen));
  await page.close();
}
await browser.close();
```
```bash
ssh -i loadtest.pem ubuntu@43.200.70.164 'cd ~/tools && npm i playwright@1 --no-save >/dev/null 2>&1 && npx playwright install --with-deps chromium >/dev/null 2>&1 && USERS_FILE=$HOME/tools/k6/users.json node browser-count.mjs'
```
서버 쪽에서 Supabase 로 나간 호출은 B 의 Kong 로그로 센다(2026-09-28 에 쓴 방식):
```bash
ssh -i loadtest.pem ubuntu@43.200.70.164 'b=$(docker logs supabase_kong_sb 2>&1 | wc -l); USERS_FILE=$HOME/tools/k6/users.json node ~/tools/browser-count.mjs >/dev/null; docker logs supabase_kong_sb 2>&1 | tail -n +$((b+1)) | grep -oE "\"(GET|POST|PATCH) /[a-z]+/v1/[a-z_/]*" | sort | uniq -c | sort -rn | head'
```
Expected: 화면마다 요청 수, 전체 Supabase 호출 상위 목록

- [ ] **Step 4: CORS — 브라우저가 Supabase 서명 주소를 fetch 할 수 있나(운영, 읽기 전용)**

```bash
ssh -i "C:/Users/PC/Desktop/coding/aws/instargram.pem" ubuntu@54.180.68.212 'sudo bash -c '"'"'
set -a; . /etc/fixup-image-agent/app.env; set +a
P=$(curl -s -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" "$NEXT_PUBLIC_SUPABASE_URL/rest/v1/pdp_generation_items?select=output_path&output_path=not.is.null&limit=1" | python3 -c "import sys,json;print(json.load(sys.stdin)[0][\"output_path\"])")
U=$(curl -s -X POST -H "apikey: $SUPABASE_SECRET_KEY" -H "Authorization: Bearer $SUPABASE_SECRET_KEY" -H "Content-Type: application/json" -d "{\"expiresIn\":60}" "$NEXT_PUBLIC_SUPABASE_URL/storage/v1/object/sign/library/$P" | python3 -c "import sys,json;print(json.load(sys.stdin)[\"signedURL\"])")
curl -s -o /dev/null -D - -H "Origin: $NEXT_PUBLIC_SITE_URL" "$NEXT_PUBLIC_SUPABASE_URL/storage/v1$U" | grep -iE "^HTTP|access-control-allow-origin"
'"'"''
```
Expected: `HTTP/2 200` 과 `access-control-allow-origin:` 줄. 없으면 S4b 계획에 「서명 주소 대신 우리 경로로 흘려 주기」를 넣어야 한다 — 결과를 Task 3 문서에 적는다

---

### Task 3: 기준선 기록 문서

**Files:**
- Create: `docs/capacity/2026-09-29-baseline.md`

- [ ] **Step 1: Task 2 의 숫자를 표로 옮긴다**

문서 뼈대(값은 Task 2 결과로 채운다 — 빈칸 없이):

```markdown
# 기준선 — 운영과 비슷한 조건 (2026-09-29)

조건: 시험 서버 A t3.micro(운영과 같은 설정), 시험 DB 는 CPU 1·메모리 1GB 로 제한, A→DB 왕복 약 0.2초(`tc netem`), 가짜 AI(이미지 45초·글 3초).
운영과 다른 점: DB 는 x86(운영 MICRO 는 ARM 공유 코어), 가짜 AI 는 늘 성공.

## 로그인 후 화면
| 동시 | 라이브러리 p50/p95 | 카드뉴스 p50/p95 | 목록 API p50/p95 |
| 25 | … | … | … |
| 50 | … | … | … |
| 100 | … | … | … |

## 섞임·로그인 전·상세페이지
(pinpoint.txt 값 — 재시작 횟수 포함)

## 실제 브라우저 한 번 열기
(화면별 요청 수, Supabase 호출 상위)

## CORS
(Task 2 Step 4 결과 한 줄)
```

- [ ] **Step 2: Commit**

```bash
git add docs/capacity/2026-09-29-baseline.md
git commit -m "docs(capacity): 운영과 비슷한 조건의 기준선"
```

---

### Task 4: 메모리 값 정하기 — 시험 서버 A 를 t3.medium 으로 (S1)

**Files:** 없음(측정. 값은 Task 5 가 쓴다)

- [ ] **Step 1: 시험 서버 A 유형 변경(이 컴퓨터의 AWS 계정, 시험 서버만)**

```bash
export MSYS_NO_PATHCONV=1; A_ID=$(cat scratchpad/loadtest/a.txt)
aws ec2 stop-instances --region ap-northeast-2 --instance-ids $A_ID >/dev/null && aws ec2 wait instance-stopped --region ap-northeast-2 --instance-ids $A_ID
aws ec2 modify-instance-attribute --region ap-northeast-2 --instance-id $A_ID --instance-type t3.medium
aws ec2 start-instances --region ap-northeast-2 --instance-ids $A_ID >/dev/null && aws ec2 wait instance-running --region ap-northeast-2 --instance-ids $A_ID
aws ec2 describe-instances --region ap-northeast-2 --instance-ids $A_ID --query 'Reservations[0].Instances[0].[InstanceType,PublicIpAddress]' --output text
```
Expected: `t3.medium <새 공인 IP>` — 공인 IP 가 바뀌면 이후 명령의 A 주소를 바꾼다(사설 IP 는 그대로). Task 1 의 `tc` 는 재부팅으로 사라지므로 Task 1 Step 2 를 다시 돌린다

- [ ] **Step 2: 힙 상한 2048 로 올리고 상세페이지 1·3·6명 동시, 섞임을 잰다**

```bash
ssh -i loadtest.pem ubuntu@<A> 'sudo sed -i "s/^NODE_OPTIONS=.*/NODE_OPTIONS=--max-old-space-size=2048/" /etc/fixup-image-agent/app.env && grep NODE_OPTIONS /etc/fixup-image-agent/app.env'
ssh -i loadtest.pem ubuntu@43.200.70.164 'cd ~/tools/k6 && . ./envk6.sh && for v in 1 3 6; do USER_PREFIX=med${v} USER_COUNT=$v node setup-users.mjs >/dev/null 2>&1; ~/tools/k6/run-k6.sh med$v ~/tools/k6/generate-pdp.js LEVELS=$v HOLD=150s > /tmp/run-med$v.out 2>&1; grep -E "unitmem" /tmp/run-med$v.out | sort -t" " -k5 -n | tail -1; done'
```
Expected: 각 단계의 최대 서비스 메모리(`unitmem`)와 재시작 0

- [ ] **Step 3: 값을 정하는 규칙대로 결정해 적는다**

- 6명 동시의 최대 서비스 메모리 `M6` 을 본다
- `M6 ≤ 2600MB` 이면: 힙 2048, `MemoryHigh=3000M`, `MemoryMax=3400M`
- `M6 > 2600MB` 이면: 힙 1536, `MemoryHigh=2800M`, `MemoryMax=3200M` 로 낮추고 Step 2 를 다시 돈다
- 결정값과 근거 숫자를 Task 3 문서 끝 「메모리 값」 절에 적어 함께 커밋한다

---

### Task 5: 메모리 상한을 유닛과 설정 예시에 넣는다 (S1)

**Files:**
- Modify: `deploy/ec2/fixup-image-agent.service`
- Modify: `deploy/ec2/app.env.example`
- Test: `apps/web/lib/__tests__/memory-limits.test.ts`

**Interfaces:**
- Produces: 유닛의 `MemoryHigh`·`MemoryMax`, `app.env.example` 의 `NODE_OPTIONS`·`ALERT_EMAIL`(Task 7 이 읽는다)

- [ ] **Step 1: 실패하는 시험을 쓴다**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **힙 상한 < MemoryHigh < MemoryMax < 램.** 셋이 어긋나면 서버가 반복해서 다시 뜨거나
 * (힙보다 MemoryMax 가 작다) 커널이 서버 전체를 죽인다(MemoryMax 가 램을 넘는다).
 * 2026-09-28 측정: 힙 512MB 에서 상세페이지 10명 동시로 죽었다.
 */
const root = join(__dirname, "..", "..", "..", "..");
const unit = readFileSync(join(root, "deploy/ec2/fixup-image-agent.service"), "utf8");
const env = readFileSync(join(root, "deploy/ec2/app.env.example"), "utf8");
const mb = (text: string, key: string) => {
  const match = text.match(new RegExp(`^${key}=(\\d+)M$`, "m"));
  if (!match) throw new Error(`${key} 가 없다`);
  return Number(match[1]);
};
const T3_MEDIUM_MB = 3800; // 4GiB 중 커널·Caddy 몫을 뺀 값

describe("메모리 상한", () => {
  it("유닛에 MemoryHigh·MemoryMax 가 있다", () => {
    expect(mb(unit, "MemoryHigh")).toBeGreaterThan(0);
    expect(mb(unit, "MemoryMax")).toBeGreaterThan(0);
  });

  it("힙 상한 < MemoryHigh < MemoryMax < 램", () => {
    const heap = Number(env.match(/^NODE_OPTIONS=--max-old-space-size=(\d+)$/m)?.[1]);
    expect(heap).toBeGreaterThan(512);
    expect(heap).toBeLessThan(mb(unit, "MemoryHigh"));
    expect(mb(unit, "MemoryHigh")).toBeLessThan(mb(unit, "MemoryMax"));
    expect(mb(unit, "MemoryMax")).toBeLessThan(T3_MEDIUM_MB);
  });

  it("감시 메일 받을 주소 칸이 있다", () => {
    expect(env).toMatch(/^ALERT_EMAIL=/m);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/__tests__/memory-limits.test.ts`
Expected: FAIL — `MemoryHigh 가 없다`

- [ ] **Step 3: 유닛과 예시를 고친다(Task 4 결정값)**

`deploy/ec2/fixup-image-agent.service` 의 `TimeoutStopSec=30` 아래에:

```ini
# 메모리 상한(2026-09-29 t3.medium 측정, docs/capacity/2026-09-29-baseline.md).
# 힙 상한(app.env 의 NODE_OPTIONS)보다 크고 램보다 작아야 한다 — 힙 밖(sharp·버퍼)도 여기서 묶인다.
# MemoryHigh 를 넘으면 느려지고, MemoryMax 를 넘으면 이 서비스만 죽고 5초 뒤 다시 뜬다(서버 전체는 산다).
MemoryHigh=3000M
MemoryMax=3400M
```

`deploy/ec2/app.env.example` 의 `# ── 그 밖` 절에:

```bash
# Node 힙 상한(MB). 유닛의 MemoryHigh 보다 작아야 한다(apps/web/lib/__tests__/memory-limits.test.ts).
NODE_OPTIONS=--max-old-space-size=2048

# 서버 감시 메일을 받을 주소(deploy/ec2/monitor.sh). 비우면 감시는 돌되 메일을 안 보낸다.
ALERT_EMAIL=
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/__tests__/memory-limits.test.ts`
Expected: PASS (3)

- [ ] **Step 5: Commit**

```bash
git add deploy/ec2/fixup-image-agent.service deploy/ec2/app.env.example apps/web/lib/__tests__/memory-limits.test.ts
git commit -m "feat(deploy): 메모리 상한을 유닛과 설정 예시에 넣는다"
```

---

### Task 6: 정적 파일을 Caddy 가 직접 내준다 + 재시작 틈 대기 (S1)

**Files:**
- Create: `deploy/ec2/sync-static.sh`
- Modify: `deploy/ec2/deploy-release.sh`(권한 정리 뒤·`current` 옮기기 전, 실패 되돌림 두 곳)
- Modify: `deploy/ec2/rollback-release.sh`(`ln -sfnT` 앞, 되돌림 한 곳)
- Modify: `deploy/ec2/prune-releases.sh`(세 번째 인자 정적 뿌리)
- Modify: `deploy/ec2/Caddyfile.template`
- Modify: `deploy/ec2/install-host.sh`(정적 뿌리 폴더)
- Test: `apps/web/lib/__tests__/sync-static.test.ts`, `apps/web/lib/__tests__/prune-releases.test.ts`, `apps/web/lib/__tests__/caddyfile.test.ts`

**Interfaces:**
- Produces: `sync-static.sh <release_dir> <release_id> [static_root]` — 기본 `static_root=/var/www/fixup-image-agent/static`, 결과 `<static_root>/<release_id>/_next/static/...`, `<static_root>/current` → 그 릴리스. `.next/static` 이 없으면 0 으로 끝나고 아무것도 안 바꾼다
- Produces: `prune-releases.sh <keep> [app_root] [static_root]`

- [ ] **Step 1: 실패하는 시험 — 사본 만들기**

`apps/web/lib/__tests__/sync-static.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
  });

  it("릴리스 id 에 경로 문자가 있으면 거절한다", () => {
    expect(() => sync(release("r1"), "../x")).toThrow();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/__tests__/sync-static.test.ts`
Expected: FAIL(스크립트 없음). Windows 처럼 심볼릭 링크가 안 되는 곳에서는 skip — 그 경우 Git Bash 를 관리자 권한으로 열거나 시험 서버 B 에서 돌린다: `ssh … 'cd ~/app && git pull && pnpm --filter @fixup/web exec vitest run lib/__tests__/sync-static.test.ts'`

- [ ] **Step 3: 스크립트를 쓴다**

`deploy/ec2/sync-static.sh`:

```bash
#!/usr/bin/env bash
# 릴리스의 정적 파일(.next/static)을 Caddy 가 읽을 수 있는 곳에 복사하고 current 를 옮긴다.
#
# 사용: sync-static.sh <release_dir> <release_id> [static_root]
#
# 릴리스 폴더는 root:fixup-agent 0750 이라 Caddy 가 못 읽는다 — 옆에 앱 비밀값이 있어
# 넓히지 않는다. 그래서 **사본**을 둔다. 결과 경로는 <static_root>/<id>/_next/static/...
# 이라 Caddy 는 요청 경로를 그대로 붙여 찾는다(Caddyfile.template).
#
# 정적 폴더가 없는 릴리스(옛 꾸러미)는 아무것도 안 바꾸고 0 으로 끝난다. Caddy 는
# 파일이 없으면 Node 로 넘기므로 화면이 깨지지 않는다.
set -euo pipefail

release_dir=${1:?release_dir 가 필요합니다}
release_id=${2:?release_id 가 필요합니다}
static_root=${3:-/var/www/fixup-image-agent/static}

if [[ ! ${release_id} =~ ^[A-Za-z0-9._-]+$ || ${release_id} == .* ]]; then
  echo "잘못된 릴리스 id: ${release_id}" >&2
  exit 2
fi

source_dir=${release_dir}/apps/web/.next/static
if [[ ! -d ${source_dir} ]]; then
  echo "정적 파일이 없는 릴리스 — Caddy 가 Node 로 넘긴다: ${source_dir}"
  exit 0
fi

target_root=${static_root}/${release_id}
mkdir -p "${target_root}/_next/static"
cp -a "${source_dir}/." "${target_root}/_next/static/"

# root 로 돌 때만 소유를 맞춘다(시험은 일반 계정으로 돈다).
if [[ ${EUID} -eq 0 ]]; then
  chown -R root:"${STATIC_GROUP:-caddy}" "${target_root}"
fi
find "${target_root}" -type d -exec chmod 0750 {} +
find "${target_root}" -type f -exec chmod 0640 {} +

# 링크는 한 번에 바꾼다 — 바꾸는 중간에 Caddy 가 반쯤 된 링크를 보지 않게.
ln -sfn "${target_root}" "${static_root}/current.next"
mv -Tf "${static_root}/current.next" "${static_root}/current"
echo "정적 파일: ${target_root}"
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/__tests__/sync-static.test.ts`
Expected: PASS (4) (또는 Windows 에서 skip — 그때는 B 에서 PASS 확인)

- [ ] **Step 5: 배포·되돌리기·정리에 붙인다**

`deploy-release.sh` — `for build_dir in …; done` 블록 바로 뒤, `ln -sfnT "${release_root}" "${current_link}"` 앞에:

```bash
# 정적 파일 사본(Caddy 가 직접 내준다). 실패하면 current 를 옮기기 전에 멈춘다.
bash "$(dirname "$0")/sync-static.sh" "${release_root}" "${release_id}"
```

같은 파일의 두 되돌림 블록(`Liveness check failed`·`Readiness check failed`)에서 `ln -sfnT "${previous_release}" "${current_link}"` 바로 뒤에:

```bash
    bash "$(dirname "$0")/sync-static.sh" "${previous_release}" "$(basename "${previous_release}")" || true
```

`rollback-release.sh` — `ln -sfnT "${release_root}" /opt/fixup-image-agent/current` 앞에:

```bash
# 되돌리는 릴리스의 정적 사본을 current 로(없으면 만든다). 옛 꾸러미면 Caddy 가 Node 로 넘긴다.
bash "$(dirname "$0")/sync-static.sh" "${release_root}" "${release_id}"
```

같은 파일의 되돌림 블록 `ln -sfnT "${previous_release}" "${current_link}"` 바로 뒤에:

```bash
    bash "$(dirname "$0")/sync-static.sh" "${previous_release}" "$(basename "${previous_release}")" || true
```

`prune-releases.sh` — `app_root=${2:-/opt/fixup-image-agent}` 아래에 `static_root=${3:-/var/www/fixup-image-agent/static}` 을 두고, 마지막 `for dir in "${removed[@]}"; do … done` 뒤에:

```bash
# 지운 릴리스의 정적 사본도 지운다. current 가 가리키는 것은 남긴다.
if [[ -d ${static_root} ]]; then
  static_current=$(readlink -f "${static_root}/current" 2>/dev/null || true)
  for dir in "${removed[@]}"; do
    target=${static_root}/$(basename "${dir}")
    [[ -d ${target} && ${target} != "${static_current}" ]] && rm -rf -- "${target}"
  done
fi
```

- [ ] **Step 6: 정리 시험을 더한다**

`apps/web/lib/__tests__/prune-releases.test.ts` 의 `prune` 도우미를 세 번째 인자를 넘기게 바꾸고(`execFileSync("bash", [SCRIPT, String(keep), root, join(root, "static")], …)`), 시험 하나를 더한다:

```ts
  it("지운 릴리스의 정적 사본도 지우고, current 가 가리키는 사본은 남긴다", () => {
    for (const [id, age] of [["r1", 30], ["r2", 20], ["r3", 10]] as const) {
      makeRelease(id, age);
      mkdirSync(join(root, "static", id, "_next", "static"), { recursive: true });
    }
    symlinkSync(join(root, "static", "r1"), join(root, "static", "current"));
    prune(1);
    expect(readdirSync(join(root, "static")).sort()).toEqual(["current", "r1", "r3"]);
  });
```

(`current` 릴리스 링크가 없는 상태라 r3(가장 최근)만 남고 r1·r2 가 지워질 대상이지만, r1 은 정적 current 라 남는다)

Run: `cd apps/web && npx vitest run lib/__tests__/prune-releases.test.ts lib/__tests__/sync-static.test.ts`
Expected: PASS

- [ ] **Step 7: Caddy 템플릿 — 실패하는 시험 먼저**

`apps/web/lib/__tests__/caddyfile.test.ts`:

```ts
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
```

Run: `cd apps/web && npx vitest run lib/__tests__/caddyfile.test.ts` → Expected: FAIL

- [ ] **Step 8: 템플릿을 고친다**

`deploy/ec2/Caddyfile.template` 의 `# 정적 파일과 API를 나누지 않는다…` 주석과 `reverse_proxy 127.0.0.1:3000` 두 줄을 다음으로 바꾼다:

```caddyfile
	# 정적 파일은 사본이 있을 때만 Caddy 가 직접 내준다(sync-static.sh). 없으면
	# (배포 중·옛 릴리스) 아래 Node 로 넘어간다 — 화면이 깨지지 않는다.
	# Node 한 코어가 로그인 전 화면에서 막히던 부담을 던다(2026-09-28 측정).
	@static {
		path /_next/static/*
		file {
			root /var/www/fixup-image-agent/static/current
		}
	}
	handle @static {
		root * /var/www/fixup-image-agent/static/current
		header Cache-Control "public, max-age=31536000, immutable"
		file_server
	}

	# 나머지는 Node. 재시작하는 몇 초 동안 502 대신 20초까지 기다린다.
	handle {
		reverse_proxy 127.0.0.1:3000 {
			lb_try_duration 20s
			lb_try_interval 250ms
		}
	}
```

`install-host.sh` 의 `install -d -o caddy -g caddy -m 0750 /var/log/caddy` 아래에:

```bash
install -d -o root -g caddy -m 0750 /var/www/fixup-image-agent /var/www/fixup-image-agent/static
```

Run: `cd apps/web && npx vitest run lib/__tests__/caddyfile.test.ts` → Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add deploy/ec2/sync-static.sh deploy/ec2/deploy-release.sh deploy/ec2/rollback-release.sh deploy/ec2/prune-releases.sh deploy/ec2/Caddyfile.template deploy/ec2/install-host.sh apps/web/lib/__tests__/sync-static.test.ts apps/web/lib/__tests__/prune-releases.test.ts apps/web/lib/__tests__/caddyfile.test.ts
git commit -m "feat(deploy): 정적 파일은 Caddy 가 사본으로 내주고, 재시작 틈에는 기다린다"
```

---

### Task 7: 장애 메일 감시 (S1)

**Files:**
- Create: `deploy/ec2/monitor.sh`
- Create: `deploy/ec2/fixup-image-agent-monitor.service`
- Create: `deploy/ec2/fixup-image-agent-monitor.timer`
- Modify: `deploy/ec2/install-host.sh`(스크립트 설치·타이머 켜기)
- Test: `apps/web/lib/__tests__/monitor-script.test.ts`

**Interfaces:**
- Consumes: `app.env` 의 `SMTP_HOST`·`SMTP_PORT`·`SMTP_SECURE`·`SMTP_USER`·`SMTP_PASS`·`SMTP_FROM`·`ALERT_EMAIL`(Task 5)
- Produces: `monitor.sh` — 환경변수 `MONITOR_STATE_DIR`·`MONITOR_APP_ENV`·`MONITOR_HEALTH_URL`·`MONITOR_UNIT`·`MONITOR_DRY_RUN`(1 이면 메일 대신 표준출력에 `MAIL <제목>`)으로 바꿀 수 있다. 사건 이름: `down`·`recovered`·`restart`·`memory`·`oom`

- [ ] **Step 1: 실패하는 시험을 쓴다**

`apps/web/lib/__tests__/monitor-script.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * **멈추면 운영자가 먼저 안다**(설계 §3.1-5). 2026-09-28 에는 고객 문의로만 알 수
 * 있었다. 추가 과금 없이 이미 있는 SMTP 계정으로 보낸다. 같은 사건은 한 시간에 한 번.
 *
 * 명령(curl·systemctl·journalctl)은 가짜로 바꿔 끼워 돌린다 — 파일 하나가 한 명령이다.
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

describe("monitor.sh", () => {
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
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd apps/web && npx vitest run lib/__tests__/monitor-script.test.ts`
Expected: FAIL(스크립트 없음)

- [ ] **Step 3: 스크립트를 쓴다**

`deploy/ec2/monitor.sh`:

```bash
#!/usr/bin/env bash
# 서버 감시 — 1분마다 systemd 타이머가 부른다(fixup-image-agent-monitor.timer).
#
# 보는 것: 준비 상태(/api/health/ready, 5초 안에), 자동 재시작 횟수, 메모리(MemoryHigh 의 90%),
# 커널 OOM. 이상하면 app.env 의 SMTP 계정으로 ALERT_EMAIL 에 메일을 보낸다 — 추가 과금 없음.
# 같은 사건은 한 시간에 한 번. 보내기에 실패하면 쉬는 시간을 시작하지 않고 다음 차례에 다시.
set -uo pipefail

state_dir=${MONITOR_STATE_DIR:-/var/lib/fixup-image-agent-monitor}
app_env=${MONITOR_APP_ENV:-/etc/fixup-image-agent/app.env}
health_url=${MONITOR_HEALTH_URL:-http://127.0.0.1:3000/api/health/ready}
unit=${MONITOR_UNIT:-fixup-image-agent.service}
dry_run=${MONITOR_DRY_RUN:-0}
cooldown=3600
now=$(date +%s)
mkdir -p "${state_dir}"

read_env() { grep -E "^$1=" "${app_env}" 2>/dev/null | tail -1 | cut -d= -f2-; }
state() { cat "${state_dir}/$1" 2>/dev/null || echo "${2:-0}"; }
save() { printf '%s' "$2" > "${state_dir}/$1"; }

alert_to=$(read_env ALERT_EMAIL)
host_name=$(hostname 2>/dev/null || echo server)

send() { # $1 사건 이름, $2 본문
  local key=$1 body=$2 last
  last=$(state "sent.${key}" 0)
  (( now - last < cooldown )) && return 0
  [[ -z ${alert_to} ]] && return 0
  if [[ ${dry_run} == 1 ]]; then
    echo "MAIL [${key}] ${body}"
    save "sent.${key}" "${now}"
    return 0
  fi
  local msg from scheme
  msg=$(mktemp)
  from=$(read_env SMTP_FROM | sed -E 's/.*<([^>]+)>.*/\1/')
  [[ $(read_env SMTP_SECURE) == false ]] && scheme=smtp || scheme=smtps
  printf 'From: %s\r\nTo: %s\r\nSubject: [FormWith 서버] %s\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s\r\n서버: %s\r\n' \
    "$(read_env SMTP_FROM)" "${alert_to}" "${key}" "${body}" "${host_name}" > "${msg}"
  if curl --silent --show-error --max-time 20 --url "${scheme}://$(read_env SMTP_HOST):$(read_env SMTP_PORT)" \
      --ssl-reqd --user "$(read_env SMTP_USER):$(read_env SMTP_PASS)" \
      --mail-from "${from}" --mail-rcpt "${alert_to}" --upload-file "${msg}"; then
    save "sent.${key}" "${now}"
  else
    echo "감시 메일을 보내지 못했습니다: ${key}" >&2
  fi
  rm -f "${msg}"
}

# 1) 준비 상태 — 한 번 실패는 배포 재시작일 수 있어 두 번 연속일 때만.
if curl --silent --fail --max-time 5 --output /dev/null "${health_url}"; then
  if [[ $(state down.alerted 0) == 1 ]]; then
    send recovered "서비스가 다시 응답합니다."
    save down.alerted 0
  fi
  save down.count 0
else
  count=$(( $(state down.count 0) + 1 ))
  save down.count "${count}"
  if (( count >= 2 )); then
    send down "준비 상태(${health_url})가 ${count}분째 응답하지 않습니다."
    save down.alerted 1
  fi
fi

# 2) 자동 재시작 — systemctl restart(배포)는 NRestarts 를 올리지 않는다.
restarts=$(systemctl show "${unit}" -p NRestarts --value 2>/dev/null || echo 0)
previous=$(state restarts "${restarts}")
if [[ ${restarts} =~ ^[0-9]+$ && ${previous} =~ ^[0-9]+$ ]] && (( restarts > previous )); then
  send restart "서비스가 스스로 다시 떴습니다(${previous} → ${restarts}). 메모리 초과일 수 있습니다: journalctl -u ${unit}"
fi
save restarts "${restarts}"

# 3) 메모리 — MemoryHigh 의 90%.
current=$(systemctl show "${unit}" -p MemoryCurrent --value 2>/dev/null || echo 0)
high=$(systemctl show "${unit}" -p MemoryHigh --value 2>/dev/null || echo infinity)
if [[ ${current} =~ ^[0-9]+$ && ${high} =~ ^[0-9]+$ ]] && (( current * 10 >= high * 9 )); then
  send memory "메모리 $(( current / 1048576 ))MB — 상한 $(( high / 1048576 ))MB 의 90% 를 넘었습니다."
fi

# 4) 커널 OOM — 지난 차례 이후.
since=$(state oom.since $(( now - 120 )))
if journalctl -k --since "@${since}" --no-pager 2>/dev/null | grep -qiE "out of memory|oom-kill"; then
  send oom "커널이 메모리 부족으로 프로세스를 죽였습니다: journalctl -k"
fi
save oom.since "${now}"
exit 0
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd apps/web && npx vitest run lib/__tests__/monitor-script.test.ts`
Expected: PASS (8)

- [ ] **Step 5: 유닛·타이머를 쓰고 설치 스크립트에 붙인다**

`deploy/ec2/fixup-image-agent-monitor.service`:

```ini
[Unit]
Description=Fixup Image Agent monitor (health, restarts, memory, OOM → mail)

[Service]
Type=oneshot
ExecStart=/usr/bin/bash /usr/local/lib/fixup-image-agent/monitor.sh
StateDirectory=fixup-image-agent-monitor
```

`deploy/ec2/fixup-image-agent-monitor.timer`:

```ini
[Unit]
Description=Run the Fixup Image Agent monitor every minute

[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
AccuracySec=10s

[Install]
WantedBy=timers.target
```

`install-host.sh` 의 유닛 설치 부분(`fixup-image-agent-worker.service` 를 복사하는 줄 아래)에:

```bash
install -d -o root -g root -m 0755 /usr/local/lib/fixup-image-agent
install -o root -g root -m 0755 "${script_dir}/monitor.sh" /usr/local/lib/fixup-image-agent/monitor.sh
install -o root -g root -m 0644 "${script_dir}/fixup-image-agent-monitor.service" /etc/systemd/system/
install -o root -g root -m 0644 "${script_dir}/fixup-image-agent-monitor.timer" /etc/systemd/system/
```

`systemctl enable fixup-image-agent.service` 가 있는 줄 근처에 `systemctl enable --now fixup-image-agent-monitor.timer` 를 더한다.

- [ ] **Step 6: Commit**

```bash
git add deploy/ec2/monitor.sh deploy/ec2/fixup-image-agent-monitor.service deploy/ec2/fixup-image-agent-monitor.timer deploy/ec2/install-host.sh apps/web/lib/__tests__/monitor-script.test.ts
git commit -m "feat(deploy): 서버가 멈추면 운영자에게 메일을 보낸다"
```

---

### Task 8: 새 서버 설치 고침 + 반영 절차 문서 (S1)

**Files:**
- Modify: `deploy/ec2/install-host.sh:71`
- Modify: `docs/DEPLOY.md`

- [ ] **Step 1: Caddy 설정 검사를 caddy 계정으로 돌린다**

`install-host.sh` 의 `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 를:

```bash
# 검사를 root 로 돌리면 접근 기록 파일을 root 소유로 만들어, 정작 Caddy 가 못 열고 뜨지 않는다
# (2026-09-28 시험 서버에서 겪음). Caddy 가 도는 계정으로 검사한다.
runuser -u caddy -- caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

- [ ] **Step 2: 시험 서버 A 에서 확인한다(새 서버와 같은 상황을 만든다)**

```bash
scp -i loadtest.pem -r deploy/ec2 ubuntu@<A>:/tmp/ec2-new && ssh -i loadtest.pem ubuntu@<A> 'sed -i "s/\r$//" /tmp/ec2-new/*; sudo rm -f /var/log/caddy/fixup-image-agent.access.log; sudo bash /tmp/ec2-new/install-host.sh 172.31.13.128 >/dev/null && sudo systemctl restart caddy && systemctl is-active caddy fixup-image-agent-monitor.timer && sudo ls -l /var/log/caddy/'
```
Expected: `active` 두 줄, 접근 기록 파일이 `caddy caddy` 소유

- [ ] **Step 3: `docs/DEPLOY.md` 에 절을 더한다 — 「서버 설정 바꾸기(배포 흐름 밖)」**

`## 되돌리기` 앞에 넣는다. 내용(그대로 적는다):

```markdown
## 서버 설정 바꾸기 (배포 흐름 밖)

`deploy-release.sh` 는 앱만 바꾼다. **유닛·Caddy·감시 타이머는 안 바꾼다** — 이것들은
`install-host.sh` 가 깐다. 바꿀 때는 이 순서로 한다. 먼저 시험 서버에서 같은 순서로 해 본다.

1. ops 꾸러미를 풀어 둔다(매 배포 4번과 같다)
2. 지금 것을 남긴다
   `sudo cp /etc/caddy/sites/fixup-image-agent.caddy /root/caddy-site.bak && sudo cp /etc/systemd/system/fixup-image-agent.service /root/unit.bak`
3. `sudo bash /tmp/ops-<sha8>/deploy/ec2/install-host.sh <도메인 또는 IP>` — 유닛·Caddy·감시를 새로 깐다.
   Caddy 검사(`caddy validate`)를 통과해야 넘어간다
4. `app.env` 에 새 값이 있으면 넣는다(`NODE_OPTIONS`, `ALERT_EMAIL`)
5. `sudo systemctl daemon-reload && sudo systemctl restart fixup-image-agent && sudo systemctl reload caddy`
6. 확인: `systemctl is-active fixup-image-agent caddy fixup-image-agent-monitor.timer`,
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/`,
   정적 파일이 Caddy 로 나가는지 `curl -sI http://127.0.0.1/_next/static/<아무 조각> | grep -i cache-control`

**되돌리기**: `sudo cp /root/caddy-site.bak /etc/caddy/sites/fixup-image-agent.caddy && sudo cp /root/unit.bak /etc/systemd/system/fixup-image-agent.service && sudo systemctl daemon-reload && sudo systemctl restart fixup-image-agent && sudo systemctl reload caddy`

### 서버 크기 바꾸기 (AWS 콘솔, 약 5분 정지)

운영 서버는 **운영 AWS 계정**에 있다. 콘솔 EC2 → 인스턴스 선택 →
1. **인스턴스 상태 → 중지**, 「중지됨」이 될 때까지 기다린다
2. **작업 → 인스턴스 설정 → 인스턴스 유형 변경** → `t3.medium` → 적용
3. **인스턴스 상태 → 시작**. 탄력적 IP 는 그대로 붙어 있다(주소 안 바뀜)
4. **작업 → 인스턴스 설정 → 크레딧 사양 변경**에서 `unlimited` 인지 본다. `standard` 면 CPU 크레딧이
   떨어질 때 느려진다
5. 위 「서버 설정 바꾸기」 절차로 메모리 상한을 넣는다

### 배포 전에 진행 중인 생성 수를 본다

배포는 재시작이다. 끊기면 결과를 잃는 생성(상세페이지·리디자인·캐릭터의 동기 경로)이 도는 중이면
기다렸다 한다:
`sudo tail -n 300 /var/log/caddy/fixup-image-agent.access.log | grep -cE '"/api/(pdp/(images|key-visual)|redesign/(generate|edit-section)|characters)'`
최근 5분 안에 0 이면 배포한다.
```

- [ ] **Step 4: Commit**

```bash
git add deploy/ec2/install-host.sh docs/DEPLOY.md
git commit -m "fix(deploy): 새 서버에서 Caddy 가 뜨게 하고, 배포 흐름 밖 반영 절차를 적는다"
```

---

### Task 9: 시험 서버 A 리허설과 다시 재기 (S1)

**Files:**
- Modify: `docs/capacity/2026-09-29-baseline.md`(「S1 뒤」 절)

- [ ] **Step 1: 이 가지로 꾸러미를 만들고 A 에 배포한다(B 에서 빌드 — Windows·EC2 운영 빌드 금지 규칙)**

```bash
git push -u origin <이 가지>
ssh -i loadtest.pem ubuntu@43.200.70.164 'cd ~/app && git fetch -q origin && git checkout -q <이 가지> && bash /tmp/build-b.sh >/tmp/build.log 2>&1; tail -1 /tmp/build.log'
ssh -i loadtest.pem ubuntu@43.200.70.164 'scp -i ~/.ssh/loadtest.pem -q ~/app-test.tar.gz ubuntu@172.31.13.128:/tmp/ && scp -i ~/.ssh/loadtest.pem -q -r ~/app/deploy/ec2 ubuntu@172.31.13.128:/tmp/ec2-new'
```
그다음 DEPLOY.md 「서버 설정 바꾸기」 1~6 을 A 에서 그대로 한다(ops 폴더 대신 `/tmp/ec2-new`), `ALERT_EMAIL` 은 비워 둔다(시험 메일 X). 이어서 `sudo bash /tmp/ec2-new/deploy-release.sh /tmp/app-test.tar.gz "$(date -u +%Y%m%dT%H%M%SZ)-s1"`.
Expected: `Release active`, 준비 200

- [ ] **Step 2: 정적 파일과 재시작 틈을 실제로 확인한다**

```bash
ssh -i loadtest.pem ubuntu@<A> 'C=$(curl -s http://172.31.13.128/ | grep -o "/_next/static/[^\"]*\.js" | head -1);
curl -sI http://172.31.13.128$C | grep -iE "^HTTP|cache-control";
sudo systemctl stop fixup-image-agent; curl -s -o /dev/null -w "node 멈춤 중 정적=%{http_code}\n" http://172.31.13.128$C;
curl -s -o /dev/null -w "없는 조각=%{http_code}\n" http://172.31.13.128/_next/static/chunks/nope.js;
( sleep 3; sudo systemctl start fixup-image-agent ) & curl -s -o /dev/null -w "재시작 틈 첫 화면=%{http_code} %{time_total}s\n" http://172.31.13.128/'
```
Expected: `HTTP/1.1 200`·`immutable`, Node 멈춤 중 정적 200, 없는 조각은 Node 가 답해 404(Node 가 멈춘 동안이면 20초 기다린 뒤 502 — 둘 다 괜찮다), 재시작 틈 첫 화면 200(3~10초)

- [ ] **Step 3: 감시를 실제로 확인한다**

```bash
ssh -i loadtest.pem ubuntu@<A> 'sudo systemctl stop fixup-image-agent; sleep 130; sudo journalctl -u fixup-image-agent-monitor --since "3 min ago" --no-pager | tail -5; sudo ls /var/lib/fixup-image-agent-monitor; sudo systemctl start fixup-image-agent'
```
Expected: 상태 폴더에 `down.count` 2 이상, `down.alerted` 1(받을 주소가 비어 메일은 안 감). 받을 주소를 넣고 보고 싶으면 시험용 주소로 한 번 해 본다

- [ ] **Step 4: S1 뒤로 다시 잰다 — 로그인 전 200명 3분, 상세페이지 6명, 섞임 50+3**

Task 2 Step 2 와 같은 명령. 결과를 기준선 문서 「S1 뒤」 절에 적고 커밋한다.

```bash
git add docs/capacity/2026-09-29-baseline.md
git commit -m "docs(capacity): S1 뒤 다시 잰 숫자"
```
Expected(성공 기준 일부): 로그인 전 200명 재시작 0회. 섞임·상세페이지 재시작 0회

---

### Task 10: 운영 반영

**Files:** 없음

- [ ] **Step 1: 사용자 콘솔 작업 — 운영 서버 t3.medium, 크레딧 사양 확인**(DEPLOY.md 「서버 크기 바꾸기」). 사용자가 끝났다고 하면 `ssh … 'nproc; free -m'` 로 4GB 를 확인한다
- [ ] **Step 2: PR·머지·배포**(DEPLOY.md 「매 배포」 — 배포 전 다른 터미널 머지·마이그레이션 확인, 진행 중 생성 수 확인)
- [ ] **Step 3: 「서버 설정 바꾸기」 1~6 을 운영에서**. `app.env` 에 `NODE_OPTIONS=--max-old-space-size=<Task 4 값>`, `ALERT_EMAIL=<사용자에게 받은 주소>`
- [ ] **Step 4: 확인** — `systemctl is-active fixup-image-agent caddy fixup-image-agent-monitor.timer`, 로컬 200, 정적 조각 `immutable`, `systemctl show fixup-image-agent -p MemoryHigh -p MemoryMax`, 감시 상태 폴더가 1분마다 갱신되는지
- [ ] **Step 5: 시험 서버의 조건 되돌리기**(Task 1 Step 3 명령) — 다음 단계 측정에 계속 쓰면 그대로 둔다
