# 상세페이지용 캐릭터 (프로젝트 K)

작성일: 2026-07-28

## 왜 필요한가

지금 상세페이지에 사람이 나오면 **매번 다른 사람**이다. 섹션마다 따로 생성되니
1번 섹션의 인물과 4번 섹션의 인물이 남남이다. 사용자는 그 인물이 누구인지
고를 수도, 다음 페이지에서 다시 쓸 수도 없다.

인물을 **먼저 만들어 고정**해두면 그 사람이 페이지 내내 나온다. 제품 레퍼런스를
먼저 정해두는 것과 같은 이치다.

## 어디서 가져오는가

`C:\Users\PC\Desktop\coding\character-ip-service` 에 운영 수준으로 만들어져 있다.
Python/FastAPI, 7,200줄, 멀티테넌트·작업 큐·예산·웹훅까지 갖췄다.

**전부 옮기지 않는다.** 멀티테넌트·API키·예산·큐는 우리에게 이미 있다
(Supabase 인증, 크레딧 예약, RLS, 동기 배치). 두 번 만들 이유가 없다.

가져올 것은 **프롬프트 로직과 흐름**이다. 그건 언어와 무관하고, 실제로 겪어봐야
나오는 문장들이 들어 있다 — 예를 들어 뒷모습 지시문의
"뒤통수에 얼굴 이목구비를 그리지 마라".

| 가져옴 | 버림 |
|---|---|
| 정체성·각도·프레이밍·피부표현 프롬프트 | 멀티테넌트·API키 |
| 후보 → 선택 → 다각도 고정 흐름 | 작업 큐·lease·polling |
| 정체성 우선 규칙 | 예산 경고·웹훅·S3 |

원본 `model_registry.py` 의 프롬프트 빌더는 순수 함수라 그대로 옮길 수 있다.

## 설계

### 1. 흐름

```
텍스트로 인물 묘사
   ↓
후보 2장 생성            ← 사용자 결정: 2장 (원본은 3~4장)
   ↓
마음에 드는 것 선택
   ↓
정면 · 45° · 뒷모습 생성  ← 사용자 결정: 3종 (원본은 6종)
   ↓
캐릭터로 저장 (사용자별)
```

측면 90°를 뺀 이유는 상세페이지에서 거의 안 쓰이기 때문이다. 6종이면 크레딧이
2배인데 두 종은 쓰이지 않는다.

### 2. 참조 예산 — 이 설계의 핵심

**참조가 늘면 서로를 희석시킨다.** 앵커 + 스타일 레퍼런스 둘만으로도 절충이
일어나는 것을 실측했다 — 배경과 글자는 레퍼런스를 따랐는데 제품 라벨만
앵커 성향으로 남았다.

캐릭터 3종을 그대로 더하면 최대 5장이 되고, 결과는 아무것도 선명하지 않은
평균값이 된다.

**그래서 캐릭터는 각도를 골라 1장만 보낸다.**

| 섹션 구성 | 보낼 각도 |
|---|---|
| 정면 클로즈업, 인물 중심 | 정면 |
| 사용 장면, 제품을 든 모습 | 45° |
| 뒤돌아 걸어가는 컷 | 뒷모습 |

어느 각도를 쓸지는 **시나리오 단계에서 LLM 이 섹션마다 정한다.** 스타일
레퍼런스를 고르는 것과 같은 방식이고 이미 잘 되는 것을 확인했다.

정리하면 한 섹션의 참조는 이렇게 된다.

```
캐릭터 1  +  앵커 0~1(제품 보존 토글)  +  스타일 0~1  =  최대 3장
```

### 3. 충돌 규칙

캐릭터와 스타일 레퍼런스가 **같은 것을 두고 다툰다** — 인물을 어떻게 그릴지.

원본에 이미 답이 있다: `identity anchor overrides conflicting scene instructions`.

그대로 쓴다. **인물의 얼굴·체형·머리는 캐릭터가 이기고, 그 밖의 색·서체·구성은
스타일 레퍼런스가 이긴다.** 프롬프트에 명시한다. 안 쓰면 모델이 알아서
절충하는데, 그 절충이 얼굴을 바꾼다.

### 4. 저장

레퍼런스와 같은 방식이다 — Supabase, 사용자별, RLS, 비공개 버킷.
그릇이 이미 있으므로 새로 만들지 않는다.

```sql
create table public.characters (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  source_prompt text not null,        -- 사용자가 적은 인물 묘사
  identity_prompt text not null,      -- 확정된 정체성 서술
  visual_style text not null,         -- photoreal | illustration
  created_at  timestamptz not null default now()
);

create table public.character_views (
  id           uuid primary key default gen_random_uuid(),
  character_id uuid not null references public.characters(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  angle        text not null check (angle in ('front', 'three_quarter', 'back')),
  path         text not null,          -- Storage 경로
  mime_type    text not null default 'image/png',
  unique (character_id, angle)
);
```

### 5. 크레딧

후보 2장 + 다각도 3장 = **5장**이다. 모델 가중치를 그대로 적용한다
(GPT 기준 20크레딧). 캐릭터 하나 만드는 값이 상세페이지 한 장보다 비싸므로
화면에 미리 알린다.

기존 `reserve_generation` 을 쓴다. `p_units` 상한이 60이라 여유가 있다.

### 6. 기존 인물 참조와의 관계

지금 `referenceModelImage`(사용자가 올린 인물 사진 한 장)가 있다. 지우지 않는다 —
실제 모델 사진이 있는 사용자에게는 그게 더 정확하다.

캐릭터는 **사진이 없을 때의 선택지**다. 둘 중 하나만 쓴다. 둘 다 주면 얼굴이
둘이 되어 절충이 일어난다.

## 하지 않는 것

- **측면 90°** — 상세페이지에서 안 쓴다
- **LoRA 학습** — 원본도 v2 범위이고 비활성이다
- **캐릭터 공유** — 레퍼런스와 같이 사용자별로만
- **작업 큐** — 지금 동기 방식으로 충분하다(배치 288초를 견디고 있다)
- **후보 재생성 무한 반복** — 마음에 안 들면 처음부터 다시. 크레딧이 든다

## 단계

| 단계 | 내용 | 검증 |
|---|---|---|
| K1 | 프롬프트 로직 이식 (순수 함수 + 테스트) | 원본과 같은 문장이 나오는지 |
| K2 | 마이그레이션 + 버킷 + RLS | 다른 사용자로 안 보이는지 실제 접근 |
| K3 | 생성 API (후보 2장 → 선택 → 다각도 3종) | 실제 fal 로 끝까지 |
| K4 | 화면 — 만들기, 목록, 상세페이지에서 고르기 | 브라우저로 끝까지 |
| K5 | 섹션별 각도 선택 + 참조 예산 적용 | 같은 인물이 유지되는지 눈으로 |

K5 가 이 프로젝트의 성패다. 캐릭터를 만들어도 섹션에서 얼굴이 바뀌면 의미가 없다.
