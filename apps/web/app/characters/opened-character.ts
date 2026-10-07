/**
 * 라이브러리 「과정 보기」로 연 캐릭터 — 도구 칸을 무엇으로 채울지.
 *
 * 저장된 것: 이름·설명·종류·그림체·각도 그림·만든 모델(2026-10-07 부터).
 * **저장 안 된 것**: 처음에 붙인 참고 그림과 역할(비율은 늘 3:4). 그래서 그것은
 * 비운 채 연다(2026-10-02 조사). 모델은 이어받는다 — 원래 캐릭터에서 옮겨 온
 * 각도와 새로 그리는 각도가 같은 모델이어야 느낌이 맞는다(2026-10-07 사용자 결정).
 */

export interface OpenedCharacter {
  id: string;
  name: string;
  sourcePrompt: string;
  kind: string;
  look: string;
  /** 만든 모델. 기록이 없는 옛 캐릭터는 없다 — 그때는 그림체의 기본 모델로 그린다. */
  modelId?: string | null;
  views: ReadonlyArray<{ angle: string; url: string | null }>;
}

export interface OpenedValues {
  name: string;
  description: string;
  kind: string;
  look: string;
  /** 비면 그림체의 기본 모델이다. */
  modelId: string;
}

export interface OpenedFront {
  base64: string;
  mimeType: string;
}

/** 저장할 때 이름을 자르는 길이 — `handleCreate` 의 `slice(0, 40)` 과 같아야 한다. */
export const NAME_LIMIT = 40;

/** 이름 끝에 붙은 「(수정본)」·「(수정본 2)」. 뿌리 이름을 찾으려고 떼어 낸다. */
const COPY_MARK = /\s*\(수정본(?:\s*\d+)?\)$/;
/** 번호를 올려 보는 한도. 다 쓰였으면 마지막 후보를 돌려준다. */
const MAX_COPIES = 99;

/**
 * 새 캐릭터 이름. 원래 이름 뒤에 「(수정본)」을 붙이고, 이미 있으면 번호를 올린다.
 *
 * 이유가 둘이다. **하나**, 라이브러리는 캐릭터 각도를 **제목(이름)으로만** 찾고
 * 캐릭터를 지울 때도 그 제목으로 지운다(`lib/characters.ts` 의 `deleteCharacter`).
 * 이름이 같으면 한쪽을 지울 때 다른 쪽 각도까지 지워진다. **둘**, 저장할 때 이름을
 * `NAME_LIMIT` 자로 자르므로 긴 이름은 꼬리표가 잘려 원래와 같아진다 — 그래서
 * 본문을 줄여서 꼬리표가 남게 한다.
 *
 * 수정본을 다시 열거나 같은 캐릭터를 두 번 열어도 겹치지 않게, 이미 쓰인 이름
 * (`taken`)과 **원래 이름 자신**을 뺀 첫 후보를 고른다.
 */
export function renamedForCopy(name: string, taken: readonly string[]): string {
  const original = name.trim();
  const base = original.replace(COPY_MARK, "").trim();
  if (!base) return "";
  const used = new Set([...taken.map((entry) => entry.trim()), original]);
  let candidate = "";
  for (let count = 1; count <= MAX_COPIES; count += 1) {
    const suffix = count === 1 ? " (수정본)" : ` (수정본 ${count})`;
    candidate = `${base.slice(0, NAME_LIMIT - suffix.length).trimEnd()}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return candidate;
}

/**
 * 저장한 뒤 이름 칸에 넣을 값. 바꿀 필요가 없으면 `null`.
 *
 * 저장해도 이름 칸은 그대로 남는다. 「만들기」로 돌아가 한 번 더 저장하면 같은 이름의
 * 캐릭터가 또 생기고, 라이브러리 제목과 삭제가 이름에 묶여 있어 한쪽을 지울 때 다른 쪽
 * 각도까지 지워진다. 그래서 **칸이 방금 만든 이름 그대로일 때만** 다음 빈 꼬리로 바꾼다 —
 * 사용자가 고친 칸은 건드리지 않는다.
 *
 * 새 이름은 **방금 저장한 이름**에서 잇는다. 원본 이름에서 이으면 사용자가 직접 정한
 * 「새이름」 다음 칸이 엉뚱하게 원본 이름 꼬리로 바뀐다. 「호롱이 (수정본)」은
 * `renamedForCopy` 가 꼬리를 떼고 보므로 「호롱이 (수정본 2)」로 이어진다.
 */
export function nameAfterSave(
  currentName: string,
  createdName: string | null,
  taken: readonly string[],
): string | null {
  if (createdName === null || currentName.trim() !== createdName.trim()) return null;
  return renamedForCopy(createdName, [...taken, createdName]) || null;
}

/** 칸에 넣을 값. 모르는 종류·그림체(옛 줄)는 첫 종류·실사로 내린다. */
export function openedValues(
  opened: OpenedCharacter,
  kinds: ReadonlyArray<{ id: string }>,
  looks: readonly string[],
  taken: readonly string[],
): OpenedValues {
  return {
    name: renamedForCopy(opened.name, taken),
    description: opened.sourcePrompt,
    kind: kinds.some((entry) => entry.id === opened.kind) ? opened.kind : kinds[0]?.id ?? "person",
    look: looks.includes(opened.look) ? opened.look : "photoreal",
    modelId: opened.modelId ?? "",
  };
}

export function frontViewUrl(opened: OpenedCharacter): string | null {
  return opened.views.find((view) => view.angle === "front")?.url ?? null;
}

/**
 * 새 캐릭터가 **연 캐릭터의 정면 그대로** 만들어졌는가. 그때만 옮겨 담는다.
 * 「다시 뽑기」로 정면이 바뀌었으면 다른 인물이다.
 */
export function madeFromOpenedFront(lastChosen: string | null, openedFront: string | null): boolean {
  return Boolean(lastChosen && openedFront && lastChosen === openedFront);
}

/** 그림 본문을 base64 로. 서버는 정면 본문을 그대로 받는다(`chosenBase64`). */
export async function blobToFront(blob: Blob): Promise<OpenedFront> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  // 서버가 이 형식을 믿는다 — 그림이 아닌 형식(text/plain 등)이 오면 png 로 둔다.
  return { base64: btoa(binary), mimeType: blob.type.startsWith("image/") ? blob.type : "image/png" };
}

export function carryRequest(fromId: string): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fromId }),
  };
}

/**
 * 옮겨 담은 결과를 한 줄로. 옮긴 것도 못 옮긴 것도 없으면 말하지 않는다.
 * 「고르지 않은」이라 쓰지 않는다 — 고른 각도가 못 만들어져도 원본에서 채운다.
 */
export function carriedNote(carried: number, failed: number): string {
  if (carried && failed) {
    return `원래 캐릭터에서 각도 ${carried}장을 옮겨 담았고, ${failed}장은 옮기지 못했습니다. 「내 캐릭터」에서 다시 만드세요.`;
  }
  if (failed) return `원래 캐릭터의 각도 ${failed}장을 옮기지 못했습니다. 「내 캐릭터」에서 다시 만드세요.`;
  return carried ? `원래 캐릭터에서 각도 ${carried}장을 옮겨 담았습니다.` : "";
}
