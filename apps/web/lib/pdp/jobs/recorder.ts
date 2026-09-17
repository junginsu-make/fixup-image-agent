import { isLocalStoreEnabled } from "../../local-store";
import { createSupabaseAdminClient } from "../../supabase/admin";
import { jobArtifactPath } from "./artifacts";
import { createPdpJobRepository } from "./index";
import type { CreateJobInput, PdpJobRepository } from "./repository";

/**
 * 생성하는 동안 「무엇이 어디까지 됐는지」를 적는다.
 *
 * ── 이 코드가 지켜야 하는 것 ───────────────────────────────────
 *
 * 붙는 자리가 **돈이 오가는 생성 경로**다. 여기서 던지면 사용자는 이미 값을
 * 치른 그림을 못 받는다 — 원래 고치려던 것과 똑같은 손실이 된다.
 *
 * 그래서 규칙이 둘이다.
 *   1. 스위치가 꺼져 있으면 **아무것도 하지 않는다.** 저장소를 만들지도 않는다
 *   2. **어떤 실패도 밖으로 던지지 않는다.** 기록이 안 돼도 그림은 나간다
 *
 * 2번 때문에 「조용히 사라지는」 실패가 생기지 않도록, 못 적은 것은 **상태에
 * 남긴다**(`persistence: retry_required`). 나중에 그것만 골라 다시 시도할 수 있다.
 */

const BUCKET = "library";

export interface SectionResult {
  sectionId: string;
  attempt: number;
  imageBase64: string;
  mimeType: string;
  model?: string;
  providerRequestId?: string;
  costUsd?: number;
}

export interface JobRecorder {
  /** 만들어진 작업의 id. 꺼져 있거나 못 만들었으면 `null`. */
  readonly jobId: string | null;
  /** 공급자에게 보내기 직전. */
  started(): Promise<void>;
  /** 섹션 한 장이 나왔을 때. 그림을 저장소에 옮기고 경로를 적는다. */
  sectionDone(result: SectionResult): Promise<void>;
  /** 다 끝났을 때. 성공 수와 정산 결과로 마무리한다. */
  finished(outcome: { succeeded: number; requested: number; settled: boolean }): Promise<void>;
}

/** 그림 한 장을 저장소에 올린다. 로컬에서는 올리지 않는다(경로만 적는다). */
async function putToStorage(path: string, bytes: Buffer, mimeType: string): Promise<void> {
  if (isLocalStoreEnabled()) return;
  const { error } = await createSupabaseAdminClient()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType: mimeType, upsert: true });
  if (error) throw new Error(error.message);
}

export interface JobRecorderOptions {
  enabled: boolean;
  input: CreateJobInput;
  /** 저장소를 만드는 법. 시험이 갈아 끼운다. */
  repository?: () => PdpJobRepository;
  /** 그림을 올리는 법. 시험이 갈아 끼운다. */
  putObject?: (path: string, bytes: Buffer, mimeType: string) => Promise<void>;
}

/** 꺼져 있을 때 쓰는 빈 기록기. 부르는 쪽이 분기하지 않게 모양을 맞춘다. */
const NOOP: JobRecorder = {
  jobId: null,
  async started() {},
  async sectionDone() {},
  async finished() {},
};

export async function createJobRecorder(options: JobRecorderOptions): Promise<JobRecorder> {
  if (!options.enabled) return NOOP;

  const makeRepository = options.repository ?? (() => createPdpJobRepository());
  const put = options.putObject ?? putToStorage;

  let repo: PdpJobRepository;
  let jobId: string | null = null;
  try {
    repo = makeRepository();
    const created = await repo.createOrGet(options.input);
    // 충돌이면 적을 자리가 없다. 생성 자체는 막지 않는다 — 판단은 라우트가 한다.
    jobId = created.kind === "conflict" ? null : created.jobId;
  } catch (error) {
    // 저장소를 못 만들었다. 기록은 포기하되 **그림은 그대로 나간다.**
    console.warn("[pdp-jobs] 작업 기록을 시작하지 못했습니다", error);
    return NOOP;
  }
  if (!jobId) return NOOP;

  const userId = options.input.userId;
  const id = jobId;

  /** 어떤 실패도 밖으로 내보내지 않는다. 남길 수 있으면 상태에 남긴다. */
  async function quietly(what: string, run: () => Promise<void>): Promise<void> {
    try {
      await run();
    } catch (error) {
      console.warn(`[pdp-jobs] ${what} 실패 (job=${id})`, error);
    }
  }

  return {
    jobId: id,

    async started() {
      await quietly("시작 기록", async () => {
        await repo.advance(id, userId, { type: "reserved" });
        await repo.advance(id, userId, { type: "submitting" });
        await repo.advance(id, userId, { type: "submitted" });
      });
    },

    async sectionDone(result) {
      const path = jobArtifactPath({
        userId,
        jobId: id,
        sectionId: result.sectionId,
        attempt: result.attempt,
        mimeType: result.mimeType,
      });

      /*
        **한 번만 올리고 성공 여부를 붙든다.**
        `quietly` 로 감싸면 삼켜져서 실패를 알 수 없고, 그대로 두면 「경로는
        적혔는데 그 자리에 파일이 없는」 상태가 된다 — 되찾을 때가 되어서야
        드러난다. 그래서 여기서만 직접 잡는다.
      */
      let stored = true;
      try {
        await put(path, Buffer.from(result.imageBase64, "base64"), result.mimeType);
      } catch (error) {
        stored = false;
        console.warn(`[pdp-jobs] 그림 저장 실패 (job=${id}, section=${result.sectionId})`, error);
      }

      await quietly("결과 기록", async () => {
        await repo.recordItem(id, {
          sectionId: result.sectionId,
          attempt: result.attempt,
          model: result.model,
          providerRequestId: result.providerRequestId,
          costUsd: result.costUsd,
          // 못 올렸으면 경로를 적지 않는다. 없는 자리를 가리키면 안 된다.
          outputPath: stored ? path : undefined,
          errorCode: stored ? undefined : "artifact_upload_failed",
        });
        if (!stored) await repo.advance(id, userId, { type: "persist_failed" });
      });
    },

    async finished(outcome) {
      await quietly("마무리 기록", async () => {
        await repo.advance(id, userId, { type: "result_available" });
        if (outcome.succeeded < outcome.requested) {
          await repo.advance(id, userId, { type: "partial" });
        } else {
          await repo.advance(id, userId, { type: "persisted" });
          await repo.advance(id, userId, { type: "reviewed", passed: true });
        }
        await repo.advance(id, userId, {
          type: outcome.settled ? "settled" : "settlement_failed",
        });
      });
    },
  };
}
