# 계획 4 — 운영 적용과 배포

> **작업자에게:** 이 계획은 **맨 마지막**이다. 계획 1·2·3 이 끝나고 로컬에서 전부 동작을
> 확인한 뒤에만 시작한다. 순서를 앞당기지 않는다.

**Goal:** 로컬에서 완성한 시스템을 운영 Supabase 와 새 EC2 에 올린다.

**Architecture:** 마이그레이션을 운영 Supabase 에 적용하고(새 테이블만), 새 EC2 인스턴스에
Caddy + systemd 로 웹과 수집 워커를 올린다. 개인 배포(`detail-page-studio`)는 건드리지 않는다.

**Spec:** `docs/superpowers/2026-08-31-sns-integration-design.md`

**Prerequisite:** 계획 1·2·3 완료. **로컬에서 카드뉴스 한 벌과 포스터 한 장을 실제로 만들어 본 뒤**에만 시작한다.

## Global Constraints

- **개인 배포를 건드리지 않는다.** 기존 EC2(`nsi-server`, `fixup-insight-prod`)와
  `detail-page-studio` 의 systemd 서비스·Caddy 설정에 손대지 않는다.
- **운영 Supabase 에는 새 테이블만 들어간다.** 기존 테이블의 컬럼·제약을 바꾸지 않는다.
  적용 전에 개인 배포가 정상인지 확인하고, 적용 후에 다시 확인한다.
- **되돌릴 수 있어야 한다.** 배포는 릴리스 단위로 하고 롤백 스크립트를 먼저 확인한다.

---

## Task 1: 운영 Supabase 에 마이그레이션을 적용한다

**Files:**
- 없음 (SQL 은 이미 작성돼 있다)

- [ ] **Step 1: 무엇이 적용될지 먼저 본다**

```bash
supabase db diff --linked
```

**출력에 `alter table` 이나 `drop` 이 기존 테이블에 대해 있으면 멈춘다.**
새 `create table` 과 그에 딸린 정책·권한만 있어야 한다.

- [ ] **Step 2: 개인 배포가 지금 정상인지 확인한다**

배포된 상세페이지에 로그인하고 `/library` 를 연다. **적용 전 상태를 눈으로 기록한다.**

- [ ] **Step 3: 적용한다**

```bash
supabase db push
```

- [ ] **Step 4: 개인 배포가 여전히 정상인지 확인한다**

같은 화면을 다시 연다. **하나라도 달라지면 즉시 보고한다.**
새 테이블만 더했으므로 달라질 것이 없어야 한다.

- [ ] **Step 5: 새 테이블이 실제로 생겼는지 본다**

```sql
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name like any (array['ingest_%','sns_%','reference_%','poster_%'])
 order by table_name;
```

---

## Task 2: 새 EC2 를 만들고 올린다


**Files:**
- Modify: `deploy/ec2/Caddyfile.template` · `deploy/ec2/app.env.example` · `deploy/ec2/*.service`
- Create: `docs/DEPLOY.md`

**Interfaces:**
- Consumes: Task 1 의 저장소
- Produces: 도는 웹 서비스. 기존 상세페이지와 **다른 인스턴스**

- [ ] **Step 1: 서비스 이름을 바꾼다**

`deploy/ec2/detail-page-studio.service` 를 `fixup-image-agent.service` 로 옮기고 안의 이름·경로를 바꾼다.
`deploy-release.sh` · `rollback-release.sh` · `install-host.sh` 안의 서비스명도 함께 바꾼다.

```bash
grep -rn "detail-page-studio" deploy/ scripts/
```

**남는 것이 없어야 한다.** 하나라도 남으면 개인 배포의 서비스를 건드릴 수 있다.

- [ ] **Step 2: 환경변수 표를 만든다**

`deploy/ec2/app.env.example` 에 아래를 더한다. **값은 넣지 않는다.**

```
# 이미지 생성
FAL_KEY=

# 기획·원고 (메인)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5

# 기획·원고 백업 · 검수 · 웹 검색
OPENAI_API_KEY=
OPENAI_DRAFT_MODEL=gpt-5.6-sol
OPENAI_RESEARCH_MODEL=
OPENAI_VISION_REVIEW_MODEL=

# 유튜브 자막 우회 (EC2 IP 차단 때문에 필수)
APIFY_TOKEN=
APIFY_YOUTUBE_ACTOR=automation-lab~youtube-transcript
```

**Supabase 값은 기존 상세페이지와 같은 것을 넣는다.** 같은 DB 를 쓴다.

- [ ] **Step 3: 새 EC2 인스턴스를 만들고 설치한다**

`docs/DEPLOY.md` 에 절차를 적는다:

```markdown
# 배포

## 처음 한 번
1. EC2 인스턴스 생성 (t3.small 이상 — 워커가 함께 돈다)
2. 탄력적 IP 할당
3. 보안 그룹: 22(내 IP) · 80 · 443
4. `deploy/ec2/install-host.sh` 실행 — Node · Caddy · systemd 설치
5. `/etc/fixup-image-agent/app.env` 에 환경변수 기록
6. Caddy 에 도메인 등록 (HTTPS 자동)

## 매 배포
```bash
node scripts/prepare-ec2-release.mjs
bash deploy/ec2/deploy-release.sh
```

## 되돌리기
```bash
bash deploy/ec2/rollback-release.sh
```
```

**개인 배포와 다른 인스턴스여야 한다.** 같은 서버에 두 서비스를 올리지 않는다.

- [ ] **Step 4: 확인**

```bash
curl -s -o /dev/null -w "%{http_code}" https://<도메인>/login
```

Expected: 200. 그리고 **상세페이지 계정으로 로그인이 된다.** 같은 Supabase 를 보기 때문이다.

- [ ] **Step 5: 커밋**

```bash
git add deploy scripts docs/DEPLOY.md
git commit -m "chore(deploy): 새 EC2 배포 설정을 만든다"
```

---

## Task 3: 수집 워커를 서비스로 올린다

- [ ] **Step 0: 워커 서비스 파일의 경로가 아직 개인 배포를 가리킨다**

Task 7 에서 만들 때 `deploy/` 전체가 씨앗 상태였다. 이름만 fixup 이고 경로는 detail-page 다.

```
WorkingDirectory=/opt/detail-page-studio/current
EnvironmentFile=/etc/detail-page-studio/app.env
```

Task 2 의 이름 바꾸기가 이걸 잡았는지 확인한다.

```bash
grep -rn "detail-page" deploy/ scripts/
```

**한 줄이라도 나오면 멈춘다.** 개인 배포의 systemd 서비스를 건드릴 수 있다.

또 `install-host.sh` 가 이 워커를 설치·활성화하는 두 줄을 갖고 있다.
**이 스크립트를 개인 EC2 에서 절대 돌리지 않는다.**

- [ ] **Step 1: 워커 서비스를 설치한다**

`deploy/ec2/fixup-image-agent-worker.service` 를 등록하고 시작한다.

- [ ] **Step 2: 유튜브 수집이 EC2 에서 되는지 확인한다**

**이것이 이 계획의 가장 중요한 확인이다.** EC2 는 유튜브 자막 API 에서 IP 차단된다.
로컬(집 IP)에서는 되던 것이 여기서 막힌다.

유튜브 채널 하나를 등록하고 워커가 한 번 돌기를 기다린 뒤:

```
직접 자막이 실패하고 apify 로 넘어가 수집됐는가?
실패 이유가 단계별로 전부 남았는가?
```

`APIFY_TOKEN` 이 없으면 여기서 실패한다. 그때는 토큰을 넣고 다시 확인한다.

- [ ] **Step 3: 워커가 죽지 않고 도는지 본다**

```bash
systemctl status fixup-image-agent-worker
journalctl -u fixup-image-agent-worker -n 50
```

---

## 마지막 — 사람이 확인할 것

- [ ] 상세페이지 계정으로 새 배포에 로그인이 된다
- [ ] 개인 배포(`detail-page-studio`)가 여전히 정상이다
- [ ] 카드뉴스 한 벌을 **운영에서** 만들어 본다
- [ ] 포스터 한 장을 **운영에서** 만들어 본다
- [ ] 유튜브 수집이 **EC2 에서** 된다 (apify 경로)
- [ ] 비용이 사용량 화면에 쌓인다
- [ ] 롤백 스크립트가 실제로 도는지 한 번 해 본다
