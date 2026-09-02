import { randomUUID } from "node:crypto";
import {
  CHARACTER_ANGLES,
  buildCandidatePrompt,
  buildTurnaroundPrompt,
  creditUnitsFor,
  generateImageViaFal,
  selectCharacterModel,
  type AspectRatio,
  type CharacterAngle,
  type CharacterAngleInfo,
} from "@fixup/pdp-core";
import { createSupabaseAdminClient } from "./supabase/admin";
import { saveLibraryItem } from "./server-library";
import { characterReferenceEntries } from "./character-library";
import { saveReferenceImage } from "./reference-images";

/**
 * 상세페이지용 캐릭터.
 *
 * 흐름은 세 단계다.
 *   1) 텍스트 묘사로 후보 2장을 만든다
 *   2) 사용자가 하나를 고른다
 *   3) 그 후보를 참조로 정면·45도·뒷모습을 만들어 고정한다
 *
 * 후보를 2장, 각도를 3종으로 줄인 것은 사용자가 정한 값이다. 원본
 * (character-ip-service)은 후보 3~4장에 각도 6종인데, 측면 90도는
 * 상세페이지에서 거의 안 쓰이고 그만큼 크레딧이 든다.
 *
 * 저장은 스타일 레퍼런스와 같은 방식이다 — 사용자별, 비공개 버킷,
 * 경로 첫 칸이 소유자.
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
  CHARACTER_ANGLES.map((angle: CharacterAngleInfo, index: number) => [angle.id, index]),
);

function byAngleOrder(a: { angle: string }, b: { angle: string }) {
  return (ANGLE_ORDER.get(a.angle) ?? 99) - (ANGLE_ORDER.get(b.angle) ?? 99);
}

/** 후보 수. 늘리면 그만큼 크레딧이 든다. */
export const CANDIDATE_COUNT = 2;

export interface CharacterView {
  angle: CharacterAngle;
  url: string | null;
}

export interface CharacterSummary {
  id: string;
  name: string;
  sourcePrompt: string;
  identityPrompt: string;
  visualStyle: "photoreal" | "illustration";
  createdAt: string;
  views: CharacterView[];
}

function extensionFor(mimeType: string) {
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  return "png";
}

/**
 * 후보를 만든다. 아직 저장하지 않는다 — 고르기 전이라 버려질 수 있다.
 *
 * 두 장을 동시에 만든다. 순차로 하면 두 배 기다린다.
 */
export async function generateCandidates(input: {
  description: string;
  aspectRatio: AspectRatio;
  photoreal: boolean;
}) {
  const model = selectCharacterModel(input.photoreal);
  const prompt = buildCandidatePrompt(input);

  const settled = await Promise.allSettled(
    Array.from({ length: CANDIDATE_COUNT }, () =>
      generateImageViaFal(model, {
        prompt,
        systemPrompt: "You are a character designer. Produce one clean character reference.",
        aspectRatio: input.aspectRatio,
        references: [],
      }),
    ),
  );

  const candidates = settled
    .filter(
      (entry): entry is PromiseFulfilledResult<{ base64: string; mimeType: string }> =>
        entry.status === "fulfilled",
    )
    .map((entry) => entry.value);

  return { model, candidates, requested: CANDIDATE_COUNT };
}

/**
 * 고른 후보를 기준으로 다각도를 만들고 캐릭터로 저장한다.
 *
 * 각도 이미지는 고른 후보를 참조로 넣어 만든다. 참조 없이 텍스트만으로 만들면
 * 각도마다 다른 사람이 나온다 — 그러면 이 기능의 의미가 없다.
 */
export async function createCharacter(input: {
  userId: string;
  name: string;
  description: string;
  aspectRatio: AspectRatio;
  photoreal: boolean;
  chosenBase64: string;
  chosenMimeType: string;
}) {
  const model = selectCharacterModel(input.photoreal);
  const supabase = createSupabaseAdminClient();

  const { data: character, error } = await supabase
    .from("characters")
    .insert({
      user_id: input.userId,
      name: input.name.slice(0, 80),
      source_prompt: input.description,
      identity_prompt: input.description,
      visual_style: input.photoreal ? "photoreal" : "illustration",
    })
    .select("id")
    .single();

  if (error || !character) {
    return { ok: false as const, message: error?.message ?? "캐릭터를 만들지 못했습니다." };
  }

  const uploaded: string[] = [];

  try {
    // 고른 후보를 정면으로 그대로 쓴다. 다시 만들면 얼굴이 달라진다.
    const front = {
      angle: "front" as const,
      base64: input.chosenBase64,
      mimeType: input.chosenMimeType,
    };

    const others = await Promise.allSettled(
      CHARACTER_ANGLES.filter((entry) => entry.id !== "front").map(async (entry) => {
        const image = await generateImageViaFal(model, {
          prompt: buildTurnaroundPrompt({
            identityPrompt: input.description,
            angle: entry.id,
            photoreal: input.photoreal,
          }),
          systemPrompt: "",
          aspectRatio: input.aspectRatio,
          references: [
            { kind: "person", base64: input.chosenBase64, mimeType: input.chosenMimeType },
          ],
        });
        return { angle: entry.id, base64: image.base64, mimeType: image.mimeType };
      }),
    );

    // 정면을 맨 앞에 두고 나머지를 정해진 순서로 붙인다. Promise 완료 순서에
    // 맡기면 라이브러리 첫 장이 뒷모습이 되는 일이 생긴다.
    const views = [
      front,
      ...others
        .filter(
          (entry): entry is PromiseFulfilledResult<{
            angle: CharacterAngle;
            base64: string;
            mimeType: string;
          }> => entry.status === "fulfilled",
        )
        .map((entry) => entry.value)
        .sort(byAngleOrder),
    ];

    const rows = [];
    for (const view of views) {
      const path = `${input.userId}/${character.id}/${view.angle}.${extensionFor(view.mimeType)}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(view.base64, "base64"), {
          contentType: view.mimeType,
          upsert: true,
        });
      if (uploadError) throw new Error(uploadError.message);

      uploaded.push(path);
      rows.push({
        character_id: character.id,
        user_id: input.userId,
        angle: view.angle,
        path,
        mime_type: view.mimeType,
      });
    }

    const { error: viewsError } = await supabase.from("character_views").insert(rows);
    if (viewsError) throw new Error(viewsError.message);

    // 라이브러리에도 남긴다. 만든 결과물이니 다른 작업물과 같은 자리에서
    // 보고 내려받을 수 있어야 한다. 실패해도 캐릭터는 살린다 — 곁다리다.
    try {
      await saveLibraryItem({
        userId: input.userId,
        title: `${input.name} (캐릭터)`,
        tool: "create",
        aspectRatio: input.aspectRatio,
        sourceType: "character",
        sourceId: character.id as string,
        images: views.map((view) => ({ base64: view.base64, mimeType: view.mimeType })),
      });
    } catch (libraryError) {
      console.warn("[character] 라이브러리 저장 실패, 캐릭터는 유지합니다", libraryError);
    }

    // 참고 이미지 창고에도 네 각도를 다 넣는다. 여기 들어가야 카드뉴스·포스터·
    // 상세페이지가 전부 쓴다. 정면 한 장만 넣으면 옆모습이 필요한 장면에서
    // 다시 만들게 되고, 그러면 같은 인물로 안 보인다 — 네 각도로 만든 이유가
    // 사라진다. 실패해도 캐릭터는 살린다.
    try {
      for (const entry of characterReferenceEntries(input.name, views)) {
        await saveReferenceImage({
          userId: input.userId,
          id: randomUUID(),
          title: entry.title,
          // 용도로 거르지 않는다. 어느 도구에서든 인물을 지킬 때 쓴다.
          purpose: "both",
          bytes: Buffer.from(entry.base64, "base64"),
          mimeType: entry.mimeType,
        });
      }
    } catch (referenceError) {
      console.warn("[character] 참고 이미지 저장 실패, 캐릭터는 유지합니다", referenceError);
    }

    return { ok: true as const, id: character.id as string, angleCount: rows.length };
  } catch (caught) {
    // 되돌린다. 파일부터 지우고 행을 지운다 — 순서가 반대면 경로를 잃는다.
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    await supabase.from("characters").delete().eq("id", character.id);
    return {
      ok: false as const,
      message: caught instanceof Error ? caught.message : "캐릭터를 만들지 못했습니다.",
    };
  }
}

export async function listCharacters(userId: string): Promise<CharacterSummary[]> {
  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("characters")
    .select("id,name,source_prompt,identity_prompt,visual_style,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error || !data?.length) return [];

  const { data: viewRows } = await supabase
    .from("character_views")
    .select("character_id,angle,path")
    .eq("user_id", userId);

  const paths = (viewRows ?? []).map((row: { path: string }) => row.path).filter(Boolean);
  const signed = paths.length
    ? await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS)
    : { data: [] };

  const urlByPath = new Map<string, string>();
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }

  return data.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    sourcePrompt: row.source_prompt as string,
    identityPrompt: row.identity_prompt as string,
    visualStyle: (row.visual_style as "photoreal" | "illustration") ?? "photoreal",
    createdAt: String(row.created_at),
    views: (viewRows ?? [])
      .filter((view: { character_id: string }) => view.character_id === (row.id as string))
      .sort(byAngleOrder)
      .map((view: { angle: string; path: string }) => ({
        angle: view.angle as CharacterAngle,
        url: urlByPath.get(view.path) ?? null,
      })),
  }));
}

/**
 * 섹션 생성에 넣을 각도 한 장. 이미지 본문까지 채워 돌려준다.
 *
 * 3종을 다 보내면 참조가 늘어 서로를 희석시킨다. 그래서 한 장만 고른다.
 */
export async function loadCharacterView(
  userId: string,
  characterId: string,
  angle: CharacterAngle,
) {
  const supabase = createSupabaseAdminClient();

  const { data: character } = await supabase
    .from("characters")
    .select("identity_prompt")
    .eq("user_id", userId)
    .eq("id", characterId)
    .maybeSingle();
  if (!character) return null;

  const { data: view } = await supabase
    .from("character_views")
    .select("path,mime_type")
    .eq("user_id", userId)
    .eq("character_id", characterId)
    .eq("angle", angle)
    .maybeSingle();

  // 그 각도가 없으면 정면으로 떨어진다. 없다고 캐릭터를 통째로 빼면 손해가 크다.
  const fallback = view
    ? null
    : (
        await supabase
          .from("character_views")
          .select("path,mime_type")
          .eq("user_id", userId)
          .eq("character_id", characterId)
          .eq("angle", "front")
          .maybeSingle()
      ).data;

  const chosen = view ?? fallback;
  if (!chosen) return null;

  const { data: file } = await supabase.storage.from(BUCKET).download(chosen.path as string);
  if (!file) return null;

  return {
    identityPrompt: character.identity_prompt as string,
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    mimeType: chosen.mime_type as string,
  };
}

export async function deleteCharacter(userId: string, characterId: string) {
  const supabase = createSupabaseAdminClient();

  const { data: views } = await supabase
    .from("character_views")
    .select("path")
    .eq("user_id", userId)
    .eq("character_id", characterId);

  const paths = (views ?? []).map((row: { path: string }) => row.path).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);

  const { error } = await supabase
    .from("characters")
    .delete()
    .eq("user_id", userId)
    .eq("id", characterId);

  return { ok: !error, message: error?.message };
}

/** 캐릭터 하나를 만드는 데 드는 크레딧. 화면에 미리 알린다. */
export function characterCreditCost(photoreal: boolean) {
  const model = selectCharacterModel(photoreal);
  // 후보 2장 + 다각도 2장(정면은 고른 후보를 그대로 쓴다)
  return creditUnitsFor(model, CANDIDATE_COUNT + CHARACTER_ANGLES.length - 1);
}
