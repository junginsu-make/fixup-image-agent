import { randomUUID, createHash } from "node:crypto";
import { generationFence } from "./generation/fence-context";
import { haltRecordedCalls } from "./llm/recorded-call";
import { rememberGenerationInput } from "./generation/prepared-input";
import { imageCreditUnits } from "./credit-cost";
import {
  CHARACTER_ANGLES,
  CHARACTER_SHEET,
  CHARACTER_SHEET_ASPECT,
  buildCandidatePrompt,
  buildTurnaroundPrompt,
  buildTurnaroundSheetPrompt,
  selectCharacterModel,
  type AspectRatio,
  type CharacterAngle,
  type CharacterAngleInfo,
  type CharacterKind,
  type CharacterLook,
  type CharacterReferenceRole,
  type CharacterViewId,
  DEFAULT_EXTRA_ANGLES,
  migrateAngle,
  type ImageModelId,
  type ReferenceImage,
} from "@fixup/pdp-core";
import { createPdpImageGenerator } from "./pdp/fal";

/**
 * 그림 통로. **부를 때 만든다.**
 *
 * 모듈이 실릴 때 만들면 FAL_KEY 가 없는 환경에서 캐릭터와 무관한 화면까지
 * 함께 죽는다. `pdp-core` 가 순수해지면서 통로를 여기서 들게 됐다.
 */
const falImage: ReturnType<typeof createPdpImageGenerator> = (model, input) =>
  createPdpImageGenerator()(model, input);
import { createSupabaseAdminClient } from "./supabase/admin";
import { scopedRead } from "./teams/scope";
import { characterReferenceEntries, characterReferenceTitle } from "./character-library";
import { saveReferenceImage, removeReferenceImagesByTitle } from "./reference-images";
import { isLocalStoreEnabled } from "./local-store";
import {
  deleteLocalCharacter,
  findLocalCharacter,
  insertLocalCharacter,
  listLocalCharacters,
  listLocalCharacterViews,
  readLocalCharacterFile,
  removeLocalCharacterFiles,
  replaceLocalCharacterViews,
  upsertLocalCharacterView,
  writeLocalCharacterFile,
} from "./characters-store";
import { gridPathsToRemove, gridThumbPath } from "./grid-thumbnail-path";
import { makeGridThumbnail } from "./grid-thumbnail";

/**
 * 캐릭터.
 *
 * 흐름은 세 단계다.
 *   1) 묘사(+ 참고 그림)로 후보 2장을 만든다
 *   2) 사용자가 하나를 고른다
 *   3) 그 후보를 참조로 나머지 각도를 만들어 고정한다
 *
 * 사람만 다루던 기능이었다. 지금은 **종류(사람·동물·캐릭터·사물)와
 * 결(실사·애니·3D·그림)** 을 따로 고른다. 프롬프트가 갈리는 자리는 전부
 * `@fixup/pdp-core` 의 순수 함수에 있다 — 여기는 저장과 호출만 한다.
 *
 * 로컬과 운영이 같게 돌아야 한다. 전에는 Supabase 를 바로 불러서 로컬
 * 개발에서는 캐릭터를 아예 만들 수 없었다.
 */

const BUCKET = "characters";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * 화면과 라이브러리에 보일 순서 — 앞·좌·우·뒤.
 *
 * DB 는 순서를 보장하지 않는다. 정렬하지 않으면 목록 표지와 라이브러리 첫 장이
 * 뒷모습으로 잡히는 일이 생긴다. 첫 이미지는 반드시 정면이어야 한다.
 */
const ANGLE_ORDER = new Map<string, number>(
  // 다각도 한 장은 각도가 아니라 일곱 번째 항목이다. 맨 뒤에 둔다.
  [...CHARACTER_ANGLES.map((angle: CharacterAngleInfo) => angle.id as string), CHARACTER_SHEET.id]
    .map((id: string, index: number) => [id, index]),
);

function byAngleOrder(a: { angle: string }, b: { angle: string }) {
  return (ANGLE_ORDER.get(migrateAngle(a.angle)) ?? 99) - (ANGLE_ORDER.get(migrateAngle(b.angle)) ?? 99);
}

/**
 * 후보 수 — 사용자가 고른다. 늘리면 그만큼 크레딧이 든다.
 *
 * **기본이 하나다**(2026-09-11 사용자 결정). 전에는 둘이었는데, 처음에는
 * 정면 하나만 보면 되는 사람이 매번 두 장 값을 내고 시작했다. 마음에 안 들면
 * 「다른 후보 보기」가 있고, 그때는 고르는 것이 실제로 필요해서 누른 것이다.
 */
export const MIN_CANDIDATES = 1;
export const MAX_CANDIDATES = 3;
export const DEFAULT_CANDIDATES = 1;

/** @deprecated 후보 수는 이제 고를 수 있다. 옛 화면이 읽던 값만 남긴다. */
export const CANDIDATE_COUNT = DEFAULT_CANDIDATES;

function clampCandidates(count: number | undefined): number {
  if (!Number.isFinite(count)) return DEFAULT_CANDIDATES;
  return Math.min(MAX_CANDIDATES, Math.max(MIN_CANDIDATES, Math.trunc(count as number)));
}

export interface CharacterView {
  angle: CharacterViewId;
  url: string | null;
  /** 목록 격자에 거는 사본. 없으면 화면이 `url` 로 떨어진다. */
  thumbUrl?: string | null;
}

export interface CharacterSummary {
  id: string;
  name: string;
  sourcePrompt: string;
  identityPrompt: string;
  kind: CharacterKind;
  look: CharacterLook;
  createdAt: string;
  views: CharacterView[];
}

/** 후보를 만들 때 함께 보내는 그림 한 장. 없어도 된다. */
export interface CharacterReferenceInput {
  role: CharacterReferenceRole;
  base64: string;
  mimeType: string;
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/**
 * 첨부한 그림을 fal 이 아는 말로 옮긴다.
 *
 * `extract` 는 정체성 경로(`person`)로 보낸다 — 그 캐릭터를 그대로 살려야 한다.
 * `style` 은 결만 가져오므로 `style` 경로다. 프롬프트에서도 한 번 더 못 박는다
 * (`buildCandidatePrompt` 의 referenceRole).
 */
function toFalReference(reference: CharacterReferenceInput): ReferenceImage {
  return {
    kind: reference.role === "extract" ? "person" : "style",
    base64: reference.base64,
    mimeType: reference.mimeType,
  };
}

/**
 * 후보를 만든다. 아직 저장하지 않는다 — 고르기 전이라 버려질 수 있다.
 *
 * 두 장을 동시에 만든다. 순차로 하면 두 배 기다린다.
 */
export async function generateCandidates(input: {
  description: string;
  aspectRatio: AspectRatio;
  kind: CharacterKind;
  look: CharacterLook;
  modelId?: ImageModelId;
  reference?: CharacterReferenceInput;
  /** 1~3. 안 주면 2장. */
  candidates?: number;
}) {
  const count = clampCandidates(input.candidates);
  const model = input.modelId ?? selectCharacterModel(input.look);
  const prompt = buildCandidatePrompt({
    description: input.description,
    aspectRatio: input.aspectRatio,
    kind: input.kind,
    look: input.look,
    referenceRole: input.reference?.role,
  });
  const references = input.reference ? [toFalReference(input.reference)] : [];

  const settled = await Promise.allSettled(
    Array.from({ length: count }, () =>
      falImage(model, {
        prompt,
        systemPrompt: "You are a character designer. Produce one clean character reference.",
        aspectRatio: input.aspectRatio,
        references,
      }),
    ),
  );

  const candidates = settled
    .filter(
      (entry): entry is PromiseFulfilledResult<{ base64: string; mimeType: string }> =>
        entry.status === "fulfilled",
    )
    .map((entry) => entry.value);

  return { model, candidates, requested: count };
}

interface ViewBytes {
  /** 저장되는 이름. 진짜 각도 여섯 + 다각도 한 장. */
  angle: CharacterViewId;
  base64: string;
  mimeType: string;
}

/** 정면을 참조로 각도 한 장을 만든다. 참조 없이 만들면 다른 인물이 된다. */
async function generateAngle(input: {
  angle: CharacterAngle;
  identityPrompt: string;
  aspectRatio: AspectRatio;
  kind: CharacterKind;
  look: CharacterLook;
  model: ImageModelId;
  frontBase64: string;
  frontMimeType: string;
}): Promise<ViewBytes> {
  const image = await falImage(input.model, {
    prompt: buildTurnaroundPrompt({
      identityPrompt: input.identityPrompt,
      angle: input.angle,
      kind: input.kind,
      look: input.look,
    }),
    systemPrompt: "",
    aspectRatio: input.aspectRatio,
    references: [
      { kind: "person", base64: input.frontBase64, mimeType: input.frontMimeType },
    ],
  });
  return { angle: input.angle, base64: image.base64, mimeType: image.mimeType };
}

/**
 * 여섯 각도를 한 장에 담는다. 정면을 참조로 넣는 것은 낱장과 같다.
 *
 * **비율이 다르다.** 3:4 짜리 칸을 3×2 로 놓으면 전체가 9:8 이라, 세로 비율로
 * 보내면 칸이 짓눌려 얼굴이 안 남는다. 화면이 무엇을 고르든 여기서 가로로
 * 바꿔 보낸다.
 */
async function generateSheet(input: {
  identityPrompt: string;
  kind: CharacterKind;
  look: CharacterLook;
  model: ImageModelId;
  frontBase64: string;
  frontMimeType: string;
}): Promise<ViewBytes> {
  const image = await falImage(input.model, {
    prompt: buildTurnaroundSheetPrompt({
      identityPrompt: input.identityPrompt,
      kind: input.kind,
      look: input.look,
    }),
    systemPrompt: "",
    aspectRatio: CHARACTER_SHEET_ASPECT,
    references: [
      { kind: "person", base64: input.frontBase64, mimeType: input.frontMimeType },
    ],
  });
  return { angle: CHARACTER_SHEET.id, base64: image.base64, mimeType: image.mimeType };
}

function storagePathFor(userId: string, characterId: string, view: ViewBytes) {
  const run = generationFence();
  const tail = `${characterId}/${run ? `${run.id}/` : ""}${view.angle}.${extensionFor(view.mimeType)}`;
  // 운영 버킷은 경로 첫 칸으로 소유자를 판정한다. 로컬은 사용자 폴더 안에 있다.
  return isLocalStoreEnabled() ? tail : `${userId}/${tail}`;
}

async function putView(storagePath: string, view: ViewBytes) {
  const bytes = Buffer.from(view.base64, "base64");
  if (isLocalStoreEnabled()) {
    await writeLocalCharacterFile(storagePath, bytes);
    return null;
  }
  const storage = createSupabaseAdminClient().storage.from(BUCKET);
  const { error } = await storage.upload(storagePath, bytes, { contentType: view.mimeType, upsert: true });
  if (error) throw new Error(error.message);

  /**
   * 목록에 걸 사본.
   *
   * 한 사람에 각도가 셋이라 사람 수만큼 곱해진다.
   *
   * **원본은 그대로 둔다.** 각도 그림은 다각도 생성과 섹션 생성의 바탕이라
   * 사본을 물리면 결과물 품질이 조용히 깎인다.
   *
   * 못 만들거나 못 올려도 저장을 막지 않는다 — 없으면 화면이 원본으로 떨어진다.
   */
  const thumbnail = await makeGridThumbnail(bytes);
  if (!thumbnail) return null;

  const thumbPath = gridThumbPath(storagePath);
  const thumbResult = await storage.upload(thumbPath, thumbnail, {
    contentType: "image/webp", upsert: true,
  });
  if (thumbResult.error) {
    console.error(`[character] 사본을 올리지 못했습니다: ${thumbResult.error.message}`);
    return null;
  }
  return thumbPath;
}

/**
 * 고른 후보를 기준으로 다각도를 만들고 캐릭터로 저장한다.
 *
 * 각도 하나가 실패해도 **캐릭터는 저장한다.** 전에도 그랬고 지금도 그렇다 —
 * 운영에 있는 캐릭터 하나가 실제로 3장뿐이다. 빠진 각도는 나중에
 * `regenerateAngle` 로 채운다.
 */
export async function createCharacter(input: {
  executionId?: string;
  onStoredViews?: (views: readonly ViewBytes[]) => void;
  userId: string;
  name: string;
  description: string;
  aspectRatio: AspectRatio;
  kind: CharacterKind;
  look: CharacterLook;
  modelId?: ImageModelId;
  chosenBase64: string;
  chosenMimeType: string;
  /**
   * 정면 말고 더 만들 각도. 안 주면 예전 기본값 셋이다.
   *
   * 정면은 여기 없어도 늘 들어간다 — 고른 후보 그 자체이고 나머지의 기준이다.
   * 하나도 안 고르면 정면 한 장짜리 캐릭터가 된다. 그것도 쓸모가 있다.
   */
  angles?: CharacterAngle[];
  /**
   * 여섯 각도를 한 그림에 담은 한 장을 같이 만들까.
   *
   * 각도와 **더하기**다. 낱장 없이 이것만 고를 수도 있다 — 한눈에 보려는
   * 쓰임에는 그편이 싸다.
   */
  sheet?: boolean;
}) {
  const extraAngles = (input.angles ?? DEFAULT_EXTRA_ANGLES).filter((angle) => angle !== "front");
  const wantsSheet = Boolean(input.sheet);
  const model = input.modelId ?? selectCharacterModel(input.look);
  const characterId = input.executionId ?? randomUUID();
  const name = input.name.slice(0, 80);
  const createdAt = new Date().toISOString();

  const existing = input.executionId ? await findCharacter(input.userId, characterId) : null;
  if (!existing) {
  if (isLocalStoreEnabled()) {
    await insertLocalCharacter({
      id: characterId,
      userId: input.userId,
      name,
      sourcePrompt: input.description,
      identityPrompt: input.description,
      kind: input.kind,
      look: input.look,
      createdAt,
    });
  } else {
    const { error } = await createSupabaseAdminClient()
      .from("characters")
      .insert({
        id: characterId,
        user_id: input.userId,
        name,
        source_prompt: input.description,
        identity_prompt: input.description,
        // 옛 칸이다. 결이 실사인지만 담는다 — 종류·결 전체는 kind/look 칸에 있다.
        visual_style: input.look === "photoreal" ? "photoreal" : "illustration",
        kind: input.kind,
        look: input.look,
      });
    if (error) return { ok: false as const, message: error.message };
  }
  }

  const uploaded: string[] = [];

  try {
    // 고른 후보를 정면으로 그대로 쓴다. 다시 만들면 얼굴이 달라진다.
    const front: ViewBytes = {
      angle: "front",
      base64: input.chosenBase64,
      mimeType: input.chosenMimeType,
    };

    // 다각도 한 장도 같은 그물에 넣는다. 하나가 실패해도 나머지는 저장된다.
    const others = await Promise.allSettled([
      ...extraAngles.map((angle) =>
        generateAngle({
          angle,
          identityPrompt: input.description,
          aspectRatio: input.aspectRatio,
          kind: input.kind,
          look: input.look,
          model,
          frontBase64: input.chosenBase64,
          frontMimeType: input.chosenMimeType,
        }),
      ),
      ...(wantsSheet
        ? [generateSheet({
            identityPrompt: input.description,
            kind: input.kind,
            look: input.look,
            model,
            frontBase64: input.chosenBase64,
            frontMimeType: input.chosenMimeType,
          })]
        : []),
    ]);

    // 정면을 맨 앞에 두고 나머지를 정해진 순서로 붙인다. Promise 완료 순서에
    // 맡기면 라이브러리 첫 장이 뒷모습이 되는 일이 생긴다.
    const views: ViewBytes[] = [
      front,
      ...others
        .filter((entry): entry is PromiseFulfilledResult<ViewBytes> => entry.status === "fulfilled")
        .map((entry) => entry.value)
        .sort(byAngleOrder),
    ];

    const rows = [];
    for (const view of views) {
      const storagePath = storagePathFor(input.userId, characterId, view);
      const thumbPath = await putView(storagePath, view);
      uploaded.push(storagePath);
      // 되돌릴 목록에 사본도 넣는다. 빠뜨리면 저장이 엎어졌을 때 아무도 못
      // 찾는 파일이 남는다.
      if (thumbPath) uploaded.push(thumbPath);
      rows.push({
        characterId,
        userId: input.userId,
        angle: view.angle,
        path: storagePath,
        thumbPath,
        mimeType: view.mimeType,
      });
    }

    if (isLocalStoreEnabled()) {
      await replaceLocalCharacterViews(characterId, rows);
    } else {
      const { error } = await createSupabaseAdminClient().from("character_views").upsert(
        rows.map((row) => ({
          character_id: row.characterId,
          user_id: row.userId,
          angle: row.angle,
          path: row.path,
          thumb_path: row.thumbPath,
          mime_type: row.mimeType,
        })),
        { onConflict: "character_id,angle" },
      );
      if (error) throw new Error(error.message);
    }

    // 참고 이미지 창고에 각도를 다 넣는다. 여기 들어가야 카드뉴스·이미지
    // 만들기·상세페이지가 전부 쓴다. 정면 한 장만 넣으면 옆모습이 필요한
    // 장면에서 다시 만들게 되고, 그러면 같은 인물로 안 보인다.
    const referenceIssue = await saveAsReferences(input.userId, name, views);
    input.onStoredViews?.(views);

    return {
      ok: true as const,
      id: characterId,
      angleCount: rows.length,
      // 정면 + 고른 각도 + 다각도 중 실제로 저장된 것을 뺀 수.
      missingAngles: 1 + extraAngles.length + (wantsSheet ? 1 : 0) - rows.length,
      referenceIssue,
    };
  } catch (caught) {
    // A stale worker must not remove files another lease has already published.
    if (input.executionId) throw haltRecordedCalls("storage_unavailable");
    // 되돌린다. 파일부터 지우고 행을 지운다 — 순서가 반대면 경로를 잃는다.
    await removeStored(uploaded);
    await removeCharacterRow(input.userId, characterId);
    return {
      ok: false as const,
      message: caught instanceof Error ? caught.message : "캐릭터를 만들지 못했습니다.",
    };
  }
}

/**
 * 각도 한 장만 다시 만든다.
 *
 * 지금은 후보가 마음에 안 들면 처음부터 다시 해야 했고, 빠진 각도를 채울
 * 방법이 아예 없었다. 정면을 참조로 넣어 같은 인물을 유지한다.
 */
export async function regenerateAngle(input: {
  onStoredViews?: (views: readonly ViewBytes[]) => void;
  userId: string;
  characterId: string;
  /** 진짜 각도 다섯(정면 제외) 또는 다각도 한 장. */
  angle: CharacterViewId;
  aspectRatio?: AspectRatio;
  modelId?: ImageModelId;
}) {
  if (input.angle === "front") {
    // 정면은 고른 후보 그 자체다. 다시 만들면 다른 인물이 되고, 그러면 나머지
    // 세 각도가 전부 남남이 된다.
    return { ok: false as const, message: "정면은 다시 만들 수 없습니다. 새 캐릭터로 만드세요." };
  }

  const source = await rememberGenerationInput("character-view", async () => {
    const character = await findCharacter(input.userId, input.characterId);
    const front = character ? await loadViewBytes(input.userId, input.characterId, "front") : null;
    return { character, front };
  });
  const character = source.character;
  if (!character) return { ok: false as const, message: "캐릭터를 찾지 못했습니다." };

  const front = source.front;
  if (!front) return { ok: false as const, message: "정면 그림이 없어 다시 만들 수 없습니다." };

  const look = character.look;
  const model = input.modelId ?? selectCharacterModel(look);

  try {
    // 다각도 한 장은 각도가 아니다. 프롬프트도 비율도 다른 길로 간다.
    const view = input.angle === CHARACTER_SHEET.id
      ? await generateSheet({
          identityPrompt: character.identityPrompt,
          kind: character.kind,
          look,
          model,
          frontBase64: front.base64,
          frontMimeType: front.mimeType,
        })
      : await generateAngle({
          angle: input.angle,
          identityPrompt: character.identityPrompt,
          aspectRatio: input.aspectRatio ?? "3:4",
          kind: character.kind,
          look,
          model,
          frontBase64: front.base64,
          frontMimeType: front.mimeType,
        });

    const storagePath = storagePathFor(input.userId, input.characterId, view);
    const thumbPath = await putView(storagePath, view);

    const row = {
      characterId: input.characterId,
      userId: input.userId,
      angle: view.angle,
      path: storagePath,
      thumbPath,
      mimeType: view.mimeType,
    };

    if (isLocalStoreEnabled()) {
      await upsertLocalCharacterView(row);
    } else {
      const { error } = await createSupabaseAdminClient()
        .from("character_views")
        .upsert(
          {
            character_id: row.characterId,
            user_id: row.userId,
            angle: row.angle,
            path: row.path,
            thumb_path: row.thumbPath,
            mime_type: row.mimeType,
          },
          { onConflict: "character_id,angle" },
        );
      if (error) throw new Error(error.message);
    }

    // 라이브러리의 그 각도도 갈아 끼운다. 안 하면 새로 만든 것과 라이브러리에
    // 있는 것이 달라진다.
    await removeReferenceImagesByTitle(
      input.userId,
      characterReferenceTitle(character.name, view.angle),
    );
    await saveAsReferences(input.userId, character.name, [view]);
    input.onStoredViews?.([view]);

    return { ok: true as const, angle: view.angle, model };
  } catch (caught) {
    if (generationFence() && !(caught && typeof caught === "object" && "providerStatus" in caught)) throw haltRecordedCalls("storage_unavailable");
    return {
      ok: false as const,
      message: caught instanceof Error ? caught.message : "다시 만들지 못했습니다.",
    };
  }
}

/**
 * 각도를 참고 이미지 창고에 넣는다.
 *
 * 실패해도 캐릭터는 살린다 — 곁다리다. 다만 **조용히 넘어가지 않는다.**
 * 전에는 console.warn 만 남겨서, 라이브러리에 없는 것을 사용자가 알 수 없었다.
 */
async function saveAsReferences(
  userId: string,
  name: string,
  views: ViewBytes[],
): Promise<string | undefined> {
  try {
    for (const entry of characterReferenceEntries(name, views)) {
      const run = generationFence();
      const digest = run ? createHash("sha256").update(`${run.id}:${entry.angle}`).digest("hex") : undefined;
      const id = digest ? `${digest.slice(0,8)}-${digest.slice(8,12)}-5${digest.slice(13,16)}-8${digest.slice(17,20)}-${digest.slice(20,32)}` : randomUUID();
      await saveReferenceImage({
        userId,
        id,
        title: entry.title,
        // 용도로 거르지 않는다. 어느 도구에서든 정체성을 지킬 때 쓴다.
        purpose: "both",
        bytes: Buffer.from(entry.base64, "base64"),
        mimeType: entry.mimeType,
      });
    }
    return undefined;
  } catch (error) {
    return error instanceof Error
      ? `라이브러리에 넣지 못했습니다: ${error.message}`
      : "라이브러리에 넣지 못했습니다.";
  }
}

async function removeStored(paths: string[]) {
  if (!paths.length) return;
  if (isLocalStoreEnabled()) {
    await removeLocalCharacterFiles(paths);
    return;
  }
  await createSupabaseAdminClient().storage.from(BUCKET).remove(paths);
}

async function removeCharacterRow(userId: string, characterId: string) {
  if (isLocalStoreEnabled()) {
    await deleteLocalCharacter(userId, characterId);
    return;
  }
  await createSupabaseAdminClient()
    .from("characters")
    .delete()
    .eq("user_id", userId)
    .eq("id", characterId);
}

interface CharacterRecord {
  id: string;
  name: string;
  sourcePrompt: string;
  identityPrompt: string;
  kind: CharacterKind;
  look: CharacterLook;
  createdAt: string;
}

/** 옛 줄에는 kind·look 이 없다. 사람 + (실사|그림) 으로 본다. */
function normalizeRecord(row: Record<string, unknown>): CharacterRecord {
  const visual = row.visual_style ?? row.look;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    sourcePrompt: String(row.source_prompt ?? row.sourcePrompt ?? ""),
    identityPrompt: String(row.identity_prompt ?? row.identityPrompt ?? ""),
    kind: (row.kind as CharacterKind) ?? "person",
    look: ((row.look as CharacterLook) ?? (visual === "photoreal" ? "photoreal" : "illustration")),
    createdAt: String(row.created_at ?? row.createdAt ?? ""),
  };
}

/**
 * 캐릭터 한 명.
 *
 * `teamId` 를 주면 같은 팀 것도 찾는다. **안 주면 자기 것만**이다 — 지우는
 * 자리처럼 주인만 해야 하는 곳은 그냥 안 준다. 빠뜨렸을 때 남의 것을
 * 건드리는 쪽으로 틀리지 않는다.
 */
async function findCharacter(
  userId: string,
  characterId: string,
  teamId: string | null = null,
): Promise<CharacterRecord | null> {
  if (isLocalStoreEnabled()) {
    const row = await findLocalCharacter(userId, characterId);
    return row ? normalizeRecord(row as unknown as Record<string, unknown>) : null;
  }
  const { data } = await scopedRead(
    createSupabaseAdminClient().from("characters").select("*").eq("id", characterId),
    { userId, teamId, isAdmin: false },
  ).maybeSingle();
  return data ? normalizeRecord(data as Record<string, unknown>) : null;
}
export async function characterForWrite(userId: string, characterId: string) { return findCharacter(userId, characterId); }

export async function listCharacters(
  userId: string,
  teamId: string | null = null,
): Promise<CharacterSummary[]> {
  if (isLocalStoreEnabled()) {
    const [rows, views] = await Promise.all([
      listLocalCharacters(userId),
      listLocalCharacterViews(userId),
    ]);
    return rows.map((row) => {
      const record = normalizeRecord(row as unknown as Record<string, unknown>);
      return {
        ...record,
        views: views
          .filter((view) => view.characterId === row.id)
          .sort(byAngleOrder)
          .map((view) => ({
            angle: migrateAngle(view.angle) as CharacterAngle,
            url: `/api/characters/file?path=${encodeURIComponent(view.path)}`,
          })),
      };
    });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await scopedRead(
    supabase.from("characters").select("*").order("created_at", { ascending: false }).limit(100),
    { userId, teamId, isAdmin: false },
  );

  if (error || !data?.length) return [];

  // 각도는 **부모로 거른다.** `character_views` 에는 `team_id` 가 없어서
  // 팀에서 보이는지를 자식만 보고는 정할 수 없다. 위에서 이미 걸러 낸
  // 캐릭터의 id 로 묻는 것이 정확하다.
  const { data: viewRows } = await supabase
    .from("character_views")
    .select("character_id,angle,path,thumb_path")
    .in("character_id", data.map((row: { id: string }) => row.id));

  // **원본과 사본을 둘 다 서명한다.** 격자는 사본을, 확대와 생성 입력은
  // 원본을 쓴다. 한 번에 모아 보내므로 왕복은 늘지 않는다.
  const paths = (viewRows ?? [])
    .flatMap((row: { path: string; thumb_path?: string | null }) => [row.path, row.thumb_path])
    .filter(Boolean) as string[];
  const signed = paths.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = new Map<string, string>();
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }

  return data.map((row: Record<string, unknown>) => ({
    ...normalizeRecord(row),
    views: (viewRows ?? [])
      .filter((view: { character_id: string }) => view.character_id === String(row.id))
      .sort(byAngleOrder)
      .map((view: { angle: string; path: string; thumb_path?: string | null }) => ({
        angle: migrateAngle(view.angle) as CharacterAngle,
        thumbUrl: view.thumb_path ? urlByPath.get(view.thumb_path) ?? null : null,
        url: urlByPath.get(view.path) ?? null,
      })),
  }));
}

/** 저장된 각도 한 장의 본문. 없으면 null. */
async function loadViewBytes(
  userId: string,
  characterId: string,
  angle: CharacterAngle,
): Promise<{ base64: string; mimeType: string } | null> {
  if (isLocalStoreEnabled()) {
    const views = await listLocalCharacterViews(userId);
    const view = views.find((entry) => entry.characterId === characterId && entry.angle === angle);
    if (!view) return null;
    const bytes = await readLocalCharacterFile(view.path);
    return { base64: bytes.toString("base64"), mimeType: view.mimeType };
  }

  // 부르는 쪽(`loadCharacterView`)이 부모를 이미 확인했다. 여기서 다시
  // `user_id` 로 거르면 팀원 캐릭터를 쓸 때 각도만 못 찾아, 목록에는
  // 보이는데 생성에는 안 걸리는 상태가 된다.
  const supabase = createSupabaseAdminClient();
  const { data: view } = await supabase
    .from("character_views")
    .select("path,mime_type")
    .eq("character_id", characterId)
    .eq("angle", angle)
    .maybeSingle();
  if (!view) return null;

  const { data: file } = await supabase.storage.from(BUCKET).download(view.path as string);
  if (!file) return null;
  return {
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mimeType: view.mime_type as string,
  };
}

/**
 * 섹션 생성에 넣을 각도 한 장. 이미지 본문까지 채워 돌려준다.
 *
 * 여러 종을 다 보내면 참조가 늘어 서로를 희석시킨다. 그래서 한 장만 고른다.
 * 그 각도가 없으면 정면으로 떨어진다 — 없다고 캐릭터를 통째로 빼면 손해가 크다.
 */
export async function loadCharacterView(
  userId: string,
  characterId: string,
  angle: CharacterAngle,
  teamId: string | null = null,
) {
  const character = await findCharacter(userId, characterId, teamId);
  if (!character) return null;

  const chosen =
    (await loadViewBytes(userId, characterId, angle)) ??
    (await loadViewBytes(userId, characterId, "front"));
  if (!chosen) return null;

  return { identityPrompt: character.identityPrompt, ...chosen };
}

/** 로컬 모드에서 각도 파일을 화면에 내려 준다. 운영은 서명 URL 을 쓴다. */
export async function readCharacterFile(userId: string, storagePath: string) {
  const views = await listLocalCharacterViews(userId);
  const view = views.find((entry) => entry.path === storagePath);
  if (!view) return null;
  return { bytes: await readLocalCharacterFile(view.path), mimeType: view.mimeType };
}

export async function deleteCharacter(userId: string, characterId: string) {
  const character = await findCharacter(userId, characterId);

  if (isLocalStoreEnabled()) {
    const paths = await deleteLocalCharacter(userId, characterId);
    await removeLocalCharacterFiles(paths);
  } else {
    const supabase = createSupabaseAdminClient();
    const { data: views } = await supabase
      .from("character_views")
      .select("path,thumb_path")
      .eq("user_id", userId)
      .eq("character_id", characterId);

    // 사본도 함께 지운다. 행이 사라지면 그 자리를 아는 곳이 없어진다.
    const paths = gridPathsToRemove(
      (views ?? []).map((row: { path: string; thumb_path?: string | null }) => ({
        path: row.path, thumbPath: row.thumb_path ?? null,
      })),
    );
    const { error } = await supabase
      .from("characters")
      .delete()
      .eq("user_id", userId)
      .eq("id", characterId);
    if (error) return { ok: false, message: error.message };
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  }

  // 라이브러리에 남은 각도도 지운다. 안 지우면 캐릭터를 지워도 참고 이미지에
  // 그대로 남아, 지운 캐릭터가 다른 작업에 계속 끌려 들어온다.
  if (character) {
    // 다각도 한 장도 라이브러리에 한 줄로 들어가 있다. 빠뜨리면 캐릭터를
    // 지워도 그 한 장이 남아 다른 작업에 끌려 들어온다.
    for (const id of [...CHARACTER_ANGLES.map((angle) => angle.id as string), CHARACTER_SHEET.id]) {
      await removeReferenceImagesByTitle(userId, characterReferenceTitle(character.name, id));
    }
  }

  return { ok: true };
}

/**
 * 캐릭터 하나를 만드는 데 드는 크레딧. 화면에 미리 알린다.
 *
 * 후보 수와 각도 수를 사용자가 고르므로 그 값으로 센다. 정면은 고른 후보를
 * 그대로 쓰니 각도 수에서 빠진다.
 */
export function characterCreditCost(
  look: CharacterLook | boolean,
  modelId?: ImageModelId,
  counts?: { candidates?: number; extraAngles?: number },
) {
  const model = modelId ?? selectCharacterModel(look);
  const candidates = clampCandidates(counts?.candidates);
  // 다각도 한 장도 「한 장」이라 부르는 쪽이 여기에 더해 보낸다.
  const angles = counts?.extraAngles ?? DEFAULT_EXTRA_ANGLES.length;
  /**
   * **장을 실제 단가에서 뽑는다**(2026-09-08 사용자 결정).
   *
   * 전에는 손으로 매긴 정수 가중치였다 — 같은 「1장」이 모델마다 $0.039~$0.060
   * 로 갈렸다.
   */
  return imageCreditUnits(model, candidates + angles);
}
