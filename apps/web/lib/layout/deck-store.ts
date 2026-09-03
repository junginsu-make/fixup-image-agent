import "server-only";

import path from "node:path";
import { parseStoredFrames, type LayoutDeck } from "@fixup/layout-core";
import { createSupabaseServerClient } from "../supabase/server";
import { readJsonRows, writeJsonRows } from "./json-file";
import { isLocalStoreEnabled, localStoreRoot } from "../local-store";

/**
 * 세트를 저장한다.
 *
 * 뼈대 저장(`template-store.ts`)과 표가 다르다. 뼈대는 카드 한 장이고
 * 세트는 표지·속지·엔딩 세 벌 + 장수다. 한 표에 우겨넣으면 읽을 때마다
 * 「이 행은 어느 쪽이지」를 물어야 한다.
 */

export interface SavedDeck extends LayoutDeck {
  id: string;
  createdAt: string;
}

const LOCAL_FILE = "layout-decks.json";

interface LocalRow extends SavedDeck {
  userId: string;
}

function localPath(): string {
  return path.join(localStoreRoot(), LOCAL_FILE);
}

async function readLocal(): Promise<LocalRow[]> {
  return readJsonRows<LocalRow>(localPath());
}

async function writeLocal(rows: LocalRow[]): Promise<void> {
  await writeJsonRows(localPath(), rows);
}

interface DeckDbRow {
  id: string;
  name: string;
  ratio: string;
  total: number;
  frames: LayoutDeck["frames"];
  created_at: string;
}

/** 못 읽는 행은 버린다. 한 행 때문에 목록 전체가 죽으면 안 된다. */
function toSaved(row: DeckDbRow): SavedDeck | undefined {
  const frames = parseStoredFrames(row.frames);
  if (!frames) return undefined;
  return {
    id: row.id,
    name: row.name,
    ratio: row.ratio,
    total: row.total,
    frames,
    createdAt: row.created_at,
  };
}

export async function listDecks(userId: string): Promise<SavedDeck[]> {
  if (isLocalStoreEnabled()) {
    return (await readLocal())
      .filter((row) => row.userId === userId)
      .flatMap(({ userId: _owner, ...deck }) => (parseStoredFrames(deck.frames) ? [deck] : []));
  }

  const client = await createSupabaseServerClient();
  const result = await client
    .from("card_layout_decks")
    .select("id,name,ratio,total,frames,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (result.error) throw new Error(result.error.message);
  return (result.data as DeckDbRow[]).flatMap((row) => {
    const saved = toSaved(row);
    return saved ? [saved] : [];
  });
}

export async function saveDeck(userId: string, deck: LayoutDeck): Promise<SavedDeck> {
  if (isLocalStoreEnabled()) {
    const rows = await readLocal();
    const saved: LocalRow = {
      userId,
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      ...deck,
    };
    await writeLocal([saved, ...rows]);
    const { userId: _owner, ...stored } = saved;
    return stored;
  }

  const client = await createSupabaseServerClient();
  const result = await client
    .from("card_layout_decks")
    .insert({ user_id: userId, name: deck.name, ratio: deck.ratio, total: deck.total, frames: deck.frames })
    .select("id,name,ratio,total,frames,created_at")
    .single();
  if (result.error) throw new Error(result.error.message);
  const saved = toSaved(result.data as DeckDbRow);
  if (!saved) throw new Error("저장한 세트를 다시 읽지 못했습니다.");
  return saved;
}

export async function deleteDeck(userId: string, id: string): Promise<void> {
  if (isLocalStoreEnabled()) {
    const rows = await readLocal();
    await writeLocal(rows.filter((row) => !(row.id === id && row.userId === userId)));
    return;
  }

  const client = await createSupabaseServerClient();
  const result = await client.from("card_layout_decks").delete().eq("id", id).eq("user_id", userId);
  if (result.error) throw new Error(result.error.message);
}
