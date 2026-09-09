/**
 * 상세페이지가 글 모델에게 말을 거는 **유일한 통로**.
 *
 * pdp-core 는 어떤 회사의 모델인지 모른다. 무엇을 보내고 무엇을 돌려받는지만
 * 안다. 실제 제공자는 `apps/web/lib/pdp/providers.ts` 가 만들어 넣는다.
 *
 * 전에는 이 패키지가 `GoogleGenAI` 객체를 직접 만들고 `process.env` 를 읽었다.
 * 같은 저장소의 포스터·카드뉴스 코어는 그러지 않는다 — 순수한 채로 두고
 * 바깥세상은 `apps/web` 이 맡는다. 이제 상세페이지도 같다.
 */

/** 함께 보내는 그림. base64 원문과 형식만 필요하다. */
export interface PdpLlmImage {
  base64: string;
  mimeType: string;
}

export interface PdpLlmRequest {
  prompt: string;
  /**
   * 받고 싶은 모양. 표준 JSON Schema 다.
   *
   * 제공자마다 부르는 이름이 다르다 — Claude 는 도구의 `input_schema`,
   * OpenAI 는 함수의 `parameters`. 어느 쪽이든 이 값을 그대로 쓴다.
   */
  schema: unknown;
  /** 그림을 함께 볼 때. 순서가 프롬프트의 「첫 번째 그림」과 같아야 한다. */
  images?: PdpLlmImage[];
  /** 도구 이름. 제공자가 결과를 되돌려 줄 때 이 이름으로 찾는다. */
  name: string;
  /** 한 줄 설명. 모델이 이 도구를 언제 쓰는지 판단하는 데 쓴다. */
  description?: string;
  /** 길게 답해야 하는 호출은 올려 잡는다. 안 주면 제공자 기본값. */
  maxTokens?: number;
}

/**
 * 돌려주는 것은 **JSON 문자열**이다.
 *
 * 이미 있는 파싱 코드가 전부 `response.text` 를 받아 `JSON.parse` 한다.
 * 여기서 객체를 돌려주면 그 코드를 전부 고쳐야 하고, 고치는 만큼 틀릴 자리가
 * 생긴다. 모양을 맞춰 두면 이 교체가 순수한 갈아끼우기로 끝난다.
 */
export interface PdpLlmResponse {
  text: string;
}

export interface PdpLlm {
  generate(request: PdpLlmRequest): Promise<PdpLlmResponse>;
}

/**
 * 스키마에 쓰는 타입 이름.
 *
 * 전에는 `@google/genai` 의 `Type` 열거형을 썼고 값이 대문자(`"OBJECT"`)였다.
 * 표준 JSON Schema 는 소문자다. 값만 바꾸면 스키마 리터럴은 한 줄도 안 고쳐도
 * 된다 — 그래서 이름을 그대로 뒀다.
 */
export const Type = {
  OBJECT: "object",
  STRING: "string",
  ARRAY: "array",
  NUMBER: "number",
  BOOLEAN: "boolean",
  INTEGER: "integer",
} as const;

export type SchemaType = (typeof Type)[keyof typeof Type];
