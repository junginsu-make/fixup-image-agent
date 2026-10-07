import type { EasyMessage } from "./turn";

/**
 * **줄 글의 표시 한 벌**(2026-10-07 2차 설계 §3-0).
 *
 * 대화 표(`easy_messages`)는 바꾸지 않는다. 물음 · 단추 답 · 안내 · 머리말은 줄 글(body)에 붙인
 * 표시로 알아본다 — 1차의 `ad-guide:` · `;job=` 와 같은 방식이다.
 *
 *   물음 줄(도우미)   `ask:<kind>:` [+ `;data=<JSON>`] + 줄바꿈 + 보일 문장
 *   단추 답(사용자)   보일 글 + `;pick=<JSON>`
 *   안내 줄(도우미)   `guide:<kind>:` + 보일 글. 옛 `ad-guide:` 도 광고 안내로 읽는다
 *   머리말(도우미)    `say:` + 보일 글. 일하는 턴의 AI 말이다. 실패 줄 규칙에서 답으로 안 친다
 *
 * JSON 은 `encodeURIComponent` 로 감싼다. 그러면 `;` · `,` · 줄바꿈이 표시 글자와 안 섞인다.
 * 화면 · 모델에 보낼 글은 `visibleBody` 한 곳에서 표시를 뗀다. 그림 줄의 표시
 * (`edit-request:` · `;added=` · `;from=` · `;job=`)는 `row-image.ts` 가 읽고, 여기서는 안 건드린다.
 */
type Row = Pick<EasyMessage, "role" | "body">;

export const EASY_ASK_KINDS = ["kind", "ratio", "photo", "reference", "target", "card"] as const;
export type EasyAskKind = (typeof EASY_ASK_KINDS)[number];
export type EasyGuideKind = "detail" | "ad";

export interface EasyAskRow {
  kind: EasyAskKind;
  /** 물을 때의 판단(갈래 · 말한 비율 · 사진 id 등). 서버가 쓴 값이다. */
  data: Record<string, unknown>;
  /** 보일 문장. */
  text: string;
}

const 물음머리 = "ask:";
const 자료머리 = ";data=";
const 고른머리 = ";pick=";
const 안내머리 = "guide:";
const 옛광고안내머리 = "ad-guide:";
const 머리말머리 = "say:";
const 안내갈래: readonly EasyGuideKind[] = ["detail", "ad"];

function 감싼다(value: unknown): string {
  return encodeURIComponent(JSON.stringify(value));
}

/** 깨졌으면 비운다. 표시 하나 때문에 줄이 안 보이면 안 된다. */
function 객체로푼다(text: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(decodeURIComponent(text));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

export function askBody(kind: EasyAskKind, text: string, data: Record<string, unknown> = {}): string {
  const 자료 = Object.keys(data).length ? `${자료머리}${감싼다(data)}` : "";
  return `${물음머리}${kind}:${자료}\n${text}`;
}

export function readAsk(message: Row): EasyAskRow | undefined {
  if (message.role !== "assistant" || !message.body.startsWith(물음머리)) return undefined;
  const 줄끝 = message.body.indexOf("\n");
  if (줄끝 < 0) return undefined;
  const 머리 = message.body.slice(물음머리.length, 줄끝);
  const 칸 = 머리.indexOf(":");
  const kind = 칸 < 0 ? "" : 머리.slice(0, 칸);
  if (!(EASY_ASK_KINDS as readonly string[]).includes(kind)) return undefined;
  const 나머지 = 머리.slice(칸 + 1);
  const data = 나머지.startsWith(자료머리) ? 객체로푼다(나머지.slice(자료머리.length)) ?? {} : {};
  return { kind: kind as EasyAskKind, data, text: message.body.slice(줄끝 + 1) };
}

/** 단추로 한 답. 보일 글 끝에 고른 값을 붙인다. 다음 물음이 이 값을 잇는다(`ask-chain.ts`). */
export function withPick(text: string, pick: object): string {
  return `${text}${고른머리}${감싼다(pick)}`;
}

export function readPick(message: Row): Record<string, unknown> | undefined {
  if (message.role !== "user") return undefined;
  const at = message.body.lastIndexOf(고른머리);
  return at < 0 ? undefined : 객체로푼다(message.body.slice(at + 고른머리.length));
}

/**
 * 사용자가 **친** 말에 표시 글자가 섞여 있으면 풀어 둔다. 안 그러면 「...;pick=...」을 친 말이
 * 단추 답으로 읽힌다(Review Focus 3). 서버가 받은 말에 한 번 건다.
 */
export function plainTyped(prompt: string): string {
  return prompt.split(고른머리).join("; pick=");
}

/** 도우미 줄 글의 맨 앞에서 표시로 읽히는 머리. `edit-request:` 는 그림 줄 표시지만 함께 막는다. */
const 표시머리들 = [물음머리, 안내머리, 머리말머리, 옛광고안내머리, "edit-request:"];

/**
 * **AI 가 쓴 글의 표시 머리를 푼다**(2차 최종 리뷰 c). 말 답 · 끝 문장 · 보고 다시 쓴 답은 표시 없이
 * 도우미 줄로 남는다. 모델이 「say:...」 · 「ask:ratio:...」로 시작하는 글을 쓰면 그 줄이 머리말 · 물음으로
 * 읽힌다. 첫 쌍점만 전각 「：」으로 바꾼다(읽는 사람에게는 거의 같다). 사용자 말의 `plainTyped` 와 짝이다.
 */
export function plainAiText(text: string): string {
  const 머리 = 표시머리들.find((one) => text.startsWith(one));
  return 머리 ? `${머리.slice(0, -1)}：${text.slice(머리.length)}` : text;
}

export function guideBody(kind: EasyGuideKind, text: string): string {
  return `${안내머리}${kind}:${text}`;
}

export function readGuide(message: Row): { kind: EasyGuideKind; text: string } | undefined {
  if (message.role !== "assistant") return undefined;
  if (message.body.startsWith(옛광고안내머리)) return { kind: "ad", text: message.body.slice(옛광고안내머리.length) };
  const kind = 안내갈래.find((one) => message.body.startsWith(`${안내머리}${one}:`));
  return kind ? { kind, text: message.body.slice(`${안내머리}${kind}:`.length) } : undefined;
}

export function sayBody(text: string): string {
  return `${머리말머리}${text}`;
}

export function isSayBody(body: string): boolean {
  return body.startsWith(머리말머리);
}

/** 보일 글(화면 · 모델 모두). 표시를 뗀다. 그림 줄은 그대로 둔다. */
export function visibleBody(message: Row): string {
  if (message.role === "user") {
    const at = message.body.lastIndexOf(고른머리);
    return at < 0 ? message.body : message.body.slice(0, at);
  }
  if (message.role !== "assistant") return message.body;
  const ask = readAsk(message);
  if (ask) return ask.text;
  const guide = readGuide(message);
  if (guide) return guide.text;
  return isSayBody(message.body) ? message.body.slice(머리말머리.length) : message.body;
}
