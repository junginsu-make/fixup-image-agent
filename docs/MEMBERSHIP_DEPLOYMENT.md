# 회원제 운영 연결 + AWS EC2·가비아 배포 체크리스트

목표 구조는 아래 하나다.

```text
가비아 A 레코드
  → EC2 Elastic IP
  → Caddy :80/:443 (자동 TLS)
  → Next.js standalone 127.0.0.1:3000 (systemd)
  → Supabase 서울 리전 (회원·Auth·쿼터)
  → Neon (기존 리디자인 RAG)
  → Gemini/OpenAI
```

RDS, ALB, NAT Gateway, CloudFront는 첫 배포에 넣지 않는다. 실제 EC2·DNS 전환 전에는 기존 외부 라이브를 현재 production으로 보고, 아래 게이트를 모두 통과한 뒤 전환한다.

## 0. 운영자가 확정할 값

- 실제 서비스 도메인(예: `studio.example.com`)
- 회원 승인제 유지 여부. 현재 코드는 `pending → admin 승인 → active`로 구현돼 있다.
- 신규 회원 월 기본 이미지 한도. migration의 현재 시작값은 30장이나 운영 적용 전 확정한다.
- `ANALYZE_HOURLY_LIMIT`. 현재 시작값은 10회/시간이며 환경변수로 조정할 수 있다.
- AWS 콘솔에서 현재 계정에 표시되는 Free Tier/크레딧 유형과 대상 인스턴스

## 1. Supabase 전용 프로젝트

- 이 서비스 전용 프로젝트를 서울 리전에 생성한다.
- `supabase/migrations/202607230001_membership_usage.sql`을 적용한다.
- migration 적용 전 `profiles.monthly_quota default 30`을 확정값과 대조한다.
- 운영자 계정으로 회원가입·이메일 확인 후 `supabase/bootstrap_admin.sql`의 placeholder를 로컬에서 바꿔 실행한다.
- Project URL, publishable key, secret key를 준비한다. secret key에는 절대 `NEXT_PUBLIC_`을 붙이지 않는다.
- `supabase config push`는 사용하지 않는다.
- migration은 Docker가 아닌 실제 Supabase SQL Editor 또는 검증된 CLI 연결에서 실행하고 결과를 확인한다.

## 2. 도메인·Auth·Turnstile

아래 `<SERVICE_DOMAIN>`은 실제 가비아 도메인으로 바꾼다.

- Supabase Site URL: `https://<SERVICE_DOMAIN>`
- Supabase Redirect allow list:
  - `https://<SERVICE_DOMAIN>/**`
  - 로컬 시험이 필요하면 `http://localhost:3000/**`
- 이메일 템플릿의 확인 링크가 `/auth/confirm`으로 돌아오는지 실제 메일에서 확인한다.
- Cloudflare Turnstile 전용 widget hostname에 `<SERVICE_DOMAIN>`을 등록한다.
- site key → 빌드 시 `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- 같은 widget의 secret → Supabase Auth CAPTCHA 설정

도메인을 바꿀 때 Turnstile hostname, Supabase `site_url`, `uri_allow_list` 세 곳을 함께 바꾼다. 브라우저 콘솔 `110200`은 hostname 미등록부터, `invalid-input-secret`은 site key/secret 짝 불일치부터 확인한다. 설정 GET의 마스킹된 secret이 아니라 실제 가입·로그인으로 검증한다.

## 3. SMTP

- Supabase Dashboard SMTP 폼에서 host/port/user/pass/sender/sender name을 **전체 입력**한다.
- Management API로 일부 필드만 PATCH하지 않는다.
- 같은 계정을 EC2 `/etc/detail-page-studio/app.env`의 `SMTP_*`에도 넣어 승인 완료 메일에 사용한다.
- SES 조합은 기존 검증 기록에 따라 465/TLS(`SMTP_SECURE=true`)부터 시험한다. 다른 공급자는 공급자 권장 설정을 따른다.
- 인증·비밀번호 재설정·승인 완료 메일을 실제 외부 주소로 각각 수신 확인한다.

## 4. AWS 호스트 준비

AWS 무료 이용 조건은 계정 생성 시점과 콘솔 표시를 기준으로 확인한다. 현재 AWS 안내는 신규 계정의 Free plan/크레딧과 구형 12개월 Free Tier를 구분한다. 인스턴스 생성 화면에서 무료 대상 표시가 없는 유형을 추측으로 선택하지 않는다.

- 리전: 서울(`ap-northeast-2`)
- OS: 지원 중인 Ubuntu LTS x86_64
- 런타임: Node.js 22 LTS 이상과 Caddy. 설치 후 `node --version`, `caddy version`을 확인
- 인스턴스: 신규 크레딧형에서 대상이면 `t3.small` 우선, 구형 12개월 Free Tier라면 대상 여부를 확인한 `t3.micro`
- 디스크: 초기에는 단일 gp3 EBS로 시작하고 콘솔 예상 비용을 확인
- Elastic IP: 인스턴스에 연결해 가비아 A 레코드 대상을 고정
- IAM role: SSM Session Manager 접속 권한. 배포 파일을 private S3에서 받을 경우 해당 객체 read 권한만 추가
- Security Group inbound: `80/tcp`, `443/tcp` 공개. `3000/tcp`는 열지 않는다.
- 서버 관리는 SSM Session Manager 우선. 22번 SSH는 열지 않고, 불가피한 임시 사용 시 현재 IP `/32`로만 제한한다.

주의: AWS는 public IPv4 주소를 시간당 과금한다. “인스턴스 무료 대상”과 “전체 월 비용 0원”은 같은 뜻이 아니므로 Elastic IP를 포함한 Billing 예상액을 확인한다.

참고:

- AWS EC2 Free Tier: https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html
- AWS public IPv4 가격: https://aws.amazon.com/vpc/pricing/
- SSM Session Manager: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager.html

## 5. EC2용 빌드

`NEXT_PUBLIC_*` 값은 브라우저 번들에 빌드 시 들어간다. 빌드 머신의 `apps/web/.env.production.local`에는 실제 production의 **공개 값만** 둔다.

```dotenv
NEXT_PUBLIC_SITE_URL=https://<SERVICE_DOMAIN>
NEXT_PUBLIC_SUPABASE_URL=<PUBLIC_PROJECT_URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<PUBLIC_PUBLISHABLE_KEY>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<PUBLIC_SITE_KEY>
```

AI 키, Supabase secret, SMTP 비밀번호, DATABASE_URL은 빌드 파일에 넣지 않고 EC2 runtime 환경파일에만 둔다.

EC2 artifact는 반드시 Linux에서 만든다. Windows의 pnpm 의존성 링크는 Next standalone 복사 중 권한 오류가 날 수 있고, Windows에서 포함된 native runtime을 Linux EC2에 그대로 배포할 수 없다. 권장 경로는 `.github/workflows/build-ec2-release.yml`이다. GitHub repository Variables에 위 네 `NEXT_PUBLIC_*` 공개값을 등록한 뒤 수동 실행하거나 `main` push 결과를 사용한다. 비밀키는 이 workflow에 넣지 않는다.

```bash
# Linux/WSL에서 직접 만들 때
corepack enable
pnpm install --frozen-lockfile
pnpm build:ec2
tar -czf detail-page-studio.tar.gz -C dist/ec2 .
tar -czf detail-page-studio-ops.tar.gz deploy/ec2
```

`pnpm build:ec2`는 `.next/standalone`에 `public`과 `.next/static`을 합쳐 `dist/ec2`를 만들고 `.env*`를 제거한다. 생성 후 다음을 확인한다.

```bash
test -f dist/ec2/apps/web/server.js
find dist/ec2 -name '.env*' -print   # 출력이 없어야 함
```

## 6. 호스트 설정과 릴리스

빌드 산출물 2개를 private S3 등에 올리고, SSM 세션에서 인스턴스 role로 내려받는다. public bucket이나 채팅으로 시크릿·배포 파일을 전달하지 않는다.

```bash
tar -xzf detail-page-studio-ops.tar.gz
sudo bash deploy/ec2/install-host.sh <SERVICE_DOMAIN>

sudo cp /etc/detail-page-studio/app.env.example /etc/detail-page-studio/app.env
sudoedit /etc/detail-page-studio/app.env
sudo chown root:detail-page /etc/detail-page-studio/app.env
sudo chmod 640 /etc/detail-page-studio/app.env

sudo bash deploy/ec2/deploy-release.sh detail-page-studio.tar.gz
```

`install-host.sh`는 기존 Caddyfile을 덮어쓰지 않고 `/etc/caddy/sites/detail-page-studio.caddy`와 import 한 줄만 추가한다. Caddy는 경로를 나누지 않고 도메인 전체를 `127.0.0.1:3000`으로 보낸다.

`deploy-release.sh`는 새 릴리스 디렉터리를 만든 뒤 `current` symlink를 전환한다. `/api/health`와 `/api/health/ready` 중 하나라도 실패하면 이전 릴리스로 자동 롤백한다. 첫 배포에서 readiness가 실패하면 서비스를 정지한 상태로 남긴다.

## 7. 가비아 DNS와 TLS

1. EC2에 Elastic IP를 연결한다.
2. 가비아 DNS 관리에서 사용할 호스트의 A 레코드를 Elastic IP로 지정한다.
3. DNS 전파 후 Caddy 로그에서 인증서 발급을 확인한다.
4. `https://<SERVICE_DOMAIN>/api/health`가 200인지 확인한다.
5. `https://<SERVICE_DOMAIN>/api/health/ready`가 200인지 확인한다.

Caddy가 80/443을 받아 자동 TLS를 처리한다. 애플리케이션 3000번은 loopback에서만 수신한다.

가비아 DNS 안내: https://customer.gabia.com/faq/detail/227/2521

## 8. 출시 전 E2E

1. 비회원 `/`, `/demo`, `/login`, `/signup` 접근
2. 예전 `/landing.html` → `/` redirect
3. liveness 200, readiness 200
4. 비회원 AI API 직접 호출 → 401
5. 회원가입 + Turnstile + 인증 메일 수신
6. 이메일 확인 후 `/access` 승인 대기
7. admin 승인 + 승인 완료 메일 수신
8. active 회원 PDP 분석 성공 + 크레딧 변화 없음
9. 이미지 생성 성공 + 성공한 이미지 수만큼만 사용량 증가
10. 실패·부분성공·취소 후 DB ledger와 화면 사용량 일치
11. 네트워크 중단 후 같은 작업 재시도에서 이중 차감 없음
12. pending/suspended → 403, quota 초과 → 429
13. 일반 회원 `/admin` 접근 차단
14. 360/390/768/desktop에서 공개·가입·생성·admin 화면 확인
15. 브라우저 네트워크·번들에 Supabase secret/AI 서버 키가 없는지 확인
16. Caddy 정적 이미지와 API가 모두 정상인지 Content-Type까지 확인

모든 항목이 통과한 뒤 가비아 DNS를 production 대상으로 유지한다. 현재 Vercel 배포는 EC2 전환 검증이 끝날 때까지만 기존 상태 확인용으로 남기고, EC2 전환 완료 후 운영 경로에서 제외한다.

## 9. 롤백

배포 직후 health 실패는 자동 롤백된다. 운영 중 이전 릴리스로 돌아갈 때는 서버의 `/opt/detail-page-studio/releases`에서 확인한 정확한 ID만 사용한다.

```bash
ls -1 /opt/detail-page-studio/releases
sudo bash deploy/ec2/rollback-release.sh <RELEASE_ID>
sudo journalctl -u detail-page-studio -n 200 --no-pager
```

DB migration은 가산형으로 유지하고 앱 롤백과 DB 삭제를 묶지 않는다.
