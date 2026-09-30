import { describe, expect, it } from "vitest";
import type * as RedesignCore from "@fixup/redesign-core";
import type * as IngestCore from "@fixup/ingest-core";

/**
 * **꾸러미의 비용 콜백은 필수 인자다**(설계 2026-09-30 §3.4·§5 「패키지 콜백이 필수 인자다(타입)」).
 *
 * 선택이면 안 넘긴 자리가 조용히 0원이 된다(`lib/llm/meter.ts` 첫 주석). 이 파일은 **타입 검사로**
 * 그것을 막는다 — 아래 `@ts-expect-error` 가 붙은 줄은 콜백을 빼먹은 호출이다. 누가 콜백을 다시
 * 선택으로 바꾸면 그 줄이 오류가 아니게 되고, `npx tsc --noEmit` 이 「쓸모없는 @ts-expect-error」로
 * 빨개진다.
 *
 * 함수는 **정의만 하고 부르지 않는다** — 업체를 부르면 안 된다. 꾸러미도 타입으로만 들여온다
 * (`ingest-core` 는 불러오기만 해도 jsdom·playwright 를 끌고 온다).
 */

declare const redesign: typeof RedesignCore;
declare const ingest: typeof IngestCore;

const 빠뜨린호출들 = () => [
  // @ts-expect-error onUsage·onImageUsage 가 없다
  redesign.generateSections({ files: [] }),
  // @ts-expect-error onImageUsage 가 없다
  redesign.editSection({ imageUrl: "", request: "" }),
  // @ts-expect-error onUsage 가 없다
  redesign.transcribeStrips({ strips: [], batchIndex: 0, batchCount: 1 }),
  // @ts-expect-error 옵션(onUsage)이 없다
  redesign.retrieveKnowledge("질문", 3),
  // @ts-expect-error onUsage 가 없다
  redesign.indexKnowledgeDocument({ name: "n", text: "t" }),
  // @ts-expect-error onUsage 가 없다
  redesign.indexKnowledge({ name: "n", text: "t" }),
  // @ts-expect-error recordUsage 가 없다
  ingest.createOpenAITopicResearcher({ OPENAI_API_KEY: "k" }),
  // @ts-expect-error onRun 이 없다
  ingest.fetchApifyTranscript("https://youtu.be/x", {}),
];

describe("꾸러미 비용 콜백", () => {
  it("빠뜨린 호출은 타입 검사가 막는다 — 이 시험의 몸은 tsc 다", () => {
    expect(typeof 빠뜨린호출들).toBe("function");
  });
});
