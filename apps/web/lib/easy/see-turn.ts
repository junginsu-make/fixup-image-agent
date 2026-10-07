import { easySeePrompt, seeLabel, seeTargets, type EasySeeTarget } from "../../app/easy/see-prompt";
import { plainAiText, visibleBody } from "../../app/easy/row-marks";
import type { EasyMessage } from "../../app/easy/turn";
import { isLocalStoreEnabled } from "../local-store";
import type { StructuredImage } from "../llm/structured";
import { posterImageBytes, referenceBytes } from "../poster/asset-bytes";
import { signPath } from "../storage/signing";
import type { EasyImageFacts, EasyPicture } from "./image-list";

/**
 * **이미지를 보고 답한다 — 묻거나 볼 때만**(2026-10-07 2차 설계 D5 · §3-5).
 *
 * 판단 모델이 볼 것(`see`)을 적은 talk 턴에만 라우트가 부른다. 그 이미지 · 붙인 사진을 넣어 두 번째
 * 호출로 reply 를 다시 쓴다. 값은 회원 크레딧이 아니라 회사 원가다(판정 예약 안, 0크레딧).
 *
 * 그림은 운영에서 서버가 서명한 주소(5분), 로컬에서 `lib/poster/asset-bytes.ts` 로 읽은 base64 로 넘긴다 —
 * 로컬 저장소 주소는 바깥에서 못 받는다. 바이트 읽기를 따로 짜지 않는다(2차 최종 리뷰 e). 그 파일은 경로를
 * 안 거르므로 넘기는 경로의 출처를 적어 둔다: 결과 그림은 본인 포스터 저장소의 그림 행(`image-list.ts` —
 * `posterStoresForUser`), 붙인 사진은 ⓪ 확인(`posterReferencesByIds`)이 걸러 준 행의 `storagePath` 다.
 * 사용자가 보낸 주소 · 경로는 여기 닿지 않는다. 결과 그림은 사본(작다)이 있으면 그것 — 이미지 토큰이 준다.
 *
 * **던지지 않는다.** 볼 것이 없으면 `none`(판단 모델의 답 그대로), 고른 것을 하나도 못 찾았거나 못 읽었거나
 * 호출이 실패했거나 빈 답이면 `failed`(라우트가 「지금은 이미지를 볼 수 없었습니다…」로 바꾼다, 2차 최종
 * 리뷰 10). 보지 못한 채 지어낸 답을 남기지 않는다. 대화는 멈추지 않는다.
 */
interface SeeInput {
  userId: string;
  rows: ReadonlyArray<Pick<EasyMessage, "role" | "body">>;
  prompt: string;
  see: readonly string[];
  facts: EasyImageFacts;
  /** 지금 붙은 사진(⓪ 확인을 마친 것). 붙인 순서다 — 「p1」이 첫 장. */
  photos: ReadonlyArray<{ id: string; url?: string | null; storagePath: string }>;
  write: (prompt: string, images: readonly StructuredImage[]) => Promise<unknown>;
}

export type EasySeen = { kind: "seen"; reply: string } | { kind: "none" } | { kind: "failed" };

const 서명시간 = 300;
const 지난말수 = 6;
const 지난말길이 = 200;

async function 결과그림(picture: EasyPicture): Promise<StructuredImage> {
  const 경로 = picture.thumbPath || picture.assetPath;
  if (!isLocalStoreEnabled()) return { url: await signPath("library", 경로, 서명시간) };
  const { bytes, contentType } = await posterImageBytes(경로);
  return { mediaType: contentType, data: bytes.toString("base64") };
}

async function 붙인사진(photo: SeeInput["photos"][number]): Promise<StructuredImage> {
  if (!isLocalStoreEnabled() && photo.url) return { url: photo.url };
  const { bytes, contentType } = await referenceBytes(photo.storagePath);
  return { mediaType: contentType, data: bytes.toString("base64") };
}

async function 보낼그림(input: SeeInput, target: EasySeeTarget): Promise<StructuredImage | undefined> {
  if (target.kind === "photo") {
    const photo = input.photos[target.index - 1];
    return photo ? 붙인사진(photo) : undefined;
  }
  const picture = input.facts.pictures.get(target.n);
  return picture ? 결과그림(picture) : undefined;
}

export async function rewriteReplyBySeeing(input: SeeInput): Promise<EasySeen> {
  const targets = seeTargets(input.see, input.facts.entries, input.photos.length);
  if (!targets.length) return { kind: "none" };
  try {
    const 그림들 = await Promise.all(targets.map(async (target) => ({ target, image: await 보낼그림(input, target) })));
    const 보낼것 = 그림들.flatMap((one) => (one.image ? [{ label: seeLabel(one.target), image: one.image }] : []));
    // 보려고 고른 것을 하나도 못 찾았다 — 부르지 않는다(보지 못한 채 답을 지어내지 않게).
    if (!보낼것.length) return { kind: "failed" };
    // 지난 대화는 표시(물음 · 머리말 · 안내)를 뗀 보일 글만 싣는다.
    const history = input.rows
      .filter((row) => row.role === "user" || row.role === "assistant")
      .slice(-지난말수)
      .map((row) => `${row.role === "user" ? "사용자" : "도우미"}: ${visibleBody(row).slice(0, 지난말길이)}`);
    const raw = await input.write(
      easySeePrompt({ history, prompt: input.prompt, labels: 보낼것.map((one) => one.label) }),
      보낼것.map((one) => one.image),
    );
    const reply = (raw as { reply?: unknown } | null)?.reply;
    // 보고 다시 쓴 답도 AI 글이다 — 표시 머리를 푼다(2차 최종 리뷰 c).
    return typeof reply === "string" && reply.trim() ? { kind: "seen", reply: plainAiText(reply.trim()) } : { kind: "failed" };
  } catch (error) {
    console.warn("[easy] 이미지를 보고 답하지 못했습니다", error instanceof Error ? error.message : error);
    return { kind: "failed" };
  }
}
