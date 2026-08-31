import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReferenceSetRecord, SetInput } from "./schema";

type ItemRow = {
  id: string;
  reference_image_id: string;
  role: ReferenceSetRecord["items"][number]["role"];
  position: number;
};

type SetRow = {
  id: string;
  name: string;
  purpose: ReferenceSetRecord["purpose"];
  created_at: string;
  updated_at: string;
  reference_set_items: ItemRow[] | null;
};

const SET_SELECT = "id,name,purpose,created_at,updated_at,reference_set_items(id,reference_image_id,role,position)";

function checked<T>(data: T, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  return data;
}

function toRecord(row: SetRow): ReferenceSetRecord {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    items: (row.reference_set_items ?? [])
      .map((item) => ({
        id: item.id,
        referenceImageId: item.reference_image_id,
        role: item.role,
        position: item.position,
      }))
      .sort((a, b) => a.position - b.position),
  };
}

function itemPayload(setId: string, input: SetInput) {
  return input.items.map((item) => ({
    set_id: setId,
    reference_image_id: item.referenceImageId,
    role: item.role,
    position: item.position,
  }));
}

async function findOne(client: SupabaseClient, id: string): Promise<ReferenceSetRecord> {
  const { data, error } = await client.from("reference_sets").select(SET_SELECT).eq("id", id).single();
  return toRecord(checked(data as SetRow, error));
}

export function createReferenceSetStore(client: SupabaseClient) {
  return {
    async list(): Promise<ReferenceSetRecord[]> {
      const { data, error } = await client.from("reference_sets").select(SET_SELECT).order("updated_at", { ascending: false });
      return checked((data ?? []) as SetRow[], error).map(toRecord);
    },

    async create(userId: string, input: SetInput): Promise<ReferenceSetRecord> {
      const { data, error } = await client.from("reference_sets").insert({
        user_id: userId,
        name: input.name,
        purpose: input.purpose,
      }).select("id").single();
      const setId = checked(data as { id: string }, error).id;

      if (input.items.length) {
        const inserted = await client.from("reference_set_items").insert(itemPayload(setId, input));
        if (inserted.error) {
          await client.from("reference_sets").delete().eq("id", setId);
          throw new Error(inserted.error.message);
        }
      }
      return findOne(client, setId);
    },

    async update(id: string, input: SetInput): Promise<ReferenceSetRecord> {
      const current = await client.from("reference_set_items").select("id").eq("set_id", id);
      const oldIds = checked((current.data ?? []) as Array<{ id: string }>, current.error).map((item) => item.id);
      let newIds: string[] = [];

      if (input.items.length) {
        const inserted = await client.from("reference_set_items").insert(itemPayload(id, input)).select("id");
        newIds = checked((inserted.data ?? []) as Array<{ id: string }>, inserted.error).map((item) => item.id);
      }

      if (oldIds.length) {
        const removed = await client.from("reference_set_items").delete().in("id", oldIds);
        if (removed.error) {
          if (newIds.length) await client.from("reference_set_items").delete().in("id", newIds);
          throw new Error(removed.error.message);
        }
      }

      const updated = await client.from("reference_sets").update({
        name: input.name,
        purpose: input.purpose,
        updated_at: new Date().toISOString(),
      }).eq("id", id);
      checked(undefined, updated.error);
      return findOne(client, id);
    },

    async remove(id: string): Promise<void> {
      const { error } = await client.from("reference_sets").delete().eq("id", id);
      checked(undefined, error);
    },
  };
}
