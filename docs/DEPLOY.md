# 배포

## 구글·카카오 가입 활성화 (2026-10-01)

설계·검증 기록: [소셜가입과 관리자 수동 지급](superpowers/specs/2026-10-01-social-signup-manual-credits-design.md).

**Google·Kakao를 함께 공개한다(2026-10-02 사용자 지시, 10-01의 「Google만 먼저」를 바꿈).** 2026-10-02에 Supabase Google·Kakao 공급자가 모두 켜졌고, 두 인증 시작 요청이 각 업체 로그인 화면(200)까지 오류 없이 가는 것을 확인했다. Kakao 앱은 비즈 앱이며 동의항목은 이메일·닉네임(필수), 프로필 사진(선택)이다. Google 자격증명은 사용자가 로컬 `docs/google cloud/`에 제공했으며 Git 로컬 제외 규칙으로 보호했다. 비밀값은 문서·커밋에 넣지 않는다.

| 등록할 곳 | 이번 서비스에 사용할 주소 |
|---|---|
| Google Cloud: 승인된 JavaScript 원본 | `https://formwith.fix-up.kr` |
| Google Cloud: 승인된 리디렉션 URI | `https://bbuweuvylystagohqlhf.supabase.co/auth/v1/callback` |
| Supabase: 서비스 복귀 주소 | `https://formwith.fix-up.kr/auth/callback` |

제공된 JSON에는 `/api/auth/callback/google`이 기록되어 있으므로, Google Cloud 콘솔의 실제 설정에 Supabase 콜백을 추가했는지 확인해야 한다. 로컬 JSON을 수정하는 것만으로 Google Cloud 설정이 바뀌지는 않는다. Google Client ID·Secret은 Supabase Google 공급자에 입력하되, 아래 DB·앱 준비를 끝낸 후 공급자와 버튼을 활성화한다. 현재 로컬 환경파일의 Supabase 관리 접속 값은 비어 있으므로 원격 설정 변경·DB 적용은 아직 실행하지 않았다.

1. 운영 앱의 `CREDIT_LEDGER=1`, 기존 `credit_enroll_new_profile` 트리거, 신규 0잔액 장부, 현재 AI 통제 SQL을 먼저 확인한다. `scripts/social-signup-preflight.mjs`는 보호된 환경파일을 받아 공급자 활성화와 표/RPC 존재를 읽기 전용으로 확인한다. 트리거 본문·RLS와 배포 앱 설정은 별도 확인이 필요하다.
2. 공급자 공개 전 `202610010001_social_signup.sql`을 적용하고 이 버전의 앱을 함께 배포한다. 이전 전체 회원 전환 SQL을 다시 실행하지 않는다. 같은 Supabase를 쓰는 다른 서비스가 있으므로 기존 회원·권한과 새 OAuth 계정의 가입 완료 경로를 함께 확인한다.
3. Google/Kakao 콘솔에는 Supabase의 `/auth/v1/callback` 주소를 등록하고, Supabase Redirect URLs에는 실제 서비스의 `/auth/callback` 주소를 등록한다. Redirect URLs에는 `next` 쿼리가 붙으므로 `https://formwith.fix-up.kr/auth/callback**`처럼 쿼리까지 덮는 항목으로 넣는다. 운영 `NEXT_PUBLIC_SITE_URL`은 실제 서비스 주소여야 한다. **Supabase Site URL은 바꾸지 않는다** — 같은 프로젝트를 쓰는 다른 서비스의 확인·재설정 메일 링크가 그 값을 쓴다. `next` 쿼리를 포함한 복귀는 실제 가입으로 확인한다. [Supabase Redirect URLs 안내](https://supabase.com/docs/guides/auth/redirect-urls)
4. Kakao는 이메일 제공 권한과 동의 설정을 갖추고 `Allow users without an email`을 끈다. provider secret은 Supabase 설정에만 저장한다. SMTP·CAPTCHA 등 다른 Auth 설정을 전체 덮어쓰기하지 않는다.
5. 실제 신규 가입 → 이름·필수 동의 → 0크레딧 → `/admin` 수동 지급 → 재로그인 없이 잔액 확인 → 생성·정산을 공급자별로 검증한다. 기존 계정의 자동 연결, 취소·정지·탈퇴, 모바일 복귀도 확인한다.
6. 확인한 공급자에 대해 GitHub Actions Variables의 `NEXT_PUBLIC_AUTH_GOOGLE_ENABLED` 또는 `NEXT_PUBLIC_AUTH_KAKAO_ENABLED`를 `1`로 설정해 **새 릴리스를 빌드**한다. 런타임 환경파일만 바꾸면 브라우저 버튼은 바뀌지 않는다. 기본값은 `0`이다.

새 소셜 회원에게는 자동 크레딧을 주지 않는다. 관리자가 `/admin`의 `플랜·크레딧`에서 수량·만료일·사유를 정해 지급한다. 신규 미완료 계정에는 지급할 수 없다.

장애 시 해당 공급자의 진입을 중단하고 회원·동의·지급 기록을 보존한다. 미완료 소셜 계정이 생긴 뒤에는 이 제한을 모르는 옛 앱으로 단순 되돌리지 않는다. DB와 외부 공급자 설정·실계정 검증을 마치기 전에는 공개 완료로 기록하지 않는다.

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
sudo bash deploy/ec2/install-host.sh studio.example.com   # 도메인이 있으면
sudo bash deploy/ec2/install-host.sh 54.180.68.212        # IP 로만 열 때
```

사용자·디렉터리·systemd 유닛 두 개·Caddy 사이트를 만들고, 웹과 워커를
`enable` 한다. 아직 시작하지는 않는다 — 환경변수가 없다.

**도메인이면 HTTPS, IP 면 평문 HTTP 다.** 공개 인증 기관은 IP 에 인증서를
내주지 않는다. 스크립트가 IP 를 받으면 Caddy 사이트 주소에 `http://` 를
붙여 인증서 시도를 아예 막는다 — 안 그러면 발급에 실패하면서 사이트가
뜨지 않는다.

평문일 때 비밀번호는 새지 않는다. 로그인은 브라우저가 Supabase 로 직접
보내고 그 구간은 HTTPS 다. 다만 **로그인 뒤 세션 토큰은 우리 서버로 평문**
으로 오간다. 내부용이면 감수할 만하고, 밖에 열 것이라면 도메인을 붙인다.

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

도메인을 쓰면 A 레코드를 탄력적 IP 로 향하게 한다. Caddy 가 인증서를 알아서
받는다. IP 로만 열 때는 **탄력적 IP 가 붙어 있는지만** 확인하면 된다 — 안
붙어 있으면 인스턴스를 멈췄다 켤 때마다 주소가 바뀐다.

> 로그인은 Supabase 의 CAPTCHA 를 거친다. 새 주소에서 처음 열 때는 그
> 주소(도메인이든 IP 든)를 Cloudflare Turnstile 위젯의 호스트 이름 목록에
> 넣어야 한다. 없으면 `110200` 으로 막힌다.

## 매 배포

`master` 에 push 하면 GitHub Actions(`Build EC2 release`)가 검사·빌드를 하고
꾸러미 둘을 **릴리스 자산**으로 올린다. 태그는 `release-<sha12>` 다.

> **2026-10-02 부터:** 빌드는 검사(`verify`)가 통과한 뒤에만 돈다 — 검사가 실패하면 릴리스가
> 아예 나오지 않는다(약 4분). 그리고 `master` 는 보호돼 있다 — **PR 로만** 들어가고, PR 검사
> `test` 가 통과해야 머지된다(관리자도 같다). 강제 덮어쓰기·삭제는 막혀 있다.

```
fixup-image-agent-<sha12>.tar.gz        앱 (약 56MB)
fixup-image-agent-ops-<sha12>.tar.gz    deploy/ec2 (스크립트·유닛 파일)
```

> **아티팩트가 아니라 릴리스다.** 2026-09-09 배포가 「Artifact storage quota
> has been hit」로 막혔다. 빌드는 멀쩡했는데 56MB 짜리가 90개(4.3GB) 쌓여
> 업로드만 실패했다. 오래된 것을 지워도 GitHub 은 용량을 6~12시간마다 다시
> 계산해서 이튿날까지 못 올렸다. 릴리스 자산은 그 한도와 별개다. 아티팩트
> 업로드도 남아 있지만 `continue-on-error` 라 막혀도 배포를 세우지 않는다.

### 표부터 고치고 배포한다 (해당될 때만)

**`supabase/migrations/` 에 새 파일이 있으면 배포보다 **먼저** Supabase
콘솔에서 실행한다.** 순서가 반대면 그 사이 저장이 전부 실패한다.

칼럼이 없는데 코드가 그 칸을 쓰면 PostgREST 가 `PGRST204` 로 거절한다.
**값을 `null` 로 보내도 마찬가지다** — 칼럼 이름 자체가 스키마 캐시에 없기
때문이다. 읽기도 같이 죽는다(`select("...,새칸")`).

```bash
# 이번 배포에 딸린 마이그레이션이 있나
git diff --name-only <지난배포sha>..HEAD -- supabase/migrations/
```

있으면 그 파일을 열어 내용을 Supabase 콘솔의 SQL Editor 에 붙여 실행한 뒤
아래 절차로 간다. 실행했는지 확실하지 않으면 다시 실행해도 된다 — 이 저장소의
마이그레이션은 `if not exists` 로 적는다.

> **예외 — 파일 첫머리에 ⚠ 순서 경고가 있으면 그것이 이긴다.** 칼럼을
> 더하는 파일은 먼저 돌리는 게 맞지만, **권한을 거두거나 회원을 옮기는
> 파일은 먼저 돌리면 지금 돌고 있는 옛 코드가 막힌다.**
>
> | 파일 | 언제 |
> |---|---|
> | `202609220002_credit_compatibility.sql` | 새 코드 배포와 **같이** (옛 코드는 포스터·카드뉴스 저장 권한을 잃는다) |
> | `202609220003_credit_activate.sql` | 서버에 `CREDIT_LEDGER=1` 을 켜고 재시작한 **뒤** (꺼진 채로 돌리면 전원이 `credit_ledger_required` 로 막힌다) |
>
> 2026-09-22 에 002 를 코드보다 먼저 돌리라고 잘못 안내했다. 로그상 실패한
> 저장은 없었지만 그건 운이었다.

> **「나중에 실행해도 된다」고 적지 않는다.** 2026-09-16 에 커밋 메시지가
> 「마이그레이션 전까지는 저장만 안 될 뿐 고장이 아니다」라고 적었는데
> 사실이 아니었다. 그대로 배포했으면 라이브러리 저장이 전부 실패하면서
> 표·칼럼 이름이 화면에 찍혔다.

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
보이는 것은 정상이다. 기동에 1~2초가 걸린다. `Release active:` 가 보이면
배포 자체는 성공이다.

그 뒤에 **오래된 릴리스를 지운다 — 최근 5 개와 지금 돌고 있는 것만 남는다**
(`prune-releases.sh`). 건강 확인을 다 통과한 뒤에만 돌므로, 되돌릴 곳을 먼저
없애는 일은 없다. 정리가 실패해도 배포는 성공으로 친다 — 새 릴리스는 이미
돌고 있고 디스크는 다음 배포에서 다시 치워진다.

개수를 바꾸려면 `KEEP_RELEASES` 를 준다. **되돌리기가 갈 수 있는 범위가 그
개수로 줄어든다.**

```bash
sudo KEEP_RELEASES=10 bash /tmp/ops-<sha8>/deploy/ec2/deploy-release.sh …
```

> 이 정리는 2026-09-15 에 넣었다. 그전까지 릴리스를 쌓기만 해서 96 개 15G 가
> 되었고, 디스크 29G 중 2.8G 만 남았다. 배포 한 번이 225MB(릴리스 163M +
> `/tmp` 꾸러미 62M)를 먹으므로 열두 번이면 찼다.

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

### 개발 일지에 적는다 (이것까지 해야 배포가 끝난다)

`docs/devlog/` 는 이 시스템을 만든 기록이고 **사용자(비개발자)가 읽는다.** 위 확인이 끝나면
묻지 말고 바로 적는다(사용자 지시, 2026-10-07). 어느 터미널이 배포했든 배포한 쪽이 적는다.
이 단계의 커밋·푸시·PR·병합은 배포를 맡긴 것에 포함된다.

```bash
# 1. 최신 master 에서 문서 브랜치 (dev 서버가 뜬 폴더가 아닌 곳에서)
git fetch origin && git switch -c docs/devlog-<YYYYMMDD>-<sha8> origin/master

# 2. 이번 배포에 처음 들어간 PR 번호
#    지난 배포 sha = 서버의 바로 앞 릴리스 id 끝 8자리 (릴리스 id 는 시각 순으로 정렬된다)
ssh ... 'ls /opt/fixup-image-agent/releases | sort | tail -2'   # 둘째 줄이 이번, 첫째 줄이 지난 배포
git log --merges --format=%s <지난배포sha>..<이번sha> | grep -o '#[0-9]*'
```

   **브랜치에서 별도 배포했으면**(`workflow_dispatch`, 이번 sha 가 master 줄기에 없다) 위 범위가
   틀린다. 그 브랜치의 PR 번호를 직접 적는다. PR 이 아직 안 합쳐졌어도 그 번호를 적는다 —
   합쳐진 뒤 다음 일지 갱신 때 「운영 반영」 표시가 붙는다. 같은 이유로 바로 앞 릴리스가 브랜치
   배포였으면, 그 릴리스에 이미 적힌 PR 은 이번 목록에서 뺀다(직전 entries 파일을 본다).

3. 기록 파일 하나를 만든다. 이름은 `docs/devlog/entries/<배포한 날>-<sha8>.json` (한국 날짜).

```json
{
  "date": "2026-10-07",
  "release": "20261007T031500Z-1a2b3c4d",
  "prs": [260, 261],
  "points": [
    "쉽게 모드에서 만든 이미지를 이어서 고칠 수 있습니다.",
    "로그인 뒤 엉뚱한 화면으로 가던 문제를 고쳤습니다."
  ]
}
```

   - `release` 는 서버 `current` 의 릴리스 id 그대로(`20261007T031500Z-1a2b3c4d` 꼴). 파일 이름 끝
     8자리와 같아야 하고, 같은 릴리스의 기록이 둘이면 `build.py` 가 멈춘다
   - 날짜는 **한국 날짜**다. 릴리스 id 앞부분은 세계 표준시라 오전 9시 전에는 하루 다를 수 있다
   - `points` 는 **사용자가 무엇이 달라졌는지 알 수 있는 쉬운 말**로, PR 하나에 한두 줄.
     기능 이름은 사이드바 이름(쉽게·다양하게·카드뉴스…)으로, 기술 용어·파일 이름·줄표는 쓰지 않는다
   - 공개 저장소다 — 비밀 값·서버 주소·이메일·회원 정보는 적지 않는다
4. 배포한 날이 속한 주(월요일 날짜, 예 `"2026-10-12"`)가 `docs/devlog/weeks.json` 에 없으면
   `title`·`lede`·`points`(빈 목록이어도 된다)를 먼저 적는다. 그 주 배포가 쌓이면 제목·한 줄을
   다시 다듬어도 된다. 기록의 `points` 는 그 주 요약 뒤에 저절로 붙는다
5. `python -X utf8 docs/devlog/build.py` — `index.html`·`README.md` 를 다시 만든다.
   형식이 틀리거나 주 제목이 없으면 이유를 말하고 멈춘다
6. 커밋 → PR(제목은 `docs(devlog): <배포일> 운영 배포 기록` — 이 제목의 PR 은 일지의 작업 묶음에서
   빠진다) → 검사(`test`) 통과 → 병합. `docs/devlog/` 만 고친 병합은 릴리스 빌드가 돌지
   않는다(`paths-ignore`). 다른 파일이 섞이면 빌드가 돈다 — 섞지 않는다
7. 배포 보고에 일지 PR 링크를 함께 준다

**다른 터미널과 겹치면:** 기록 파일은 배포마다 따로라 겹치지 않는다. 다시 만든 `index.html`·
`README.md` 가 충돌하면 손으로 고르지 말고 `git merge origin/master` 뒤 `build.py` 를 다시 돌린다.
같은 새 주에 두 터미널이 각자 `weeks.json` 에 그 주를 더했으면 거기서도 충돌한다 — 그 주는
**한 벌만** 남기고(두 제목 중 하나, `points` 는 합친다) `build.py` 를 다시 돌린다.

### 하지 말 것

| 하지 말 것 | 이유 |
|---|---|
| Windows 에서 `pnpm build:ec2` | 꾸러미는 **Linux 전용**이다. 스크립트가 스스로 막는다 |
| EC2 에서 빌드 | 램이 **911MB** 뿐이다. 빌드하면 돌고 있는 서비스가 죽는다 |
| dev 서버가 뜬 워크트리에서 빌드 | `.next` 를 공유해 사용자 서버가 500 이 된다 |
| 아티팩트 업로드 실패를 배포 실패로 읽기 | 릴리스가 본 배송지다. `verify`·`build` 가 success 면 꾸러미는 나왔다 |

## 서버 설정 바꾸기 (배포 흐름 밖)

`deploy-release.sh` 는 앱만 바꾼다. **유닛·Caddy·감시 타이머는 안 바꾼다** — 이것들은
`install-host.sh` 가 깐다. 바꿀 때는 이 순서로 한다. 먼저 시험 서버에서 같은 순서로 해 본다.

1. ops 꾸러미를 풀어 둔다(매 배포 4번과 같다)
2. 지금 것을 남긴다. **두 번째부터 돌릴 때는 먼저 옛 백업을 지운다** —
   `cp -a`는 대상 폴더가 이미 있으면 그 **안에** 중첩해서 복사한다(`caddy-sites.bak/sites/…`).
   `sudo rm -rf /root/caddy-sites.bak && sudo cp -a /etc/caddy/sites /root/caddy-sites.bak && sudo cp /etc/systemd/system/fixup-image-agent.service /root/unit.bak`

   **처음 한 번만(도메인을 손으로 연결한 서버)**: `sudo mv /etc/caddy/sites/formwith.caddy /root/formwith.caddy.manual`
   — 손으로 만든 도메인 사이트 파일을 치운다. 이제 `install-host.sh` 가 도메인 사이트와
   IP→도메인 넘기기를 한 파일로 깐다. 두 번째부터는 이 단계가 필요 없다
3. `sudo bash /tmp/ops-<sha8>/deploy/ec2/install-host.sh formwith.fix-up.kr http://54.180.68.212`
   (도메인이 없는 서버는 `install-host.sh http://<IP>` 한 인자만 준다). 같은 사이트 주소가
   다른 `*.caddy` 파일에 이미 있으면 스크립트가 **아무것도 바꾸지 않고** 멈추고 알려 준다.
   Caddy 검사(`caddy validate`)도 통과해야 넘어간다 — 실패하면 스크립트가 스스로 옛 설정으로
   되돌린다.

   **이 단계가 0 이 아닌 코드로 끝나면 먼저 메시지를 본다.** 「…처음 한 번 절차를 보세요」
   (다른 파일에 같은 사이트 주소가 이미 있음), 「잘못된 주소」(주소 모양이 틀림), 또는
   「잘못된 조합: site_address 가 HTTPS 가 아니면(http://…) redirect_from 을 쓸 수
   없습니다」(IP 주소에 리다이렉트를 같이 줌)면 **아직 아무것도 안 바뀐 것이다** — 이
   검사들은 useradd·install 등 시스템을 건드리기 전에 먼저 돈다. 되돌리지 말고 원인을
   고쳐 3단계를 다시 돌린다.
   그 밖의 실패(예: Caddy 설정 검사 실패)는 4·5단계로 가지 말고 바로 아래 「되돌리기」를 한다.
   `install-host.sh` 는 자기가 방금 쓴 사이트 파일만 되돌린다 — 「처음 한 번만」에서 손으로
   옮긴 `formwith.caddy`(→ `formwith.caddy.manual`)까지는 되돌려 주지 않는다. 그 상태로 두면
   도메인 사이트가 아예 없는 채로 남을 수 있으니, 실패했으면 디렉터리 전체를 되돌리기 절차로
   복원한다
4. `app.env` 에 새 값이 있으면 넣는다(`ALERT_EMAIL` 등). **`NODE_OPTIONS` 은 운영 app.env 에
   이미 줄이 있다 — 새 줄을 넣지 말고 그 줄의 숫자를 `1536`으로 바꾼다(`t3.medium`으로 바꾼
   뒤에만)** — `t3.micro`(911MB)에서는 힙 상한이 실제 램보다 커서 뜻이 없다. (적용 확인은
   재시작 뒤라야 뜻이 있으므로 6단계에서 한다.)
5. `sudo systemctl daemon-reload && sudo systemctl restart fixup-image-agent && sudo systemctl reload-or-restart caddy`
6. 확인: `systemctl is-active fixup-image-agent caddy fixup-image-agent-monitor.timer`,
   `NODE_OPTIONS` 이 실제로 적용됐는지(재시작 전엔 옛 프로세스라 옛 값만 보인다):
   `sudo cat /proc/$(systemctl show -p MainPID --value fixup-image-agent)/environ | tr '\0' '\n' | grep NODE_OPTIONS`
   (`sudo tr … < /proc/…/environ` 처럼 리다이렉트로 열면 그 파일을 여는 건 sudo 가 아니라
   호출한 셸이라 `environ` 이 0400·`User=fixup-agent` 라서 늘 Permission denied 다 —
   `sudo cat` 으로 읽어서 파이프로 넘긴다),
   `curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/`,
   정적 파일이 Caddy 로 나가는지 확인. **정적 사본은 새 릴리스를 한 번 배포한 뒤에 생긴다 —
   아직 없으면(이번처럼 설정 변경을 새 릴리스 배포보다 먼저 한 경우) 이 확인은 다음 배포
   뒤에 한다.** 먼저 실제 조각 파일 이름을 하나 찾는다(디렉터리가 섞여 나오지 않도록 파일만
   고르고, 전체 경로가 아니라 파일 이름만 찍는다):
   `sudo find /var/www/fixup-image-agent/static/current/_next/static/chunks -maxdepth 1 -type f -name '*.js' -printf '%f\n' | head -1`.
   `http://127.0.0.1/…` 는 Host 가 `127.0.0.1` 이라 어느 사이트 블록과도 안 맞으니 쓰지 않는다 —
   도메인이면 `curl -sI https://formwith.fix-up.kr/_next/static/chunks/<조각> | grep -i cache-control`,
   IP 뿐이면 `curl -sI -H "Host: <IP>" http://127.0.0.1/_next/static/chunks/<조각> | grep -i cache-control`
   (또는 `http://<IP>/…` 로 직접),
   `curl -sI https://formwith.fix-up.kr/ | head -1`(200 이어야 한다),
   `curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://54.180.68.212/`(308 →
   `https://formwith.fix-up.kr/` 이어야 한다).

   감시 메일이 실제로 가는지도 시험해 본다: `ALERT_EMAIL` 을 app.env 에 넣은 뒤
   `sudo env MONITOR_STATE_DIR=/tmp/mon-test MONITOR_HEALTH_URL=http://127.0.0.1:9/ bash /usr/local/lib/fixup-image-agent/monitor.sh`
   를 두 번 돌린다(준비 상태 확인이 두 번 연속 실패해야 메일을 보낸다) — 받은편지함에
   `[FormWith 서버] down` 메일이 와야 한다. 끝나면 `sudo rm -rf /tmp/mon-test` 로 시험 상태를
   지운다. 메일이 안 오면 `sudo journalctl -t …` 를 뒤지기 전에, 방금 돌린 명령 자체의 출력에
   찍힌 「감시 메일을 보내지 못했습니다」줄부터 본다 — 손으로 돌리면 그 자리에서 실패 이유를
   알려 준다.

접근 기록 파일 이름이 바뀐다: 손으로 만들어 두었던 동안은 `/var/log/caddy/formwith.access.log`
였고, `install-host.sh` 가 도메인 사이트를 깐 뒤로는 그 기록도 `/var/log/caddy/fixup-image-agent.access.log`
에 쌓인다.

**되돌리기**: `sudo test -d /root/caddy-sites.bak && sudo rm -rf /etc/caddy/sites && sudo cp -a /root/caddy-sites.bak /etc/caddy/sites && sudo cp /root/unit.bak /etc/systemd/system/fixup-image-agent.service && sudo systemctl daemon-reload && sudo systemctl restart fixup-image-agent && sudo systemctl reload-or-restart caddy`
(맨 앞의 `test -d`는 안전장치다 — 백업이 없으면 `&&` 사슬이 그 자리에서 멈춰 아무것도 안
지운다.)

### fal 계정 풀 열쇠 (처음 한 번, 2026-10 S3b)

관리자 화면 「fal 계정」은 붙여 넣은 fal 키를 **서버 열쇠**(`FAL_KEY_ENCRYPTION_SECRET`)로 잠가 DB 에 둔다.
열쇠는 DB 에 없고 `/etc/fixup-image-agent/app.env` 에만 있다 — DB 를 상세페이지 제품과 함께 쓰므로 DB 만
열려서는 키가 새지 않게 하려는 것이다.

- **열쇠가 없거나 틀리면** 계정 풀이 꺼지고 지금처럼 `FAL_KEY` 하나로 만든다. 서비스는 죽지 않는다.
  등록된 계정이 있는데 열쇠가 없으면 서버 기록에 `[fal-pool]` 줄을 남기고 `ALERT_EMAIL` 로 한 번 알린다
- **열쇠를 잃으면** 등록한 키를 관리자 화면에서 모두 다시 넣어야 한다(각 계정 「키 바꾸기」). fal 대시보드에서
  새 키를 만들면 되므로 돈은 들지 않는다. 그래서 사본 보관은 선택이다 — 보관한다면 비밀번호 관리자에만 둔다
  (이 저장소·채팅·메일에 적지 않는다)

넣기(값이 화면·기록에 찍히지 않게 **서버에서 만든다**):

```bash
ssh -i <운영 키> ubuntu@54.180.68.212 'sudo grep -c "^FAL_KEY_ENCRYPTION_SECRET=" /etc/fixup-image-agent/app.env || true'
```
`0` 이면 넣는다(1 이면 이미 있다 — 덮어쓰지 않는다. 바꾸면 등록한 키를 모두 다시 넣어야 한다):
```bash
ssh -i <운영 키> ubuntu@54.180.68.212 'set -e; F=/etc/fixup-image-agent/app.env; sudo cp -a $F /root/app.env.bak-$(date +%Y%m%d%H%M); S=$(openssl rand -base64 32); printf "\n# fal 계정 풀 열쇠(docs/DEPLOY.md 「fal 계정 풀 열쇠」)\nFAL_KEY_ENCRYPTION_SECRET=\"%s\"\n" "$S" | sudo tee -a $F >/dev/null; unset S; sudo stat -c "%a %U:%G" $F; sudo grep -c "^FAL_KEY_ENCRYPTION_SECRET=" $F'
```
Expected: `640 root:fixup-agent`, `1`. 그다음 재시작(배포와 같다 — 위 「배포 전에 최근 생성 요청을 본다」를 먼저):
```bash
ssh -i <운영 키> ubuntu@54.180.68.212 'sudo systemctl restart fixup-image-agent; sleep 8; systemctl is-active fixup-image-agent; curl -s -o /dev/null -w "local=%{http_code}\n" http://127.0.0.1:3000/'
```
확인: 관리자 화면 → 시스템 → 「fal 계정」 카드에 빨간 「서버 열쇠가 없어」 경고가 **없어야** 한다.

사본을 남기려면(선택, 사용자가 직접): 사용자 터미널에서
`ssh -i <운영 키> ubuntu@54.180.68.212 'sudo grep "^FAL_KEY_ENCRYPTION_SECRET=" /etc/fixup-image-agent/app.env'`
를 돌려 나온 값을 비밀번호 관리자에 「FormWith 운영 FAL_KEY_ENCRYPTION_SECRET」으로 넣는다.

**되돌리기**: 그 두 줄을 지우고(`sudo -e /etc/fixup-image-agent/app.env`) 재시작 → 풀이 꺼지고 `FAL_KEY` 로 만든다.
등록한 계정·기록은 DB 에 그대로 남는다.

**열쇠 바꾸기(회전)**: ① 관리자 화면에서 모든 계정 「사용 끄기」 → ② 모든 계정의 「진행 중」이 0 이 될 때까지
기다린다(진행 중 요청은 옛 열쇠로 푼 키로 묻는다) → ③ `app.env` 의 값을 새 값으로 바꾸고 재시작 → ④ 각 계정
「키 바꾸기」로 키를 다시 넣고 「사용 켜기」. ①~④ 동안은 `FAL_KEY` 로 만든다. 순서를 건너뛰고 ③부터 하면 진행 중
요청의 결과를 받지 못한다.
③ 재시작 뒤에는 옛 열쇠로 잠긴 계정마다 「키를 풀지 못했습니다」 알림 메일이 **계정 수만큼 한 통씩** 온다 —
회전 중이라면 정상이다(④에서 키를 다시 넣으면 풀린다).

### 서버 크기 바꾸기 (AWS 콘솔, 약 5분 정지)

운영 서버는 **운영 AWS 계정**에 있다. 콘솔 EC2 → 인스턴스 선택 →

0. **탄력적 IP** 목록에 `54.180.68.212` 가 있고 운영 인스턴스에 연결돼 있는지 본다.
   **없으면 아래를 진행하지 않는다** — 중지·시작하면 공인 IP 가 바뀌어 도메인(A 레코드 →
   `54.180.68.212`)이 끊긴다. 먼저 탄력적 IP 를 할당·연결하고 도메인 A 레코드를 그 주소로
   바꾼 뒤 진행한다(이때 위 「서버 설정 바꾸기」 3단계의 두 번째 인자도 새 주소로 바꾼다)
1. **인스턴스 상태 → 중지**, 「중지됨」이 될 때까지 기다린다
2. **작업 → 인스턴스 설정 → 인스턴스 유형 변경** → `t3.medium` → 적용
3. **인스턴스 상태 → 시작**. 탄력적 IP 는 **0단계를 확인했을 때만** 그대로 붙어 있다(주소
   안 바뀜)
4. **작업 → 인스턴스 설정 → 크레딧 사양 변경**에서 `unlimited` 인지 본다. `standard` 면 CPU
   크레딧이 떨어질 때 느려진다. `unlimited` 는 오래 바쁘면 CPU 크레딧 추가 요금이 붙을 수
   있다(`t3.medium` 기준 크레딧을 다 쓴 뒤 시간당 소액). `standard` 는 요금 대신 느려지는
   쪽이다
5. 위 「서버 설정 바꾸기」 절차로 메모리 상한을 넣는다

### 배포 전에 최근 생성 요청을 본다

배포는 재시작이다. 끊기면 결과를 잃는 생성(상세페이지·리디자인·캐릭터의 동기 경로)이 도는 중이면
기다렸다 한다. **Caddy 는 요청이 끝날 때 기록을 남긴다** — 그래서 아래 숫자는 "지금 도는 중인
개수"가 아니라 **「최근 5분 안에 끝난 생성 요청 수」**다. 지금 진행 중인 것은 이 숫자와 별개로,
숫자가 0 이어도 잠깐 기다렸다 다시 보는 식으로 가늠한다(끝나야 기록되므로).

Caddy 기록은 사이트마다 파일이 나뉘므로(`*.access.log`) 전부 보고, 「최근 5분」은 줄 수가 아니라
기록 시각(JSON 기록의 `ts`, 초 단위 실수)으로 거른다. 셀 때는 **`"method":"POST"` 인 줄만** 센다 —
안 그러면 캐릭터 목록을 그냥 불러보는 `GET /api/characters` 같은 것도 생성으로 잘못 잡힌다:

```bash
sudo sh -c 'cat /var/log/caddy/*.access.log' | awk -v t=$(( $(date +%s) - 300 )) 'match($0, /"ts":[0-9.]+/) { if (substr($0, RSTART+5, RLENGTH-5)+0 >= t) print }' | grep -F '"method":"POST"' | grep -cE '"/api/(pdp/(images|key-visual)|redesign/(generate|edit-section)|characters)'
```

`tail -n 5000` 이 아니라 파일 전체(`cat`)를 본다 — 기록은 10MiB 에서 잘려 가벼우니 전체를
읽어도 무겁지 않은데, 5000줄은 100명 부하에서 1분치뿐이라 「최근 5분」을 거르기에 모자란다.

최근 5분 안에 끝난 생성 요청이 0 이면 배포한다.

재시작으로 끊긴 생성 요청(상세페이지·리디자인·배경 제거처럼 서버가 끝까지 기다리는 것, 그리고 화면을 닫아
아무도 다시 묻지 않는 카드뉴스·포스터)은 fal 계정의 「진행 중」 칸을 **최대 30분** 더 쥔다(30분 뒤 저절로
빠진다). 그동안은 관리자 화면 「fal 계정」의 진행 중 수가 실제보다 크고, 동시 한도를 그만큼 덜 쓴다.

## 되돌리기

```bash
ls /opt/fixup-image-agent/releases
sudo bash deploy/ec2/rollback-release.sh <release-id>
```

되돌린 릴리스도 같은 두 번의 건강 확인을 거친다. 그것마저 실패하면 원래
있던 곳으로 다시 돌려놓는다.

**갈 수 있는 곳은 최근 5 개뿐이다.** 배포할 때마다 그 앞의 것은 지워진다.
더 멀리 되돌려야 하면 GitHub 릴리스에서 그 꾸러미를 다시 받아 배포한다 —
꾸러미는 `release-<sha12>` 태그에 그대로 있다.

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
