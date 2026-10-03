import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseAdminClient } from "./supabase/admin";
import { isLocalStoreEnabled } from "./local-store";
import {
  findLocalCharacter,
  listLocalCharacterViews,
  readLocalCharacterFile,
  upsertLocalCharacterView,
  writeLocalCharacterFile,
} from "./characters-store";
import { characterReferenceEntries, CharacterViewInput } from "./character-library";
import { saveReferenceImage } from "./reference-images";

/**
 * **새 캐릭터에 원본의 나머지 각도를 옮겨 담는다.**
 *
 * 「과정 보기」로 연 캐릭터에서 정면을 그대로 두고 저장하면 새 캐릭터가 생긴다
 * (2026-10-02 사용자 결정: 원본은 그대로, 언제나 새 캐릭터). 그때 고르지 않은
 * 각도가 새 캐릭터에 비지 않게 원본에서 채운다.
 *
 * - **두 캐릭터가 모두 요청한 사람 것일 때만.** 팀 범위도 넓히지 않는다
 * - **새 캐릭터에 없는 각도만.** 다시 만든 각도는 덮어쓰지 않는다
 * - **원본은 읽기만 한다.** 파일은 새 자리로 복사한다 — 원본 경로를 가리키면
 *   원본을 지울 때 새 캐릭터 그림도 사라진다(9월 16일 설계의 복사 규칙과 같다)
 *
 * 그림을 새로 그리지 않으므로 크레딧이 들지 않는다.
 */

const BUCKET = "characters";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CharacterCarryNotFound extends Error {
  constructor() {
    super("캐릭터를 찾을 수 없습니다.");
  }
}

export interface CarryInput {
  userId: string;
  fromId: string;
  toId: string;
}

export interface CarryResult {
  carried: string[];
  failed: string[];
  referenceIssue?: string;
}

export function isUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

/** 경로 한 칸에 허용하는 모양 — 글자·숫자·밑줄·하이픈, 점은 그 덩어리 **사이에만**. */
const SAFE_SEGMENT = /^[\w-]+(\.[\w-]+)*$/;

/**
 * 경로가 `{userId}/{characterId}/…` 아래인가. **막을 것을 나열하지 않고 허용할 것만 나열한다.**
 *
 * storage-js 는 경로를 인코딩 없이 주소(`${url}/object/${bucket}/${path}`)에 이어 붙이고, 주소
 * 해석은 탭·줄바꿈을 지우고 `%2e%2e` 를 `..` 로 접는다. 그래서 `me/A/%2e%2e/%2e%2e/victim/V/front.png`
 * 나 `me/A/.<탭>./…` 는 서비스 롤로 `victim/V/front.png` 를 읽는다. 막을 모양(`..`, 빈 칸, 역슬래시)을
 * 하나씩 더하는 방식은 우회가 계속 나온다 — 그래서 **모든 칸이 허용 모양(`SAFE_SEGMENT`)일 때만**,
 * 셋 이상으로 갈라지고 앞 두 칸이 사용자·캐릭터와 같을 때만 통과시킨다.
 * 이 모양을 통과한 경로의 끝 이름은 `carriedPath` 가 그대로 써도 안전하다.
 */
export function isOwnedPath(path: string, userId: string, characterId: string): boolean {
  const parts = path.split("/");
  return parts.length >= 3
    && parts[0] === userId
    && parts[1] === characterId
    && parts.every((part) => SAFE_SEGMENT.test(part));
}

/** 옮겨 담을 각도 — 원본에 있고 새 캐릭터에 없는 것. 정면은 새 캐릭터에 늘 있다. */
export function anglesToCarry(fromAngles: string[], toAngles: string[]): string[] {
  const have = new Set(toAngles);
  return fromAngles.filter((angle) => angle !== "front" && !have.has(angle));
}

/**
 * 원본 경로의 끝 이름(`{각도}.{확장자}`)을 새 캐릭터 자리로 옮긴다.
 *
 * 운영은 첫 칸이 소유자다(버킷 정책이 그 칸으로 판정한다). 로컬은 그 칸이 없다.
 */
export function carriedPath(originalPath: string, toId: string, ownerPrefix: string | null): string | null {
  const tail = originalPath.split("/").at(-1);
  if (!tail || !SAFE_SEGMENT.test(tail)) return null;
  return ownerPrefix ? `${ownerPrefix}/${toId}/${tail}` : `${toId}/${tail}`;
}

export async function carryCharacterViews(input: CarryInput): Promise<CarryResult> {
  if (input.fromId === input.toId) throw new CharacterCarryNotFound();
  return isLocalStoreEnabled() ? carryLocal(input) : carryRemote(input);
}

/** 순서대로 하나씩 — 로컬 저장소는 한 파일을 읽고 고쳐 쓰므로 동시에 쓰면 앞의 것이 사라진다. */
async function inOrder<T, R>(items: T[], run: (item: T) => Promise<R | null>): Promise<R[]> {
  return items.reduce<Promise<R[]>>(async (previous, item) => {
    const done = await previous;
    const result = await run(item);
    return result === null ? done : [...done, result];
  }, Promise.resolve([]));
}

interface CarryStep { angle: string; ok: boolean; view?: CharacterViewInput }

async function registerCarried(userId: string, name: string, views: CharacterViewInput[]): Promise<string | undefined> {
  try {
    const entries = characterReferenceEntries(name, views);
    for (const entry of entries) {
      await saveReferenceImage({
        userId,
        id: randomUUID(),
        title: entry.title,
        purpose: "both",
        bytes: Buffer.from(entry.base64, "base64"),
        mimeType: entry.mimeType,
      });
    }
  } catch (error) {
    console.error("[character-carry] 라이브러리 등록 실패", error);
    return "옮겨 담은 각도를 라이브러리에 넣지 못했습니다.";
  }
  return undefined;
}

interface LocalCharacterView {
  characterId: string;
  userId: string;
  angle: string;
  path: string;
  mimeType: string;
}

async function carryOneLocal(view: LocalCharacterView, toId: string, userId: string): Promise<CarryStep | null> {
  try {
    const path = carriedPath(view.path, toId, null);
    if (!path) {
      console.error(`[character-carry] 경로 변환 실패: ${view.path}`);
      return { angle: view.angle, ok: false };
    }
    const bytes = await readLocalCharacterFile(view.path);
    await writeLocalCharacterFile(path, bytes);
    await upsertLocalCharacterView({ characterId: toId, userId, angle: view.angle, path, mimeType: view.mimeType });
    return { angle: view.angle, ok: true, view: { angle: view.angle, base64: bytes.toString("base64"), mimeType: view.mimeType } };
  } catch (error) {
    console.error(`[character-carry] ${view.angle} 복사 실패`, error);
    return { angle: view.angle, ok: false };
  }
}

async function carryLocal({ userId, fromId, toId }: CarryInput): Promise<CarryResult> {
  const [from, to] = await Promise.all([
    findLocalCharacter(userId, fromId),
    findLocalCharacter(userId, toId),
  ]);
  if (!from || !to) throw new CharacterCarryNotFound();

  const views = await listLocalCharacterViews(userId);
  const fromViews = views.filter((view) => view.characterId === fromId);
  const toAngles = views.filter((view) => view.characterId === toId).map((view) => view.angle);
  const angles = anglesToCarry(fromViews.map((view) => view.angle), toAngles);

  const steps = await inOrder(fromViews.filter((v) => angles.includes(v.angle)), (view) => carryOneLocal(view, toId, userId));
  const carried = steps.filter((s) => s.ok).map((s) => s.angle);
  const failed = steps.filter((s) => !s.ok).map((s) => s.angle);
  const carriedViews = steps.filter((s) => s.ok && s.view).map((s) => s.view!);

  const referenceIssue = carriedViews.length > 0 ? await registerCarried(userId, to.name, carriedViews) : undefined;
  return { carried, failed, ...(referenceIssue ? { referenceIssue } : {}) };
}

interface RemoteView {
  character_id: string;
  angle: string;
  path: string;
  thumb_path: string | null;
  mime_type: string | null;
}

function contentTypeOf(path: string, fallback: string | null): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  return fallback ?? "image/png";
}

type Storage = ReturnType<ReturnType<typeof createSupabaseAdminClient>["storage"]["from"]>;

/**
 * 한 장을 복사한다. **`contentType` 을 반드시 준다** — 안 주면 Buffer 본문에
 * `text/plain` 이 붙는다(`api/admin/works/store.ts` 의 `moveAssets` 와 같은 이유).
 */
async function copyFile(storage: Storage, from: string, to: string, contentType: string): Promise<Buffer | null> {
  const file = await storage.download(from);
  if (file.error || !file.data) {
    console.error(`[character-carry] 원본을 못 읽었습니다(${from}): ${file.error?.message ?? "알 수 없음"}`);
    return null;
  }
  const bytes = Buffer.from(await file.data.arrayBuffer());
  const uploaded = await storage.upload(to, bytes, { contentType, upsert: true });
  if (uploaded.error) {
    console.error(`[character-carry] 새 자리에 못 올렸습니다(${to}): ${uploaded.error.message}`);
    return null;
  }
  return bytes;
}

async function carryOneRemote(view: RemoteView, userId: string, fromId: string, toId: string, storage: Storage): Promise<CarryStep | null> {
  try {
    if (!isOwnedPath(view.path, userId, fromId)) {
      console.error(`[character-carry] ${view.angle} 소유권 검증 실패: ${view.path}`);
      return { angle: view.angle, ok: false };
    }
    const path = carriedPath(view.path, toId, userId);
    if (!path) {
      console.error(`[character-carry] ${view.angle} 경로 변환 실패: ${view.path}`);
      return { angle: view.angle, ok: false };
    }
    const mimeType = contentTypeOf(view.path, view.mime_type);
    const bytes = await copyFile(storage, view.path, path, mimeType);
    if (!bytes) return { angle: view.angle, ok: false };

    let thumbPath: string | null = null;
    if (view.thumb_path && isOwnedPath(view.thumb_path, userId, fromId)) {
      const thumb = carriedPath(view.thumb_path, toId, userId);
      if (thumb) {
        const thumbBytes = await copyFile(storage, view.thumb_path, thumb, contentTypeOf(thumb, null));
        thumbPath = thumbBytes ? thumb : null;
      }
    }
    const admin = createSupabaseAdminClient();
    const { error: upsertError } = await admin.from("character_views").upsert(
      { character_id: toId, user_id: userId, angle: view.angle, path, thumb_path: thumbPath, mime_type: mimeType },
      { onConflict: "character_id,angle" },
    );
    if (upsertError) {
      console.error(`[character-carry] ${view.angle} 뷰 저장 실패`, upsertError.message);
      return { angle: view.angle, ok: false };
    }
    return { angle: view.angle, ok: true, view: { angle: view.angle, base64: bytes.toString("base64"), mimeType } };
  } catch (error) {
    console.error(`[character-carry] ${view.angle} 복사 실패`, error);
    return { angle: view.angle, ok: false };
  }
}

async function carryRemote({ userId, fromId, toId }: CarryInput): Promise<CarryResult> {
  if (!isUuid(fromId) || !isUuid(toId)) throw new CharacterCarryNotFound();

  const admin = createSupabaseAdminClient();
  const { data: owned, error } = await admin.from("characters")
    .select("id,name").eq("user_id", userId).in("id", [fromId, toId]);
  if (error) throw new Error(error.message);
  if ((owned ?? []).length !== 2) throw new CharacterCarryNotFound();

  const toCharacter = (owned ?? []).find((c: { id: string; name: string }) => c.id === toId);
  const { data, error: viewError } = await admin.from("character_views")
    .select("character_id,angle,path,thumb_path,mime_type").in("character_id", [fromId, toId]);
  if (viewError) throw new Error(viewError.message);

  const views = (data ?? []) as RemoteView[];
  const fromViews = views.filter((view) => view.character_id === fromId);
  const toAngles = views.filter((view) => view.character_id === toId).map((view) => view.angle);
  const angles = anglesToCarry(fromViews.map((view) => view.angle), toAngles);
  const storage = admin.storage.from(BUCKET);

  const steps = await inOrder(fromViews.filter((v) => angles.includes(v.angle)), (view) => carryOneRemote(view, userId, fromId, toId, storage));
  const carried = steps.filter((s) => s.ok).map((s) => s.angle);
  const failed = steps.filter((s) => !s.ok).map((s) => s.angle);
  const carriedViews = steps.filter((s) => s.ok && s.view).map((s) => s.view!);

  const referenceIssue = toCharacter && carriedViews.length > 0 ? await registerCarried(userId, toCharacter.name, carriedViews) : undefined;
  return { carried, failed, ...(referenceIssue ? { referenceIssue } : {}) };
}
