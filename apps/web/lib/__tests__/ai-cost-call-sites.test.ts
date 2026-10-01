import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **공급자를 부르는 파일은 모두 알려진 목록에 있고, 목록의 파일은 비용을 적는다**
 * (설계 2026-09-30 §5 「SDK 를 부르는 파일 목록이 알려진 목록과 같다(새 자리가 생기면 빨개진다)」).
 *
 * ── 무엇을 「공급자를 부른다」로 보나 ──────────────────────────
 *
 * 업체 SDK 를 import 하거나(`@anthropic-ai/sdk`·`openai`·`@google/genai`·`@fal-ai/client`) 업체
 * 주소를 직접 적은 파일(`api.openai.com`·`generativelanguage.googleapis.com`·`fal.run`·`api.apify.com`)
 * 그리고 외부 STT(`YOUTUBE_STT_SERVICE_URL`). `apps/web` 과 `packages/*` 의 시험 아닌 파일만 본다.
 * 수집 워커(`apps/worker`)는 운영에서 멈춰 두었고 설계 §4 가 손대지 않기로 했다.
 *
 * ── 표 ─────────────────────────────────────────────────────
 *
 * 알려진 파일마다 **비용을 적는 표지**(그 파일에 있어야 할 글)를 둔다. 표지가 없는 것은
 * 예외이고, 예외에는 까닭을 적는다.
 */

const root = join(__dirname, "..", "..", "..", "..");

const SDK_IMPORT = /from\s+["'](@anthropic-ai\/sdk|openai|@google\/genai|@google\/generative-ai|@fal-ai\/client|apify-client)["']/;
const PROVIDER_HOST = /https:\/\/(api\.openai\.com|api\.anthropic\.com|generativelanguage\.googleapis\.com|fal\.run|queue\.fal\.run|api\.apify\.com)/;
const STT = /YOUTUBE_STT_SERVICE_URL/;

/** 파일 → 비용을 적는 표지. 이 글이 파일에 없으면 빨개진다. */
const 기록하는파일: Record<string, RegExp> = {
  "apps/web/lib/llm/structured.ts": /recordFrom\(/,
  "apps/web/lib/sns/providers.ts": /recordFrom\(/,
  "apps/web/lib/poster/providers.ts": /recordFrom\(/,
  "apps/web/lib/pdp/providers.ts": /recordFrom\(/,
  "apps/web/lib/layout/analyze-provider.ts": /recordFrom\(/,
  "apps/web/lib/fal/queue.ts": /recordAiCost\(/,
  // 상세페이지·캐릭터·리디자인의 대기열 제출(S3a). 값을 받으면 제출 자리에서 적는다.
  "apps/web/lib/fal/http.ts": /recordAiCost\(/,
  "apps/web/lib/ad/background.ts": /recordAiCost\(/,
  "packages/redesign-core/src/generate.ts": /reportUsage\([\s\S]*reportImageUsage\(|reportImageUsage\([\s\S]*reportUsage\(/,
  "packages/redesign-core/src/edit-section.ts": /reportImageUsage\(/,
  "packages/redesign-core/src/transcribe.ts": /reportUsage\(/,
  "packages/redesign-core/src/rag.ts": /reportUsage\(/,
  "packages/ingest-core/src/adapters/topic.ts": /recordUsage\(/,
  "packages/ingest-core/src/adapters/youtube-apify.ts": /onRun\(/,
};

/** 공급자 모듈을 import 하지만 비용을 여기서 안 적는 파일. 까닭이 곧 확인할 곳이다. */
const 예외: Record<string, string> = {
  "apps/web/lib/cs/provider.ts": "클라이언트만 만든다 — 호출은 `llm/structured.ts` 가 하고 거기서 적는다",
  "apps/web/lib/easy/chat-provider.ts": "클라이언트만 만든다 — 호출은 `llm/structured.ts` 가 하고 거기서 적는다",
  "apps/web/lib/fal/upload.ts": "참고 그림을 fal 저장소에 올린다 — 모델 호출이 아니라 값이 없다",
  "packages/ingest-core/src/adapters/youtube-worker.ts": "외부 STT — 설계 §3.4: 운영에 설정돼 있지 않으면 제외(배포 확인 항목)",
};

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        if (name === "__tests__") continue;
        walk(full);
      } else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.(ts|tsx|mjs)$/.test(name)) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

const 부르는파일 = [join(root, "apps", "web"), join(root, "packages")]
  .flatMap(sourceFiles)
  .filter((file) => {
    const source = readFileSync(file, "utf8");
    return SDK_IMPORT.test(source) || PROVIDER_HOST.test(source) || STT.test(source);
  })
  .map((file) => relative(root, file).replace(/\\/g, "/"))
  .sort();

describe("공급자를 부르는 파일", () => {
  it("**셀 파일이 있다** — 못 찾으면 아래 검사가 전부 조용히 통과한다", () => {
    expect(부르는파일.length).toBeGreaterThanOrEqual(15);
  });

  it("**알려진 목록과 같다** — 새 자리가 생기면 여기가 빨개진다", () => {
    expect(부르는파일).toEqual([...Object.keys(기록하는파일), ...Object.keys(예외)].sort());
  });

  it.each(Object.entries(기록하는파일))("%s 는 비용을 적는다", (file, 표지) => {
    expect(readFileSync(join(root, file), "utf8")).toMatch(표지);
  });

  it("글 모델 한 줄은 계량기 한 곳에서 쓴다 — 모듈마다 따로 감싸지 않는다", () => {
    const meter = readFileSync(join(root, "apps/web/lib/llm/meter.ts"), "utf8");
    expect(meter).toMatch(/export function recordLlmUsage[\s\S]{0,400}recordAiCost\(/);
  });
});
