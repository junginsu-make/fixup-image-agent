import type { AttachmentRead } from "@fixup/poster-core";

/**
 * **붙인 사진을 어떻게 쓸지**(설계 §2-3 ⓑ2 · §2-4, 2026-09-30 사용자 결정).
 *
 * 「붙인 사진은 무조건 분위기 참고가 아니다. 사용자가 말한 대로 따른다.
 * 정확한 말이 필요하면 AI 가 묻는다.」
 *
 * ── 왜 화면 밖에 있나 ────────────────────────────────────────
 *
 * 무엇을 묻고 돌아온 답을 어떻게 읽을지가 판단이다. 라우트나 `.tsx` 안에 두면
 * 값으로 못 잰다 — `chat.ts` · `ask.ts` 가 지켜 온 방식이다.
 *
 * ── 모르면 묻는다 ────────────────────────────────────────────
 *
 * 읽기가 느슨하면 모르는 사진이 「분위기 참고」로 떨어진다. 그러면 지켜야 할
 * 제품이 다시 그려지고 값은 나간다. **모르는 것은 전부 unclear 로 읽는다** —
 * 묻는 값은 0 이다.
 */

/** 「쉽게」가 쓰는 역할 넷. 이미지 만들기의 `AttachmentRole` 에서 「원본 그대로」를 뺀 것. */
export const EASY_PHOTO_ROLES = [
  "style",
  "preserve_product",
  "preserve_person",
  "preserve_person_restyled",
] as const;

export type EasyPhotoRole = (typeof EASY_PHOTO_ROLES)[number];

/** 판단이 돌려줄 수 있는 것 — 역할 넷에 「모름」. */
export type JudgedPhotoRole = EasyPhotoRole | "unclear";

/** 붙인 사진 한 장. ⓪에서 확인을 마친 것이다. */
export interface EasyPhoto {
  id: string;
  title?: string | null;
  url?: string | null;
}

export interface PhotoJudgment {
  role: JudgedPhotoRole;
  /** 말이 이 사진의 쓰임을 말했나. 역할이 unclear 면 늘 거짓이다. */
  said: boolean;
}

export interface RoleJudgment {
  /** 붙인 순서 그대로. 길이는 사진 수와 같다. */
  photos: PhotoJudgment[];
  /** 말 안에서 같은 사진의 쓰임이 엇갈렸나(「1번 그대로… 아 아니다, 느낌만」). */
  conflicting: boolean;
}

const 모름: PhotoJudgment = { role: "unclear", said: false };
const 아는판단 = new Set<string>([...EASY_PHOTO_ROLES, "unclear"]);

/**
 * 한 장을 읽은 것을 ⓑ2 에 줄 한 줄로 만든다.
 *
 * 역할을 가르는 데 필요한 것만 싣는다 — 사람이 있나(몇 명, 누가), 무엇이
 * 있나, 글자가 있나, 디자인은 어떤가.
 */
export function describePhoto(read: AttachmentRead): string {
  return [
    read.people.length ? `사람 ${read.people.length}명 — ${read.people.join(" / ")}` : "사람 없음",
    read.staging.trim() ? `무엇이 있나: ${read.staging.trim()}` : "",
    read.hasText ? "글자 있음(제목·타이포그래피 등)" : "글자 없음",
    read.note.trim() ? `디자인: ${read.note.trim()}` : "",
  ].filter(Boolean).join(" · ");
}

/**
 * ⓑ2 에 보낼 글.
 *
 * **id 를 주지 않는다.** 번호만 준다 — 번호를 id 로 바꾸는 것은 코드가 한다.
 * 모델이 id 를 되돌려주면 옮겨 적다 틀린다.
 */
export function easyRolePrompt(input: {
  words: string;
  photos: ReadonlyArray<{ description?: string }>;
}): string {
  const 사진줄 = input.photos.map((photo, index) =>
    `${index + 1}번: ${photo.description?.trim() || "(설명 없음 — 말로만 정하세요)"}`);

  return [
    "당신은 사용자가 붙인 사진을 **어떻게 쓸지** 정하는 도우미입니다.",
    "사용자는 이 사진들을 재료로 이미지 한 장을 만들려 합니다.",
    "",
    "사진마다 역할 하나를 고르세요.",
    "",
    "  style                     분위기만 참고 — 레이아웃·색·글씨 느낌만 가져오고 내용은 새로 만든다",
    "  preserve_product          제품 그대로 — 제품·로고·물건의 생김새를 그대로 지킨다",
    "  preserve_person           인물 그대로 — 사람의 얼굴·체형·옷차림을 그대로 지킨다",
    "  preserve_person_restyled  인물 그대로 · 그림체만 — 사람은 그대로 두고 그림 느낌만 다른 사진을 따라간다",
    "  unclear                   모르겠다 — 사용자에게 물어본다",
    "",
    "── 정하는 차례 ──",
    "",
    "1. **사용자 말이 먼저입니다.** 말이 그 사진을 가리키고 쓰임을 말했으면 그대로",
    "   따르고 said 를 true 로 둡니다. 「1번 제품은 그대로」·「이 느낌으로」·",
    "   「1번 사람들을 2번 그림체로」·「제품은 살리고」·「이 사람으로」처럼요.",
    "   「바꿔 그리지 마」처럼 **하지 말라는 말도** 쓰임입니다 — 지키라는 뜻입니다.",
    "   「이 느낌으로」·「이 분위기로」·「이 색감으로」는 **느낌만 가져오라는 쓰임**입니다 —",
    "   사람이 찍힌 사진이어도 style, said true 입니다. 되묻지 마세요.",
    "2. 말이 사진을 가리키지만 쓰임이 모호하면(「이걸로」·「이거 참고해서」) 사진을",
    "   봅니다. **이런 말은 쓰임을 말한 것이 아니므로 said 는 false 입니다.**",
    "   한 갈래로만 읽히면 그 갈래입니다 — 제품만 찍힌 사진은 preserve_product,",
    "   글자와 디자인이 있는 포스터·광고·카드뉴스는 style. 사람이 있는 사진은 두",
    "   갈래로 읽히므로(사람을 살릴지 느낌만 볼지) unclear.",
    "3. 말에 사진 이야기가 **전혀 없으면**(「카페 포스터 만들어줘」): 디자인 참고물",
    "   (포스터·광고·카드뉴스)은 style, 제품 사진과 인물 사진은 **unclear** 입니다 —",
    "   그 제품을 그대로 넣을지 느낌만 볼지 말하지 않았기 때문입니다. 2번과 다릅니다.",
    "   said 는 false 입니다.",
    "",
    "**디자인 참고물은 사람이 나와도 디자인 참고물입니다.** 큰 제목·타이포그래피·배치된",
    "문구가 있는 포스터·광고·화보는 모델이 찍혀 있어도 style 입니다(2·3번 모두).",
    "인물 사진은 **글자 디자인 없이 사람을 찍은 사진**을 말합니다.",
    "4. 설명이 없는 사진은 말로만 정합니다. 말이 쓰임을 말하지 않았으면 unclear 입니다.",
    "",
    "**모르면 style 로 두지 마세요.** 지켜야 할 제품이 다시 그려집니다. 애매하면",
    "unclear 로 두세요 — 묻는 것은 값이 들지 않습니다. 대신 **말에 이미 있는 것은",
    "unclear 로 두지 마세요.** 안 들은 것이 됩니다.",
    "",
    "── 말 안에서 엇갈리나 ──",
    "",
    "같은 사진의 쓰임을 말 안에서 서로 다르게 말했으면(「1번은 그대로 해줘. 아",
    "아니다, 1번은 느낌만」) conflicting 을 true 로 두고, 역할은 **나중에 한 말**을",
    "따릅니다. 아니면 false 입니다.",
    "",
    "── 사진 (붙인 순서) ──",
    ...사진줄,
    "",
    "── 사용자 말 ──",
    input.words,
    "",
    "사진마다 번호 · 역할 · said 를 하나씩 돌려주세요.",
  ].join("\n");
}

/**
 * 돌아온 것을 읽는다. **모르는 것은 전부 unclear 다.**
 *
 * - 범위 밖 · 글자 · 소수 번호는 버린다
 * - 같은 번호가 두 번 오면 그 사진은 unclear — 어느 쪽인지 모른다
 * - 모르는 역할은 unclear
 * - said 는 역할이 있을 때만, 그리고 참일 때만 참
 */
export function readRoleJudgment(raw: unknown, count: number): RoleJudgment {
  const value = raw as { photos?: unknown; conflicting?: unknown } | null;
  const list = value?.photos;
  const entries: unknown[] = Array.isArray(list) ? list : [];

  const 번호별 = new Map<number, Array<{ role?: unknown; said?: unknown }>>();
  for (const entry of entries) {
    const one = entry as { number?: unknown; role?: unknown; said?: unknown } | null;
    const number = one?.number;
    if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > count) continue;
    번호별.set(number, [...(번호별.get(number) ?? []), one!]);
  }

  const photos = Array.from({ length: count }, (_, index): PhotoJudgment => {
    const found = 번호별.get(index + 1);
    if (!found || found.length !== 1) return { ...모름 };
    const { role, said } = found[0]!;
    if (typeof role !== "string" || !아는판단.has(role)) return { ...모름 };
    const judged = role as JudgedPhotoRole;
    return { role: judged, said: judged !== "unclear" && said === true };
  });

  return { photos, conflicting: value?.conflicting === true };
}
