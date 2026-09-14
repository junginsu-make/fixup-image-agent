# 도메인 확보 이후 실행서 — 상용화 전환

작성 2026-09-14 · 대상 브랜치 `fix/commercial-readiness` · PR [#103](https://github.com/junginsu-make/fixup-image-agent/pull/103)

> **이 문서는 맥락 없이 읽어도 실행할 수 있게 쓴다.** 세션이 바뀌거나 담당이 바뀌어도 이 파일 하나와 아래가 가리키는 문서만 읽으면 된다.
>
> - 무엇을 왜 고쳤나 → `docs/superpowers/specs/2026-09-11-commercial-readiness-design.md`
> - 어떻게 진행했나·무엇을 확인했나 → `docs/superpowers/plans/2026-09-11-commercial-readiness-progress.md`
> - 배포 기계적 절차 → `docs/DEPLOY.md` 의 「생성 장부 v2의 첫 전환과 운영 순서」
> - **이 문서** → 도메인이 생긴 뒤 무엇을 어떤 차례로 하는가, 빠뜨리면 무엇이 깨지는가

---

## 0. 지금 상태 (2026-09-14 기준)

| | |
|---|---|
| 운영 current | `20260911T074130Z-68b10827` — master 의 PR #101. **이 브랜치는 한 번도 배포된 적 없다** |
| 브랜치 | `fix/commercial-readiness` @ `a6aca9d` = master `ceb34c7` 통합 완료 |
| 검증 | 로컬 전 패키지 + 실제 PostgreSQL 51시험 + CI 5잡(`verify`·`integration`·`security/browser`·`staging/database`·`build`) 전부 성공 |
| 마이그레이션 | 22건(`202609110010`~`202609110031`) **운영 미적용** |
| `usage_controls` | **미설정** |
| 막힌 이유 | **HTTPS 도메인 없음.** 아래 §1 |

**코드로 할 일은 끝났다.** 남은 것은 운영 전환과 실측뿐이다.

---

## 1. 왜 도메인 없이는 한 발도 못 나가나

배포 스크립트가 맨 처음 부르는 `deploy/ec2/configure-generation.mjs` 가 이렇게 막는다.

```js
if (parsed.protocol !== 'https:' || ... ) throw new Error('site_origin_invalid');
if (origin(manifest.publicSiteOrigin) !== origin(values.NEXT_PUBLIC_SITE_URL)) throw ...
```

현재 운영은 `NEXT_PUBLIC_SITE_URL=http://54.180.68.212` 이고 Caddy 는 `*:80` 만 듣는다. 따라서 **환경 파일이나 DB 를 건드리기 전에 배포가 거절된다.** 의도된 가드이며 **우회하지 않는다** — 설계 §12.2 가 「HTTP 세션으로 상용 출시하지 않는다」를 못 박았다.

---

## 2. 도메인이 생기면 — 여섯 곳을 한 세트로

하나라도 어긋나면 아래 「깨지는 것」이 그대로 일어난다.

| # | 어디 | 무엇 | 빠뜨리면 |
|---|---|---|---|
| 1 | DNS | A 레코드 → 탄력적 IP(`54.180.68.212`) | 접속 불가 |
| 2 | Caddy | `install-host.sh <도메인>` 또는 사이트 주소 교체 → 인증서 자동 | HTTPS 없음 → 배포 거절 |
| 3 | GitHub Actions **Variables** | `NEXT_PUBLIC_SITE_URL` = `https://<도메인>` | 릴리스 manifest 가 옛 origin → 배포 거절 |
| 4 | EC2 `/etc/fixup-image-agent/app.env` | 같은 값 | manifest 와 불일치 → `site_origin_invalid` |
| 5 | Supabase Auth | Site URL + Redirect allow list 에 도메인 추가 | 로그인·메일 확인·비밀번호 재설정 실패 |
| 6 | Cloudflare Turnstile | hostname 목록에 도메인 추가 | 가입이 `110200` 으로 막힘 |

**3 과 4 는 반드시 같은 값이어야 한다.** 배포기가 두 값을 비교한다.

---

## 3. 마이그레이션 — 21건 먼저, 1건은 앱과 같이

22건 중 **기존 표의 권한을 회수하는 것은 `202609110014_usage_authority` 하나뿐**이다.

```sql
revoke insert(data),update(data,status,updated_at) on public.sns_projects   from authenticated;
revoke insert(data),update(data,status,updated_at) on public.poster_projects from authenticated;
revoke insert,update on public.sns_cards from authenticated;
revoke insert(user_id,project_id,index,kind,role,copy,prompt),
       update(copy,prompt,asset_path,status,review,error) on public.sns_cards from authenticated;
revoke update(thumb_path) on public.sns_cards from authenticated;
```

**지금 앱(v1)은 브라우저에서 이 열들을 쓴다. 앱보다 먼저 적용하면 카드뉴스·포스터가 즉시 멈춘다.**

> ⚠️ 「다른 소비 앱이 없으니 먼저 적용해도 된다」는 **틀린 추론이다.** 위험은 남의 앱이 아니라 **지금 쓰고 있는 이 앱**이다.

나머지 21건은 새 표·새 함수를 더하거나 같은 파일에서 만든 객체의 권한만 조인다. `0011`(v1 RPC 교체)·`0012`(팀 자식 RLS 교체)는 살아 있는 동작을 바꾸지만 **v1 호환을 의도한 변경**이며 CI 의 v1 호환 시험이 지킨다.

적용 방법은 `docs/DEPLOY.md` 를 따른다 — **migration 이력만 보고 재실행하지 않고**, 실제 스키마와 비교해 누락분만 적용한다. 가입 기본 한도는 그대로 둔다.

---

## 4. `usage_controls` — 안 넣으면 전부 503

```sql
-- 세 값이 다 있어야 admission 이 열린다
admission_enabled                    boolean  default false
daily_cost_limit_microusd            bigint   -- null 이면 admission_closed
unresolved_exposure_limit_microusd   bigint   -- null 이면 admission_closed
```

비어 있으면 모든 생성이 **503 「생성 서비스를 점검 중입니다」** 로 거절된다. 버그가 아니라 설계된 안전장치다(§11.3).

**사용자 결정(2026-09-14): 일 상한으로 사용을 제한하고 싶지 않다. 회원 9명이 자유롭게 써야 한다.**

그 뜻을 지키는 방법은 「비우기」가 아니라 「충분히 높게」다. 실제 사용 제한은 이미 **회원별 월 quota 100장**이 하고 있고, 일 상한은 **사고 차단기**로만 쓴다.

| 값 | 제안 | 근거 |
|---|---|---|
| `daily_cost_limit_microusd` | **$50** | 46일 실제 총액 $4.9. 9명 전원이 quota 를 다 써도 월 약 $190 |
| `unresolved_exposure_limit_microusd` | **$20** | 9명이 각자 최대 실행 하나를 동시에 돌려도 통과. 낮으면 정상 요청이 막힌다 |
| `admission_enabled` | **처음엔 false** | 테스트 계정 검증 뒤 관리자 화면에서 사유와 함께 연다 |

**적용 직후 반드시 실측한다** — 정상 요청이 실제로 통과하는지. 설계 출시 게이트 항목이다.

---

## 5. 전체 차례

1. §2 의 여섯 곳을 맞춘다
2. 브랜치에 master 를 통합하고 **수동으로** 무거운 CI 를 돌린다 (§6)
3. 운영 사전 점검 — `docs/DEPLOY.md` §14.1 읽기 전용 항목
4. v1 활성 작업이 0 인지 확인한다 (2026-09-14 확인 시점 **0건**)
5. **마이그레이션 21건** 적용 (`0014` 제외), admission 은 닫힌 채
6. 앱 배포 — `docs/DEPLOY.md` 「생성 장부 v2의 첫 전환과 운영 순서」 그대로
7. **`0014` 적용** — 앱 전환과 같은 시점
8. `usage_controls` 값 입력 (§4)
9. 테스트 계정 하나로 각 생성 경로 1회 → 장부·제공자 기록 대조
10. 메모리·처리 지연 실측 → 이상 없으면 admission 개방

---

## 6. 검증 명령

```bash
# 로컬 (워크트리에서)
pnpm test
pnpm -r typecheck
node --test scripts/tests/*.test.mjs      # PostgreSQL 17 bin 을 PATH 에
pnpm --filter @fixup/web lint
git diff --check
```

> **`pnpm -r test` 가 로컬에서 `packages/ui`·`packages/shared` 를 건너뛸 수 있다.** 이 워크트리의 설치 상태 문제이며 CI 는 정상적으로 돈다. 로컬에서 미심쩍으면 `pnpm --filter @fixup/ui test`, `pnpm --filter @fixup/shared test` 로 따로 돌린다.

**무거운 CI 는 자동으로 안 돈다.**

```bash
# build-ec2-release 는 master push 또는 수동 실행에서만 돈다.
# 브랜치 push 는 가벼운 ci(test+integration)만 돈다.
gh workflow run build-ec2-release.yml --ref fix/commercial-readiness
```

다섯 잡이 전부 success 여야 한다 — `verify` · `integration` · `security / browser` · `staging / database` · `build`. 릴리스 자산 발행(`Publish release assets`)은 master 가 아니면 skip 되며 정상이다.

---

## 7. 확정된 사실 — 다시 조사하지 말 것

| 항목 | 결론 | 확인일 |
|---|---|---|
| 공유 DB 소비 앱 | **없다.** 상세페이지·리디자인은 이 앱에 통합됐고 따로 도는 옛 서비스가 없다. Supabase 프로젝트 `bbuweuvylystagohqlhf`(표시 이름 `page.mktinsight`)의 public 표 27개가 전부 이 앱 것. 게다가 `0014` 의 회수 대상은 카드뉴스·포스터 표뿐이라 다른 스키마가 있어도 영향 밖 | 2026-09-14 |
| 수집(collector) | **쓰지 않는다.** 서버에서 masked 이며 이번 작업이 다시 켜지 않는다 | 2026-09-14 |
| 백업 | 일일 physical 백업 7일치 보관. **PITR 은 꺼짐**(유료 add-on) | 2026-09-14 |
| **Storage 백업** | **없다.** DB 백업에 Storage 객체가 포함되지 않는다. 장부·회원은 전날 자정으로 복구되지만 **생성한 이미지 파일은 복구 수단이 없다** | 2026-09-14 |
| 자원 | 메모리 911MB 중 여유 372MB, web RSS 148MB, 디스크 여유 5.5GiB | 2026-09-14 |
| 장부 | 30건(2026-07-28~09-11), 미해결 0건, 성공인데 비용 null 0건. 회원 9명 전원 active·quota 100 | 2026-09-14 |
| `DATABASE_URL` | Supabase 가 아니라 **Neon**. 리디자인 pgvector 전용이라 장부와 무관 | 2026-09-14 |

---

## 8. 하지 말 것

- **HTTPS 가드를 우회하지 않는다.** `configure-generation.mjs` 의 origin 검사를 풀거나 HTTP 로 배포하지 않는다
- **`0014` 를 앱보다 먼저 적용하지 않는다.** 지금 쓰는 화면이 멈춘다
- **Windows·EC2 에서 운영 빌드를 돌리지 않는다.** 꾸러미는 Linux CI 에서만 만든다
- **dev 서버가 뜬 워크트리에서 빌드하지 않는다.** `.next` 를 공유해 사용자 서버가 500 이 된다
- **admission 을 자동으로 열지 않는다.** 첫 배포의 closed 는 운영자가 사유와 함께 연다
- **사용자 파일·릴리스·운영 데이터를 임의로 지우지 않는다**
- **설계 밖에서 발견한 문제는 기록만 하고 고치지 않는다**

---

## 9. 남은 위험

- **메모리**: 여유 372MB 에서 6단계 timer 가 Node 프로세스를 주기적으로 더 띄운다. 배포 직후 실측하고 모자라면 인스턴스 상향이나 tick 주기 조정이 필요하다.
- **과거 원가 미확인**: 기존 30건 중 13건은 `model` 이 비어 있어 원가를 역산할 수 없다. v2 가 앞으로를 고치지만 과거는 복구 불가이며 비용 대조에서 미확인으로 남는다.
- **Storage 복구 불가**: §7 참조. 필요하다고 판단되면 버킷 버전 관리나 외부 복제를 별도로 검토한다. 이번 범위에 없다.
