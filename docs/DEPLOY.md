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

상용화 개선의 최초 반영은
`docs/superpowers/specs/2026-09-11-commercial-readiness-design.md`의 §14·§18을 따른다.
이 설계에는 기존 함수·RLS·열 권한 변경도 포함된다. 아래의 일반 초기 설치 절차로
이번 변경을 일괄 적용하지 않는다.

운영에서 수동 적용한 이력이 있으므로 실제 스키마·함수·정책·GRANT를 비교하고,
승인된 변경 중 아직 적용되지 않은 번호형 migration만 적용한다. 한글 수동 SQL이나
이미 반영된 과거 파일을 함께 replay하지 않는다. 영향을 받는 정의와 운영 상태를
백업하고, 공유 DB의 다른 소비 서비스에 대한 확인을 마친 뒤 적용한다.

```bash
npx supabase link --project-ref <프로젝트-ref>
npx supabase db diff --linked      # 먼저 무엇이 적용될지 본다
```

설계에 없는 기존 표 변경이나 데이터 삭제가 나오면 중단한다. 설계에 명시된
ALTER·함수 교체·권한 변경은 변경 목록과 실스키마를 대조하여 검증한다.

적용 전에 상세페이지에 로그인해 `/library` 를 열어 두고 눈으로 상태를
기록한다. 그리고,

```bash
# 검증한 누락 migration 목록만 적용한다. 운영 이력 확인 없이 db push 하지 않는다.
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

사용자·디렉터리·웹/수집/생성 처리기 systemd 유닛·Caddy 사이트를 만든다.
생성 timer는 웹과 DB가 준비된 뒤 배포 스크립트가 시작한다. 기존 수집 워커가
masked이면 유닛을 덮어쓰거나 활성화하지 않는다.

상용 설치는 검증된 도메인의 HTTPS를 사용한다. IP 인증서 지원 여부에 대한
추측으로 HTTP로 자동 전환하지 않는다. 기존 HTTP 운영 설정은 이 문서 수정으로
바뀌지 않는다. DNS·인증서·80/443 접근·Auth 설정을 확인한 뒤 함께 전환한다.

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

### 5. 주소를 고정한다

도메인의 A 레코드를 탄력적 IP로 향하게 하고 Caddy 인증서 발급 및 HTTP→HTTPS
전환을 외부에서 확인한다. `NEXT_PUBLIC_SITE_URL`은 같은 HTTPS origin으로
GitHub Actions 변수와 서버 환경 파일 모두에 설정한다. Supabase Authentication의
URL Configuration과 메일 확인/비밀번호 재설정 redirect allow list도 일치시킨다.

> 로그인은 Supabase 의 CAPTCHA 를 거친다. 새 주소에서 처음 열 때는 그
> 주소(도메인이든 IP 든)를 Cloudflare Turnstile 위젯의 호스트 이름 목록에
> 넣어야 한다. 없으면 `110200` 으로 막힌다.

공개 `/api/health/ready`는 `{ok,status}`만 제공한다. 상세 키 설정 여부와 실행기
상태는 관리자 전용 `/api/admin/diagnostics`에서 확인한다. 키가 있다는 결과를
실제 제공자 인증 성공으로 해석하지 않는다.

CSP는 먼저 보고 모드로 관측한다. 보고에는 directive와 차단 출처만 남기며,
문서 URL·query·쿠키·토큰·스크립트 본문을 기록하지 않는다. Next inline script,
테마, 비용 전략실 iframe, Turnstile, 이미지·다운로드를 실제 브라우저에서 확인한
뒤 강제 모드를 적용한다. 개발의 eval 보고를 없애려고 unsafe-eval을 허용하지 않는다.

## 매 배포

`master` 에 push 하면 GitHub Actions(`Build EC2 release`)가 검사·빌드를 하고
꾸러미 둘을 **릴리스 자산**으로 올린다. 태그는 `release-<sha12>` 다.

```
fixup-image-agent-<sha12>.tar.gz        앱 (약 56MB)
fixup-image-agent-ops-<sha12>.tar.gz    deploy/ec2 (스크립트·유닛 파일)
```

> **아티팩트가 아니라 릴리스다.** 2026-09-09 배포가 「Artifact storage quota
> has been hit」로 막혔다. 빌드는 멀쩡했는데 56MB 짜리가 90개(4.3GB) 쌓여
> 업로드만 실패했다. 오래된 것을 지워도 GitHub 은 용량을 6~12시간마다 다시
> 계산해서 이튿날까지 못 올렸다. 릴리스 자산은 그 한도와 별개다. 아티팩트
> 업로드도 남아 있지만 `continue-on-error` 라 막혀도 배포를 세우지 않는다.

### 절차

```bash
# 1. 릴리스가 만들어졌는지 확인한다 (실행이 끝나야 태그가 생긴다)
gh run list --workflow "Build EC2 release" --limit 1
gh release view release-<sha12> --json assets

# 2. 꾸러미를 받는다
gh release download release-<sha12> -D <작업폴더> -p '*.tar.gz'

# 3. 서버로 올린다
scp -i <키> <작업폴더>/fixup-image-agent-*.tar.gz ubuntu@<호스트>:/tmp/

# 4. 서버에서 ops 를 풀고 배포 스크립트를 돌린다
ssh -i <키> ubuntu@<호스트>
mkdir -p /tmp/ops-<sha8> && tar -xzf /tmp/fixup-image-agent-ops-<sha12>.tar.gz -C /tmp/ops-<sha8>
sudo bash /tmp/ops-<sha8>/deploy/ec2/deploy-release.sh   /tmp/fixup-image-agent-<sha12>.tar.gz "$(date -u +%Y%m%dT%H%M%SZ)-<sha8>"
```

스크립트가 새 릴리스를 풀고 `current` 를 옮긴 다음 웹을 다시 시작하고,
`/api/health` 와 `/api/health/ready` 를 확인한다. **둘 중 하나라도 실패하면
스스로 이전 릴리스로 되돌린다.** 웹이 건강한 것을 본 뒤에야 워커를 넘긴다 —
웹이 카나리아다.

재시작 순간에 `curl: (7) Failed to connect to 127.0.0.1 port 3000` 이 한 번
보이는 것은 정상이다. 기동에 1~2초가 걸린다. 마지막 줄이 `Release active:` 면
성공이다.

### 배포 뒤 확인 (여기까지 해야 배포가 끝난 것이다)

```bash
systemctl is-active fixup-image-agent fixup-image-agent-worker   # 둘 다 active
curl -s -o /dev/null -w "%{http_code}
" http://127.0.0.1:3000/  # 200
sudo readlink -f /opt/fixup-image-agent/current                   # 새 릴리스 id
```

**꾸러미가 아니라 화면이 바뀌었는지를 본다.** 이번에 넣은 변경 중 눈에 보이는
문자열 하나를 골라 빌드 안에서 찾아보면 확실하다.

```bash
sudo grep -rq "<이번에 추가한 문구>" /opt/fixup-image-agent/current/apps/web/.next && echo 반영됨
```

### 하지 말 것

| 하지 말 것 | 이유 |
|---|---|
| Windows 에서 `pnpm build:ec2` | 꾸러미는 **Linux 전용**이다. 스크립트가 스스로 막는다 |
| EC2 에서 빌드 | 램이 **911MB** 뿐이다. 빌드하면 돌고 있는 서비스가 죽는다 |
| dev 서버가 뜬 워크트리에서 빌드 | `.next` 를 공유해 사용자 서버가 500 이 된다 |
| 아티팩트 업로드 실패를 배포 실패로 읽기 | 릴리스가 본 배송지다. `verify`·`build` 가 success 면 꾸러미는 나왔다 |

## 되돌리기

### 생성 장부 v2의 첫 전환과 운영 순서

상용화 설계의 §14·§18을 적용한다. 공유 Supabase를 쓰는 다른 앱의 목록과 호환성, 백업 범위를 먼저 확인한다. migration 이력만 보고 기존 SQL을 재실행하지 않는다. 실제 스키마와 비교한 승인된 변경분을 적용하며 가입 기본 한도 30을 유지한다.

1. 새 릴리스와 같은 SHA의 검사·DB 통합시험·Linux 빌드가 모두 성공했는지 확인한다. 릴리스 자산이 있다는 사실만으로 배포하지 않는다.
2. 기존 호스트의 Caddy 사이트에 템플릿의 내부 실행기 차단과 점검 파일 import를 반영하고 검증한다. `generation-maintenance.sh on`으로 새 생성 진입을 막는다. 첫 전환에서는 구형 status/stop도 비용을 발생시키므로 차단된다. 기존 결과 읽기는 유지한다.
3. 기존 v1 활성 작업을 서버 기록과 제공자 기록으로 대조한다. 만료 실패를 일괄 성공 처리하거나 소급 차감하지 않는다. v1 reserved가 남으면 배포기는 중단한다. 확인한 DB 변경분을 적용하고 새 admission은 닫아 둔다.
4. 새 배포기는 내부 인증키가 없으면 서버 환경 파일에 생성한다. 키를 화면에 출력하거나 저장소에 넣지 않는다. DB admission을 닫고 실행 중 tick과 동기 요청을 기다린 뒤 앱을 바꾼다.
5. 기본 health 확인 → generation oneshot 실행 → 독립 timer 시작 → 같은 릴리스의 heartbeat·schema 확인 순으로 진행한다. collector가 masked면 그대로 보존한다. 실패하면 생성은 닫힌 상태를 유지한다.
6. 기존에 열려 있던 정책만 검사 후 복원하며, 그 사이 운영자가 바꾼 정책은 덮어쓰지 않는다. 첫 배포의 기본 closed 상태는 자동으로 열지 않는다. HTTPS/Auth 검증과 운영자 예산 확정 후 관리자 화면에서 사유와 함께 연다.

운영 확인은 `systemctl status fixup-image-agent-generation-tick.timer`와 `journalctl -u fixup-image-agent-generation-tick.service -n 50`을 사용한다. 실행기는 외부에서 접근할 수 없으며, readiness는 배포기의 비밀키를 사용하는 loopback 검사로 확인한다. 공개 health 성공만으로 자동 생성이 정상이라고 판단하지 않는다.

관리자 화면의 비용은 제공자별 추정치이며 미확인·대기 건수를 함께 본다. 대조 대상은 근거와 실제 확인 비용을 남겨 처리한다. 수락 ID journal이나 private 결과를 복구할 때 새 제공자 요청을 대신 제출하지 않는다. journal 쓰기/읽기 장애와 heartbeat 만료 시에는 새 비용을 차단하고 기존 결과 회수를 유지한다.

**v2를 이해하지 못하는 앱으로 롤백하지 않는다.** 호환 릴리스가 없으면 admission을 닫고 호환 버전을 배포한다. 롤백 때문에 새 테이블을 지우거나 브라우저 쓰기 권한을 다시 넓히지 않는다. 호환 버전도 웹 health와 generation heartbeat를 모두 통과해야 한다.

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
