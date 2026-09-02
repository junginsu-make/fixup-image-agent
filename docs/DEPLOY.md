# 배포

운영은 **Supabase(데이터) + EC2(앱)** 다. Vercel 을 쓰지 않는 이유는 하나다 —
이미지 여러 장을 한 요청에서 만드는 데 5~9분이 걸려 서버리스 실행 상한에
걸리고, 앱이 결과를 디스크에 쓴다. 디스크 있는 서버면 지금 코드가 그대로 돈다.

> **개인 배포(`detail-page-studio`)와 같은 서버에 올리지 않는다.**
> 둘 다 3000 포트를 쓰고, 설치 스크립트가 systemd 와 caddy 설정을 건드린다.
> `install-host.sh` 가 그 서버에서는 스스로 멈추지만, 애초에 다른 인스턴스를
> 쓴다.

## 무엇이 어디에 있나

| 것 | 자리 |
|---|---|
| 회원·사용량·작업 기록 | Supabase (상세페이지와 **같은 프로젝트**) |
| 참고 이미지·카드뉴스·포스터 결과 | Supabase Storage `library` 버킷 |
| 웹 | EC2 · systemd `fixup-image-agent.service` · 127.0.0.1:3000 |
| 수집 워커 | EC2 · systemd `fixup-image-agent-worker.service` |
| HTTPS | Caddy (인증서 자동) |
| 릴리스 | `/opt/fixup-image-agent/releases/<id>` · `current` 심볼릭 링크 |
| 환경변수 | `/etc/fixup-image-agent/app.env` (root 소유, 0640) |

저장 경로 규약은 도구가 달라도 같다. 버킷 정책이 **경로 첫 칸으로 소유자를
판정**하므로 첫 칸은 반드시 사용자 id 다.

```
{user_id}/references/{id}.{ext}      참고 이미지
{user_id}/sns/{작업}/{카드}.png       카드뉴스 결과
{user_id}/poster/{작업}/{변형}.png    포스터 결과
```

## 처음 한 번

### 1. Supabase 에 표를 만든다

상세페이지가 쓰는 **그 프로젝트**에 새 표만 더한다. 기존 표의 칸이나 제약은
건드리지 않는다.

```bash
npx supabase link --project-ref <프로젝트-ref>
npx supabase db diff --linked      # 먼저 무엇이 적용될지 본다
```

출력에 기존 표에 대한 `alter table` 이나 `drop` 이 있으면 **멈춘다.** 새
`create table` 과 거기 딸린 정책·권한만 있어야 한다.

적용 전에 상세페이지에 로그인해 `/library` 를 열어 두고 눈으로 상태를
기록한다. 그리고,

```bash
npx supabase db push
```

적용 뒤 같은 화면을 다시 연다. **하나라도 달라지면 멈추고 보고한다.**

새 표가 생겼는지 확인한다.

```sql
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name like any (array['ingest_%','sns_%','reference_%','poster_%'])
 order by table_name;
```

### 2. GitHub Actions 변수를 채운다

릴리스 빌드가 공개 변수를 빌드 시점에 굽는다. 저장소 설정 →
Secrets and variables → Actions → **Variables** 에 넣는다. 하나라도 비면
워크플로가 그 자리에서 멈춘다.

```
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_TURNSTILE_SITE_KEY
```

### 3. EC2 를 만든다

- t3.small 이상 (웹과 워커가 함께 돈다)
- 탄력적 IP 할당
- 보안 그룹: 22(내 IP만) · 80 · 443
- Node.js 22 이상과 Caddy 를 먼저 설치한다

```bash
sudo bash deploy/ec2/install-host.sh studio.example.com
```

사용자·디렉터리·systemd 유닛 두 개·Caddy 사이트를 만들고, 웹과 워커를
`enable` 한다. 아직 시작하지는 않는다 — 환경변수가 없다.

### 4. 환경변수를 넣는다

`deploy/ec2/app.env.example` 을 `/etc/fixup-image-agent/app.env` 로 복사해
채운다. 이름은 전부 코드가 실제로 읽는 것이다.

```bash
sudo cp /etc/fixup-image-agent/app.env.example /etc/fixup-image-agent/app.env
sudo chown root:fixup-agent /etc/fixup-image-agent/app.env
sudo chmod 640 /etc/fixup-image-agent/app.env
sudo -e /etc/fixup-image-agent/app.env
```

Supabase 값은 상세페이지와 **같은 것**을 넣는다. 같은 DB 를 본다.
`LOCAL_*` 은 넣지 않는다.

### 5. DNS 를 가리킨다

도메인 A 레코드를 탄력적 IP 로. Caddy 가 인증서를 알아서 받는다.

## 매 배포

`master` 에 push 하면 GitHub Actions 가 두 꾸러미를 만든다.

```
fixup-image-agent-<sha>.tar.gz        앱
fixup-image-agent-ops-<sha>.tar.gz    deploy/ec2 (스크립트·유닛 파일)
```

받아서 서버에 올린 뒤,

```bash
sudo bash deploy/ec2/deploy-release.sh fixup-image-agent-<sha>.tar.gz
```

새 릴리스를 풀고 `current` 를 옮긴 다음 웹을 다시 시작하고, `/api/health` 와
`/api/health/ready` 를 확인한다. **둘 중 하나라도 실패하면 스스로 이전
릴리스로 되돌린다.** 웹이 건강한 것을 본 뒤에야 워커를 넘긴다 — 웹이
카나리아다.

직접 빌드하려면,

```bash
pnpm install --frozen-lockfile
pnpm build:ec2
node scripts/prepare-ec2-release.mjs   # dist/ec2 에 꾸러미 내용이 생긴다
```

## 되돌리기

```bash
ls /opt/fixup-image-agent/releases
sudo bash deploy/ec2/rollback-release.sh <release-id>
```

되돌린 릴리스도 같은 두 번의 건강 확인을 거친다. 그것마저 실패하면 원래
있던 곳으로 다시 돌려놓는다.

**한 번은 실제로 해 본다.** 되돌리기는 필요할 때 처음 눌러 보면 안 된다.

## 확인

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<도메인>/login
systemctl status fixup-image-agent.service
systemctl status fixup-image-agent-worker.service
journalctl -u fixup-image-agent-worker -n 50
```

사람이 눈으로 볼 것:

- [ ] 상세페이지 계정으로 로그인이 된다 (같은 Supabase 를 본다)
- [ ] 개인 배포가 여전히 정상이다
- [ ] 참고 이미지를 올리고 라이브러리에서 보인다
- [ ] 카드뉴스 한 벌을 운영에서 만든다
- [ ] 포스터 한 장을 운영에서 만든다
- [ ] 비용이 사용량 화면에 쌓인다
- [ ] 되돌리기를 한 번 해 본다

### 유튜브 수집은 따로 확인한다

**EC2 는 유튜브 자막 API 에서 IP 로 막힌다.** 집에서 되던 것이 여기서 막힌다.
`APIFY_TOKEN` 이 없으면 유튜브 수집이 실패한다.

유튜브 채널 하나를 등록하고 워커가 한 바퀴 돌기를 기다린 뒤, 직접 자막이
실패하고 apify 로 넘어가 수집됐는지, 실패 이유가 단계별로 남았는지 본다.
