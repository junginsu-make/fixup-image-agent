# 레이아웃 고정 카드뉴스 (A + B) 설계

작성 2026-09-03 · 상태: 확정, 구현 대기

---

## 한 줄

**칸을 먼저 정하고, 그 칸에만 AI 가 그림을 넣는다.** 글은 우리가 직접 그린다.

## 왜 필요한가

지금 카드뉴스는 카드 한 장을 통째로 fal 에게 그리게 한다. 레이아웃도 글자도
모델이 그린다. 그래서 이런 일이 생긴다.

- 같은 레퍼런스로 만들어도 **장마다 글자 위치가 다르다**
- 헤드라인이 **모델이 요약한 짧은 라벨**로 바뀐다. 프롬프트로 여러 번 못
  박았지만 완전히 막히지 않는다
- 한글 자간·줄바꿈이 깨진다. 모델은 한글을 그림으로 그린다

이 세 가지는 프롬프트로 못 고친다. 글자를 모델이 그리는 한 계속 난다.

**칸을 우리가 정하고 글을 우리가 그리면 세 문제가 동시에 사라진다.** 모델은
자기가 잘하는 것 — 그림 — 만 한다.

## 확정된 결정

| 질문 | 결정 |
|------|------|
| 템플릿 단위 | **카드 한 장씩.** 장마다 다른 뼈대를 고른다 |
| 칸 종류 | **text · image · logo · background** 네 가지 |
| 그림 칸 크기 | **칸 비율대로 생성.** 여백도 잘림도 없다 |
| B 의 기대치 | **초안까지.** 사람이 화면에서 고쳐 쓴다 |

---

## 데이터 모델

### 좌표는 비율로 둔다

칸 위치를 픽셀로 두면 4:5 로 만든 템플릿을 9:16 에 못 쓴다. **0~1 사이 비율**로
둔다. 카드 크기가 바뀌어도 같은 뼈대가 그대로 쓰인다.

```ts
export interface SlotBox {
  x: number;      // 0~1, 왼쪽에서
  y: number;      // 0~1, 위에서
  width: number;  // 0~1
  height: number; // 0~1
}
```

### 칸 네 가지

```ts
export type LayoutSlot =
  | { kind: "background"; box: SlotBox; fill: string }         // #RRGGBB 단색
  | { kind: "image";      box: SlotBox; brief?: string }        // AI 가 그린다
  | { kind: "logo";       box: SlotBox; referenceImageId: string; fit: "contain" }
  | { kind: "text";       box: SlotBox; source: TextSource; style: TextStyle };
```

`background` 는 지금은 단색만이다. 그라디언트·무늬는 범위 밖 — 필요하면
`image` 칸을 배경 크기로 깔면 된다.

`logo` 는 **AI 를 거치지 않는다.** 라이브러리의 그림을 그대로 놓는다. 로고를
모델이 다시 그리면 항상 다른 로고가 된다.

### 글 칸이 무엇을 담는가

카피는 이미 있는 파이프라인(`packages/sns-core/src/copy.ts`)이 만든다. 새로
만들지 않고 **그 결과를 칸에 꽂는다.**

```ts
export type TextSource =
  | { from: "copy"; field: "headline" | "body" | "accent" | "footnote" }
  | { from: "fixed"; text: string };   // 「자세히 보기」 같은 고정 문구
```

`CardCopy` 에 없는 칸(`body` 가 비었는데 body 칸이 있는 경우)은 **그 칸을
통째로 비운다.** 빈 상자를 그리지 않는다.

### 글씨 모양

```ts
export interface TextStyle {
  family: string;          // 동봉한 폰트 이름
  weight: 400 | 700;
  /** 칸 높이 대비 비율. 픽셀로 두면 카드 크기가 바뀔 때 안 맞는다. */
  sizeRatio: number;
  lineHeight: number;      // 배수
  color: string;           // #RRGGBB
  align: "left" | "center" | "right";
  valign: "top" | "middle" | "bottom";
}
```

**글자 수 상한은 두지 않는다.** 글이 칸을 넘치면 **폰트를 줄여서** 맞춘다
(아래 「넘치면 줄인다」). 상한을 두면 사람이 쓰고 싶은 말을 못 쓴다.

### 템플릿

```ts
export interface CardTemplate {
  id: string;
  name: string;                       // 「그림 위 · 글 아래」
  role: "cover" | "body" | "ending";  // 어느 자리에 어울리는가 (거르기용, 강제 아님)
  slots: LayoutSlot[];                // 뒤에 있는 것이 위에 그려진다
}
```

칸 순서가 곧 쌓이는 순서다. 배열 뒤쪽이 위에 온다. `background` 를 맨 앞에
두는 것은 관례이지 강제가 아니다 — 그림 위에 반투명 배경을 덮는 것도 이
규칙 하나로 된다.

### 어디에 저장하나

표는 **다시 쓰려고 저장한 뼈대**만 담는다. 기본 템플릿 목록은 코드에
있고(`template.ts`) 표에 넣지 않는다 — 코드에 있는 것을 DB 에도 두면 둘이
어긋나는 날이 온다.

B 로 읽어냈거나 화면에서 고친 뼈대는 「이 뼈대 저장하기」를 눌렀을 때만
이 표에 들어간다. 안 눌러도 그 카드에는 그대로 쓰인다.

```sql
-- supabase/migrations/202609030001_card_layout.sql
create table card_layout_templates (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  role         text not null check (role in ('cover','body','ending')),
  slots        jsonb not null,
  created_at   timestamptz not null default now()
);
alter table card_layout_templates enable row level security;
create policy "own templates" on card_layout_templates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

카드별 선택은 **새 표를 만들지 않고** 기존 작업 JSON 에 얹는다.

```ts
// SnsFlowCard 에 더한다. 없으면 지금까지대로 통째로 그린다.
layout?: { templateId: string; slots: LayoutSlot[] };
```

**템플릿을 복사해 카드에 박아 둔다.** 참조만 두면 나중에 템플릿을 고쳤을 때
지난 작업이 소리 없이 달라진다.

---

## A — 템플릿을 골라 만들기

```
1. 카피 만들기          (기존 그대로)
2. 카드마다 템플릿 고르기  ← 새로 생김
3. 그림 칸마다 fal 호출
4. 합성
5. 결과
```

### 2 단계 — 고르기

카드 목록 옆에 카드마다 템플릿 드롭다운을 둔다. 「이미지 만들기」의 역할
드롭다운과 같은 모양을 쓴다. 고르면 그 자리에서 **뼈대 미리보기**(회색
상자들)를 보여 준다. 그림은 아직 없다.

기본값은 `role` 이 맞는 첫 템플릿. 고르지 않고 넘어가면 **지금까지 방식**
(통째로 그리기)으로 만든다. 기존 동작을 건드리지 않는다.

### 3 단계 — 그림 칸

칸 하나가 fal 요청 하나다. **칸 비율을 그대로 요청한다.**

```
칸 0.5 × 0.4 · 카드 1088×1360
  → 544 × 544 → 1:1
  → aspect_ratio "1:1" (열거 모델) 또는 image_size 544×544 (픽셀 모델)
```

칸 비율이 모델이 못 만드는 값이면 `chooseModelForRatio`(이미 있다)로 만들 수
있는 모델로 바꾼다. 그래도 안 되면 **가장 가까운 비율로 만들고 가운데를
잘라 넣는다** — 이때만 잘린다. 잘랐으면 화면에 알린다.

칸 프롬프트는 카드 전체 프롬프트가 아니라 **그 칸에 들어갈 그림**만 말한다.

```
A single image to fill a 1:1 area of a card.
Subject: {slot.brief 또는 CardPlan.visualBrief}
Style: {레퍼런스 지시 — 기존 buildAttachmentBlock 재사용}
No text, no letters, no numbers, no logos, no watermark, no borders.
Fill the entire frame; the important subject must not touch the edges.
```

**「글자 넣지 마」를 반드시 넣는다.** 안 넣으면 모델이 그림 안에 제목을
그려서 우리가 그린 글자와 겹친다.

한 카드에 그림 칸이 둘이면 fal 을 두 번 부른다. 비용도 두 배다. 견적 화면에
칸 수를 곱해 보여 준다.

### 4 단계 — 합성

```
빈 캔버스 (카드 크기)
  → background 칸: 단색 채우기
  → image 칸: 받은 그림을 칸에 맞춰 배치
  → logo 칸: 라이브러리 그림을 contain 으로 배치
  → text 칸: 우리가 그린 글자
  → "AI 이미지" 표기 (기존 markAsAi)
  → PNG
```

sharp 의 `composite` 한 번으로 끝난다. 순서는 템플릿의 칸 배열 순서다.

---

## 글자를 서버에서 그린다

### 된다 — 실측했다

2026-09-03 운영 서버(EC2 t3.micro, Ubuntu 24.04)에서 확인했다.

```
sharp({ text: { text: '<span font="40">한글 레이아웃 고정 Test 2026</span>',
                rgba: true, dpi: 200 } })
→ 1484 × 100 PNG. 한글이 정상 글자로 나온다 (tofu 아님).
```

sharp 의 prebuilt libvips 에 Pango 가 들어 있다. 별도 설치가 필요 없다.

### 두 가지를 반드시 처리한다

**1. 폰트를 릴리스에 동봉한다.**

서버에 깔린 한글 폰트는 fallback 하나뿐이라 서체를 고를 수 없다. 라이선스가
자유로운 본문 서체(예: Pretendard, SIL OFL)를 `apps/web/assets/fonts/` 에 넣고
릴리스에 담는다. `prepare-ec2-release.mjs` 가 `public` 을 복사하듯 복사한다.

fontconfig 가 그 폴더를 보게 한다.

```
FONTCONFIG_FILE=/opt/fixup-image-agent/current/apps/web/assets/fonts/fonts.conf
```

**2. fontconfig 캐시 폴더를 준다.**

지금 이 경고가 뜬다.

```
Fontconfig error: No writable cache directories
```

동작은 하지만 **매번 폰트를 다시 훑는다.** 카드 10장이면 열 번이다. systemd
유닛에 쓸 수 있는 캐시를 준다.

```ini
Environment=XDG_CACHE_HOME=/var/lib/fixup-image-agent/cache
```

### 넘치면 줄인다

글이 칸을 넘으면 자르지 않고 **폰트를 줄인다.** 자르면 사람이 쓴 말이
사라지고, 사라진 줄도 모른다.

```
목표 크기 = 칸높이 × sizeRatio
그 크기로 그려 본다 → 칸에 들어가면 끝
안 들어가면 5% 씩 줄여 다시 (최소 목표의 60% 까지)
60% 까지 줄여도 넘치면 → 그대로 두고 화면에 경고
```

Pango 의 `width` 로 줄바꿈을 맡기고, 나온 높이를 잰다. 이 계산은
**순수 함수**로 뺀다 — 폰트 없이 테스트할 수 있어야 한다.

---

## B — 레퍼런스에서 칸을 읽어낸다

「이 레퍼런스처럼 칸을 잡아 줘」를 누르면 AI 가 초안을 만든다. **그대로 쓰지
않는다.** 화면에서 드래그로 고친 뒤 「이대로 쓰기」를 누른다.

### 어떻게

레퍼런스 한 장을 비전 모델에 보내고 칸 목록을 받는다.

```
이 카드 이미지에서 영역을 찾아 주세요. 좌표는 0~1 비율입니다.
- 글이 있는 영역 → text (헤드라인/본문/작은 글씨 중 무엇인지)
- 사진·일러스트 영역 → image
- 로고·심볼 영역 → logo
- 전체를 덮는 단색 → background (그 색의 hex)
겹치는 영역은 뒤에 있는 것이 위입니다. 확실하지 않으면 넣지 마세요.
```

받은 값은 zod 로 검사한다. **믿지 않는다.**

- 0~1 밖 → 잘라 맞춘다
- 넓이·높이 0 → 버린다
- 칸 0개 → 「읽어내지 못했습니다. 직접 고르세요」
- 8개 초과 → 큰 것부터 8개만 (한 카드에 칸이 아홉이면 대개 잘못 읽은 것이다)

### 화면

초안을 카드 비율 상자 위에 얹어 보여 준다. 각 칸은 드래그로 옮기고 모서리로
크기를 바꾼다. 종류는 드롭다운으로 바꾼다. 「다시 분석」과 「직접 만들기」를
같이 둔다 — 「직접 만들기」는 **같은 편집기를 빈 상태로** 여는 것이다.
편집기는 하나뿐이고, B 는 그 편집기에 초안을 채워 주는 입구다.

다 고쳤으면 「이대로 쓰기」로 그 카드에 넣는다. 다른 작업에서도 쓰고 싶으면
「이 뼈대 저장하기」를 누른다 — 그때만 `card_layout_templates` 에 들어간다.

**B 가 실패해도 A 는 그대로 된다.** B 는 A 의 입구 하나일 뿐이다.

---

## 기존 코드와의 관계

**끼워 넣지 않는다.** 새 폴더로 낸다. 버릴 수 있어야 한다.

```
packages/layout-core/              ← 새 꾸러미. 순수 로직만
  src/slots.ts                     칸 타입, 비율→픽셀 환산
  src/fit.ts                       넘치면 줄이기 (순수)
  src/template.ts                  템플릿 검사·기본 템플릿 목록
  src/analyze.ts                   B 의 응답 검사·보정 (순수)
  src/index.ts

apps/web/app/sns/layout/           ← 새 화면
apps/web/app/api/sns/layout/       ← 새 API
apps/web/lib/layout/compose.ts     ← sharp 합성 (여기만 sharp 를 쓴다)
apps/web/assets/fonts/             ← 동봉 폰트
supabase/migrations/202609030001_card_layout.sql
```

기존 파일 중 **딱 두 곳만** 건드린다.

1. `apps/web/app/api/sns/flow-service.ts` — `SnsFlowCard` 에 `layout?` 한 줄
2. `apps/web/lib/sns/runtime.ts` — `saveAsset` 앞에서 `card.layout` 이 있으면
   합성 경로로 보낸다

`layout` 이 없으면 지금까지와 **한 글자도 다르지 않게** 동작해야 한다.

---

## 실패했을 때

| 무엇이 | 어떻게 |
|--------|--------|
| 그림 칸 하나가 실패 | 그 칸만 회색으로 두고 카드는 만든다. 그 칸만 다시 시도 |
| 폰트를 못 찾음 | 기본 폰트로 그린다. 카드는 나온다. 화면에 알린다 |
| 로고 그림이 없어짐 | 그 칸을 비운다. 카드는 나온다 |
| 글이 60% 까지 줄여도 넘침 | 그대로 두고 경고 |
| B 분석 실패 | 빈 캔버스에서 직접 시작 |

원칙 하나 — **카드는 나온다.** 한 칸 때문에 열 장을 못 만들면 안 된다.

---

## 테스트

순수 로직에 붙인다. 그림 비교(스냅샷)는 하지 않는다 — 폰트 판이 조금만
달라져도 깨지고, 깨진 이유를 알 수 없다.

| 무엇 | 어디 |
|------|------|
| 비율 → 픽셀 환산, 반올림으로 칸이 겹치거나 벌어지지 않는지 | `layout-core/slots` |
| 넘치면 줄이기 — 짧은 글은 안 줄임, 긴 글은 줄임, 하한에서 멈춤 | `layout-core/fit` |
| 템플릿 검사 — 칸 0개, 칸이 카드 밖, 겹침 | `layout-core/template` |
| B 응답 보정 — 범위 밖, 0 크기, 빈 목록, 9개 | `layout-core/analyze` |
| 칸 비율 → 모델·비율 고르기 | 기존 `chooseModelForRatio` 재사용 |
| `layout` 없는 카드는 옛 경로로 간다 | `apps/web/lib/sns` |

합성은 통합 테스트 하나만 — 4칸 템플릿으로 PNG 가 나오고 크기가 맞는지.

---

## 범위 밖

- 빈 화면에서 시작하는 별도 템플릿 편집기 화면. 칸을 고치는 편집기는 B 의
  것 하나뿐이고, 「직접 만들기」는 그 편집기를 빈 상태로 여는 것이다
- 그라디언트·무늬 배경
- 칸 회전, 곡선 글자
- 애니메이션·동영상
- 템플릿 공유·마켓

---

## 병렬 작업 경계

이 문서의 구현은 **다른 터미널**이 맡는다. 캐릭터 만들기는 이 세션이 맡는다.
같은 파일을 동시에 고치지 않도록 소유를 못 박는다.

**레이아웃 쪽 소유 (다른 터미널)**

```
packages/layout-core/**                    (새로 만듦)
apps/web/app/sns/layout/**                 (새로 만듦)
apps/web/app/api/sns/layout/**             (새로 만듦)
apps/web/lib/layout/**                     (새로 만듦)
apps/web/assets/fonts/**                   (새로 만듦)
supabase/migrations/202609030001_card_layout.sql
deploy/ec2/fixup-image-agent.service       (XDG_CACHE_HOME 한 줄)
scripts/prepare-ec2-release.mjs            (폰트 복사 한 줄)
```

**캐릭터 쪽 소유 (이 세션)**

```
apps/web/lib/characters.ts
apps/web/app/characters/**
apps/web/app/api/characters/**
apps/web/app/sns/_components/attachment-picker.tsx
apps/web/app/poster/_components/reference-picker.tsx
packages/shared/src/attachment-role.ts
```

**둘 다 건드리는 곳 — 먼저 잡는 쪽이 임자, 반드시 말하고 한다**

```
apps/web/app/api/sns/flow-service.ts    레이아웃은 layout? 한 줄만
apps/web/lib/sns/runtime.ts             레이아웃은 saveAsset 분기만
packages/sns-core/src/index.ts          레이아웃은 export 를 안 더한다
                                        (layout-core 가 자기 index 를 가진다)
```

두 작업 모두 `master` 에 자주 push 한다. 오래 들고 있으면 충돌이 커진다.
