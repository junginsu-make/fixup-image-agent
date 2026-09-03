import "server-only";

import path from "node:path";
import { parseStoredSlots, type CardTemplate, type LayoutSlot } from "@fixup/layout-core";
import { createSupabaseServerClient } from "../supabase/server";
import { readJsonRows, writeJsonRows } from "./json-file";
import { isLocalStoreEnabled, localStoreRoot } from "../local-store";

/**
 * 「이 뼈대 저장하기」를 눌렀을 때만 남는다.
 *
 * 기본 목록은 코드에 있다. 여기에는 B 로 읽어냈거나 화면에서 고친 것만
 * 들어간다 — 안 눌러도 그 카드에는 그대로 쓰이므로, 저장은 「다른 작업에서도
 * 쓰겠다」는 뜻일 때만이다.
 */

export interface SavedTemplate extends CardTemplate {
  createdAt: string;
}

export interface TemplateInput {
  name: string;
  role: CardTemplate["role"];
  slots: LayoutSlot[];
}

const LOCAL_FILE = "layout-templates.json";

interface LocalRow extends SavedTemplate {
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

interface TemplateDbRow {
  id: string;
  name: string;
  role: CardTemplate["role"];
  slots: LayoutSlot[];
  created_at: string;
}

/** 못 읽는 행은 버린다. 한 행 때문에 목록 전체가 죽으면 안 된다. */
function toSaved(row: TemplateDbRow): SavedTemplate | undefined {
  const slots = parseStoredSlots(row.slots);
  if (!slots) return undefined;
  return { id: row.id, name: row.name, role: row.role, slots, createdAt: row.created_at };
}

export async function listSavedTemplates(userId: string): Promise<SavedTemplate[]> {
  if (isLocalStoreEnabled()) {
    return (await readLocal())
      .filter((row) => row.userId === userId)
      .flatMap(({ userId: _owner, ...template }) => (
        parseStoredSlots(template.slots) ? [template] : []
      ));
  }

  const client = await createSupabaseServerClient();
  const result = await client
    .from("card_layout_templates")
    .select("id,name,role,slots,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (result.error) throw new Error(result.error.message);
  return (result.data as TemplateDbRow[]).flatMap((row) => {
    const saved = toSaved(row);
    return saved ? [saved] : [];
  });
}

export async function saveTemplate(userId: string, input: TemplateInput): Promise<SavedTemplate> {
  if (isLocalStoreEnabled()) {
    const rows = await readLocal();
    const saved: LocalRow = {
      userId,
      id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name: input.name,
      role: input.role,
      slots: input.slots,
      createdAt: new Date().toISOString(),
    };
    await writeLocal([saved, ...rows]);
    const { userId: _owner, ...template } = saved;
    return template;
  }

  const client = await createSupabaseServerClient();
  const result = await client
    .from("card_layout_templates")
    .insert({ user_id: userId, name: input.name, role: input.role, slots: input.slots })
    .select("id,name,role,slots,created_at")
    .single();
  if (result.error) throw new Error(result.error.message);
  const saved = toSaved(result.data as TemplateDbRow);
  if (!saved) throw new Error("저장한 뼈대를 다시 읽지 못했습니다.");
  return saved;
}

export async function deleteTemplate(userId: string, id: string): Promise<void> {
  if (isLocalStoreEnabled()) {
    const rows = await readLocal();
    await writeLocal(rows.filter((row) => !(row.id === id && row.userId === userId)));
    return;
  }

  const client = await createSupabaseServerClient();
  const result = await client
    .from("card_layout_templates")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (result.error) throw new Error(result.error.message);
}
