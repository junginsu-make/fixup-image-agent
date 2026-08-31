# DB · 회원가입 · admin · 배포 · 데모 통합 설계 (2026-07-23)

> 이 문서가 이번 회원제 전환의 정본이다. 구현 순서는 DB/Auth → 서버 권한 게이트 → 사용량 → 공개 회원 퍼널 → 생성 UX → admin → demo → EC2 운영 배포다.

## 1. 확정된 구조와 production 전 최종값

| 항목 | 확정안 |
|---|---|
| DB/Auth | 이 서비스 전용 Supabase 프로젝트, 서울 리전 |
| 가입 | 현재 구현은 이메일 인증 후 `pending`, 관리자가 승인하면 `active`. production 전 승인제 유지 여부를 운영자가 최종 확정 |
| 비용 | 운영자 AI 서버 키 공용, 회원은 개인 키를 입력하지 않음 |
| 기본 한도 | 매월 1일 00:00 KST 리셋. migration 시작값은 30장이며 production 적용 전 숫자 확정 필요 |
| 차감 | 성공한 생성·재생성·리디자인·이미지 수정 결과만 장당 1크레딧 |
| 분석 | 크레딧 무료, 회원별 시간당 속도 제한은 운영 환경변수로 조정 |
| 저장 | 1차는 회원·권한·사용량만 DB. 작업 초안·결과는 IndexedDB 유지 |
| 데모 | 비회원이 보는 정적 결과물 갤러리. 실시간 AI 호출 없음 |
| 공개 범위 | `/`, `/demo`, 인증 화면만 공개. 스튜디오는 승인 회원 전용 |
| 이메일 | 커스텀 SMTP로 인증·재설정·승인 완료 메일 발송 |
| 봇 방어 | Cloudflare Turnstile을 가입·로그인·비밀번호 재설정에 적용 |

## 2. 시스템 경계

- **Supabase**: 회원, 이메일 확인 상태, role/status, 월 한도, AI 사용 이벤트.
- **기존 Neon RAG**: 리디자인 지식 문서·벡터. 이번 단계에서는 이전하지 않고 비어 있는 현재 상태를 유지한다.
- **브라우저 IndexedDB**: 상세페이지 초안과 생성 결과. 다른 기기로 동기화되지 않음을 화면에 표시한다.
- **AWS EC2**: 가비아 A 레코드 → Elastic IP → Caddy → Next.js standalone 단일 인스턴스로 운영한다. RDS/ALB/NAT Gateway/CloudFront는 1차 제외한다.
- **AI 공급자**: Gemini/OpenAI 키는 EC2의 root 소유 runtime 환경파일에만 둔다. 브라우저 키 UI·헤더·폼 필드는 제거한다.

즉 운영 DB는 당분간 Supabase(회원/쿼터)와 Neon(RAG) 두 개다. 두 DB의 역할을 섞지 않는다.

## 3. 데이터·사용량 설계

### `profiles`

- `id = auth.users.id`, `email`, `email_confirmed_at`
- `role`: `member | admin`
- `status`: `pending | active | suspended`
- `monthly_quota`: migration 현재 기본 30. 실제 적용 전에 운영 기본값 확정
- 승인자·승인 시각·승인 이메일 발송 시각·생성/수정 시각

`auth.users` insert/update 트리거가 프로필을 생성하고 이메일 확인 상태를 동기화한다. 회원은 자신의 행을 읽을 수만 있으며 role/status/quota를 직접 수정할 수 없다.

### `generation_events`

- 사용자별 고유 `request_id`
- `operation`: `pdp_analyze | pdp_image | redesign_generate | redesign_edit`
- KST 월의 `period_start`, 요청 장수, 실제 소비 장수
- `reserved | succeeded | failed`, 예약 만료 시각, 안전한 오류 코드
- 프롬프트·업로드 원본·생성 이미지는 저장하지 않는다.

### 원자적 처리

1. 서버가 로그인·이메일 확인·`active` 상태를 검증한다.
2. `reserve_generation`이 프로필 행을 잠그고 만료 예약을 정리한다.
3. 성공분+예약분+이번 요청이 quota 이하면 10분 예약을 만든다.
4. AI 성공 시 `finalize_generation`이 실제 결과 장수만 소비한다.
5. 실패·부분 실패는 미사용 예약을 반환한다.

유료 AI 요청은 회원당 동시에 1개만 허용한다. 기존 배치 UI가 섹션을 순차 생성하므로 정상 흐름과 충돌하지 않는다.

### idempotency의 정확한 범위

- 클라이언트는 **한 번의 사용자 생성 동작마다 UUID 한 개**를 만들고 같은 네트워크 재시도에는 그 UUID를 재사용한다.
- DB unique key는 같은 동작의 중복 차감을 막는다.
- 1차에서는 생성 이미지를 서버에 저장하지 않으므로, 응답이 유실된 뒤 같은 키로 결과 이미지를 재전송하는 완전한 response replay는 지원하지 않는다.
- 따라서 자동 재시도는 전송 전 실패에만 허용한다. 서버 도달 여부가 불명확한 timeout은 자동 재실행하지 않고 사용자에게 상태를 안내한다.

## 4. 인증·권한·화면

### 인증 흐름

`회원가입 → 이메일 확인 → /access 승인 대기 → admin 승인 → 승인 완료 메일 → 로그인 → /create`

- `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/confirm`, `/access`를 추가한다.
- `@supabase/ssr` 쿠키 세션을 사용한다. 미들웨어는 토큰 갱신과 기본 redirect만 맡고 페이지·서버 액션·API가 권한을 다시 확인한다.
- `pending`과 `suspended` 사용자는 `/access`와 로그아웃만 사용할 수 있다.
- `/settings`는 개인 API 키 화면 대신 이메일·role·사용량·다음 KST 리셋·브라우저 저장 안내를 보여준다.
- 기존 localStorage 개인 키는 회원제 전환 후 삭제하되 IndexedDB 작업은 유지한다.

### API 계약

- `401`: 로그인 필요
- `403`: 이메일 미확인, 승인 대기, 이용 정지, admin 권한 부족
- `429`: 월 quota 초과, 동시 요청, 분석 속도 제한
- 에러 응답은 `code`, 한국어 `message/error`, 가능한 경우 최신 `usage`를 포함한다.
- `/api/pdp/images`, `/api/redesign/generate`, `/api/redesign/edit-section`은 `X-Idempotency-Key`를 요구한다.
- `/api/pdp/validate-key`는 외부 AI를 호출하지 않고 서버 키 설정 유무만 확인하는 호환 endpoint로 축소한다.

### admin

- 이메일 검색, 상태 필터, 페이지네이션
- 이메일 확인 여부, 승인, 정지/해제, 회원별 월 quota 변경
- 승인 완료 메일 자동 발송과 실패 시 재발송
- 전체/대기 회원 수, 오늘/이번 달 성공 이미지 수, 회원별 월 사용량
- role 변경, 회원 삭제, 작업물 열람은 1차 제외

첫 admin은 정상 가입·이메일 확인 후 별도 bootstrap SQL로 `admin/active` 승격한다.

### demo

- `/demo`에서 기존 `public/samples/1~4.jpg`를 정적 갤러리로 노출한다.
- 업로드·생성 API·실시간 비용은 없다.
- 로그인과 회원가입 CTA만 제공하고 랜딩에서도 `/demo`로 연결한다.

### 공개·생성·관리자 UX 우선순위

1. 정적 HTML 랜딩을 React로 전환하고 `/` → `/demo` → `/signup` → 이메일 인증 → 승인 대기 → 첫 생성 흐름을 공통 공개 셸과 4단계 표시로 연결한다.
2. 분석은 이미지 크레딧 0장, 이미지는 성공 1장당 1크레딧임을 실행 버튼 가까이에 표시한다.
3. 생성 중 경과 시간과 현재 대상을 표시하고, 종료 후 성공·실패·미시도·처리 여부 불명 상태를 구분한다.
4. 모바일 admin은 900px 표 대신 회원별 카드로 표시하고 승인·정지·한도·메일 제출 전에 대상과 조치를 확인한다.

## 5. 운영 설정 — 코드보다 먼저 검증할 출시 게이트

이 단계는 단순 환경변수 체크가 아니라 **실제 E2E 통과가 완료 조건**이다. 과거 다른 프로젝트에서 아래 세 설정 때문에 인증 전체가 중단된 기록이 있다.

### Turnstile

1. Cloudflare에서 이 서비스 전용 widget을 만든다.
2. site key는 EC2용 build-time `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, secret은 Supabase Auth CAPTCHA 설정에 둔다.
3. widget 허용 호스트에 실제 사용할 가비아 서비스 도메인을 등록한다.
4. Supabase `site_url`과 redirect allow list도 같은 운영 도메인으로 맞춘다.
5. site key와 secret은 서로 같은 widget의 짝인지 확인한다. 둘 다 비슷한 접두사라 복사 실수가 발생할 수 있다.
6. Management API GET의 마스킹된 secret을 검증 근거로 삼지 않는다. 실제 가입·로그인으로 확인한다.

브라우저 콘솔 `110200`은 Turnstile hostname 미등록을 먼저 확인한다. `invalid-input-secret`은 site key/secret 오입력을 먼저 확인한다.

### SMTP

1. Supabase Dashboard SMTP 폼에서 host, port, user, pass, sender, sender name 전체를 한 번에 설정한다.
2. Management API 부분 PATCH와 `supabase config push`는 사용하지 않는다.
3. 같은 SMTP 계정은 승인 완료 메일용 EC2 `/etc/detail-page-studio/app.env`의 `SMTP_*`에도 설정한다.
4. SES를 선택했다면 과거 검증된 465/TLS를 우선 사용한다. 다른 공급자는 해당 공급자의 권장 포트를 따른다.
5. 설정 조회값이 아니라 외부 테스트 이메일의 실제 수신으로 검증한다.

### 배포 순서

1. 승인제 유지 여부, 월 기본 quota, 분석 시간당 제한 확정
2. Supabase migration 적용 및 first admin bootstrap
3. production 공개 환경변수를 넣어 Next standalone 빌드, runtime secret은 별도 EC2 환경파일에 설정
4. EC2 systemd 서비스와 Caddy 전체 도메인 프록시 설치
5. 로컬 loopback의 `/api/health`, `/api/health/ready` 통과
6. 가비아 A 레코드를 Elastic IP로 지정하고 Caddy TLS 발급 확인
7. 실제 외부 이메일 가입 → 확인 → pending → 승인 → 승인 메일 → 로그인 수행
8. 비회원 API 401, pending 403, quota 429, 실패·부분성공·네트워크 중단 정산 검증
9. 모두 통과한 뒤 EC2를 production으로 확정

문제 발생 시 `/opt/detail-page-studio/releases`의 이전 standalone 릴리스로 `current` symlink를 되돌린다. 배포 스크립트는 health/readiness 실패 시 이를 자동 수행한다. DB migration은 데이터를 삭제하지 않는 가산형으로 유지한다.

## 6. 완료 기준과 제외 범위

- 동시 요청으로도 회원별 설정 quota를 초과 예약할 수 없고 실패·부분성공이 정확히 환불된다.
- 7월 31일/8월 1일 KST 경계에서 새 월 사용량이 0으로 계산된다.
- 개인 키 UI·localStorage·요청 헤더/폼이 사라지고 서버 secret이 브라우저에 노출되지 않는다.
- 기존 PDP/리디자인 생성, 수정, IndexedDB 저장, ZIP 다운로드가 회귀하지 않는다.
- 타입체크·린트·빌드와 운영 URL 브라우저 검증을 통과한다.

1차 제외: 작업물 클라우드 저장, Supabase Storage, IndexedDB 마이그레이션, Neon RAG 이전·자료 등록, 소셜 로그인, 결제, 회원 삭제, role 편집.
