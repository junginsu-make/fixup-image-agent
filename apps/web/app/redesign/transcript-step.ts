import type { CoverageCut } from "./coverage";
import { runTranscription, splitFilesToStrips } from "./transcribe-client";

/**
 * 원본의 글자를 읽어 오는 단계.
 *
 * ── 왜 화면 밖으로 뺐나 ─────────────────────────────────────
 *
 * 여기에는 **조용히 틀릴 수 있는 규칙**이 둘 있는데 화면 안에 있어서 아무도
 * 돌려 보지 못했다.
 *
 *   ① **끝까지 간 전사만 캐시에 넣는다.** 중단은 예외를 던지지 않고 이미 끝난
 *      배치까지만 이어붙여 **정상으로 돌아온다.** 그것을 성공한 것과 같은
 *      열쇠로 넣어 두면, 설정만 바꿔 다시 만들 때 전사 단계를 건너뛰고
 *      **잘린 텍스트를 영구히 재사용한다** — 새로고침 전까지 몇 번을 눌러도
 *      같은 결과가 나온다.
 *
 *   ② **자른 범위를 위로 올린다.** 조각 40장·PDF 20쪽에서 멈추는데, 그 사실이
 *      여기서 안 나가면 사용자는 앞부분만 읽은 전사로 만든 페이지를 받으면서
 *      그것을 모른다(F-7-0).
 *
 * 둘 다 「그래도 결과는 나오는」 종류라 눈으로는 안 보인다.
 */

export type TranscriptCache = { key: string; transcript: string | null } | null;

export type TranscriptStepInput = {
  files: File[];
  provider: string;
  signal?: AbortSignal;
  /** 지난 번에 끝까지 읽은 것. 열쇠가 같으면 그대로 쓴다. */
  cache: TranscriptCache;
  onNotice?: (message: string) => void;
  onProgress?: (done: number, total: number) => void;
};

export type TranscriptStepResult = {
  transcript: string | null;
  cuts: CoverageCut[];
  /** 새로 저장할 캐시. `null` 이면 저장하지 않는다(끝까지 못 읽었다). */
  nextCache: TranscriptCache;
  /** 캐시를 그대로 썼는가. 썼으면 모델을 한 번도 안 불렀다. */
  fromCache: boolean;
};

/** 같은 자료인지 가르는 열쇠. 이름과 크기가 모두 같아야 한다. */
export function transcriptCacheKey(files: File[]): string {
  return files.map((file) => `${file.name}:${file.size}`).join(",");
}

export async function runTranscriptStep(input: TranscriptStepInput): Promise<TranscriptStepResult> {
  const key = transcriptCacheKey(input.files);
  if (input.cache?.key === key) {
    return { transcript: input.cache.transcript, cuts: [], nextCache: input.cache, fromCache: true };
  }

  const cuts: CoverageCut[] = [];
  let transcript: string | null = null;
  let complete = false;

  try {
    input.onNotice?.("원본 상세페이지를 전사하는 중입니다(작은 글씨까지 확인).");
    const split = await splitFilesToStrips(input.files);
    cuts.push(...split.cuts);

    const result = await runTranscription(split.strips, {
      provider: input.provider,
      signal: input.signal,
      onProgress: input.onProgress,
    });
    transcript = result.transcript;
    complete = result.complete;
    if (result.failedBatches) {
      input.onNotice?.(`일부 구간 전사 실패(${result.failedBatches}). 가능한 범위로 진행합니다.`);
    }
  } catch {
    // 전사는 있으면 좋은 것이다. 못 읽어도 그림 참조만으로 진행한다.
    transcript = null;
  }

  // 못 다 읽은 것은 남기지 않는다. 다음 번에 처음부터 다시 읽는다.
  return { transcript, cuts, nextCache: complete ? { key, transcript } : null, fromCache: false };
}
