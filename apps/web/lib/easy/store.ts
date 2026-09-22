import "server-only";

import { randomUUID } from "node:crypto";
import { createSupabaseServerClient } from "../supabase/server";
import { getLocalDatabase, isLocalStoreEnabled } from "../local-store";
import {
  collectEasyWorkIds,
  CONVERSATION_COLUMNS,
  MESSAGE_COLUMNS,
  toConversationRecord,
  toMessageRecord,
  type EasyConversationRecord,
  type EasyConversationRow,
  type EasyMessageRecord,
  type EasyMessageRow,
  type EasyRole,
} from "./store-core";

/**
 * Easy 모드 대화 저장소 (설계 §4-1).
 *
 * **팀 범위를 안 쓴다.** 포스터·카드뉴스는 팀원의 작업을 서로 본다. 대화는 그렇지
 * 않다 — 사용자가 친 말이 그대로 쌓이고 제품명·행사명이 들어간다. RLS 도 본인만
 * 보게 걸었다(`202609180001_easy_conversations.sql`).
 *
 * **회원 권한으로 읽고 쓴다.** admin 클라이언트를 안 쓴다 — 비용 장부가 아니라
 * 자기 대화라 RLS 가 그대로 문지기 노릇을 하면 된다. 2026-09-15 에 admin 으로
 * 우회해 남의 파일을 지운 사고가 있었다.
 */

export interface EasyStore {
  /** 레일에 걸 목록. 최근 것부터. */
  listConversations(limit?: number): Promise<EasyConversationRecord[]>;
  createConversation(title: string): Promise<EasyConversationRecord>;
  getConversation(id: string): Promise<EasyConversationRecord | undefined>;
  /** 대화 한 줄의 제목을 바꾼다. 첫 프롬프트가 들어올 때 한 번 쓴다. */
  renameConversation(id: string, title: string): Promise<void>;
  /** **정말 지웠으면 true.** 남의 것을 지우려 들면 RLS 가 0줄로 막는다. */
  removeConversation(id: string): Promise<boolean>;
  listMessages(conversationId: string): Promise<EasyMessageRecord[]>;
  appendMessage(input: {
    conversationId: string;
    role: EasyRole;
    body?: string;
    workId?: string | null;
  }): Promise<EasyMessageRecord>;
  /**
   * 내 쉽게 대화가 만든 작업의 id. 라이브러리가 쉽게와 다양하게를 가르는 데 쓴다 —
   * 둘 다 같은 포스터 작업으로 저장되어 작업만 보고는 못 가른다.
   */
  listWorkIds(): Promise<string[]>;
}

const DEFAULT_LIMIT = 50;


/* ── Supabase ─────────────────────────────────────────────── */

function checked<T>(data: T, error: { message: string } | null, label: string): T {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

function supabaseEasyStore(userId: string): EasyStore {
  return {
    async listConversations(limit = DEFAULT_LIMIT) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("easy_conversations")
        .select(CONVERSATION_COLUMNS)
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(limit);
      return checked(data as EasyConversationRow[] | null, error, "대화 목록")
        ?.map(toConversationRecord) ?? [];
    },

    async createConversation(title) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("easy_conversations")
        .insert({ user_id: userId, title })
        .select(CONVERSATION_COLUMNS)
        .single();
      return toConversationRecord(
        checked(data as EasyConversationRow, error, "대화를 만들지 못했습니다"),
      );
    },

    async getConversation(id) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("easy_conversations")
        .select(CONVERSATION_COLUMNS)
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      const row = checked(data as EasyConversationRow | null, error, "대화");
      return row ? toConversationRecord(row) : undefined;
    },

    async renameConversation(id, title) {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase
        .from("easy_conversations")
        .update({ title, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", userId);
      checked(null, error, "제목을 바꾸지 못했습니다");
    },

    async removeConversation(id) {
      const supabase = await createSupabaseServerClient();
      /*
       * **정말 지워졌는지 본다.** RLS 가 0줄로 막아도 supabase-js 는 오류를
       * 안 준다 — 2026-09-15 에 그래서 「지운 줄 알았는데 남아 있는」 상태가
       * 됐다. 지운 줄을 돌려받아 센다.
       */
      const { data, error } = await supabase
        .from("easy_conversations")
        .delete()
        .eq("id", id)
        .eq("user_id", userId)
        .select("id");
      return (checked(data as { id: string }[] | null, error, "대화를 지우지 못했습니다") ?? []).length > 0;
    },

    async listMessages(conversationId) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("easy_messages")
        .select(MESSAGE_COLUMNS)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      return checked(data as EasyMessageRow[] | null, error, "대화 내용")
        ?.map(toMessageRecord) ?? [];
    },

    async appendMessage(input) {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase
        .from("easy_messages")
        .insert({
          conversation_id: input.conversationId,
          role: input.role,
          body: input.body ?? "",
          work_id: input.workId ?? null,
        })
        .select(MESSAGE_COLUMNS)
        .single();
      const row = toMessageRecord(
        checked(data as EasyMessageRow, error, "대화에 남기지 못했습니다"),
      );
      /*
       * **대화가 움직였으면 목록의 차례도 움직인다.** 레일이 `updated_at` 으로
       * 세우므로, 이것을 안 올리면 방금 쓴 대화가 목록 아래에 그대로 있다.
       */
      await supabase
        .from("easy_conversations")
        .update({ updated_at: row.createdAt })
        .eq("id", input.conversationId)
        .eq("user_id", userId);
      return row;
    },

    async listWorkIds() {
      const supabase = await createSupabaseServerClient();
      return collectEasyWorkIds((from, to) => supabase
        .from("easy_messages")
        .select("work_id")
        .not("work_id", "is", null)
        .order("id")
        .range(from, to));
    },
  };
}

/* ── 로컬 파일 ────────────────────────────────────────────── */

interface EasyLocalData {
  easyConversations: (EasyConversationRecord & { userId: string })[];
  easyMessages: EasyMessageRecord[];
}

function bucket<K extends keyof EasyLocalData>(data: unknown, key: K): EasyLocalData[K] {
  const store = data as Partial<EasyLocalData>;
  if (!store[key]) store[key] = [] as EasyLocalData[K];
  return store[key]!;
}

/**
 * 로컬 파일 저장소.
 *
 * **Supabase 에는 RLS 가 있지만 파일에는 없다.** 모든 읽기를 먼저 `userId` 로
 * 묶어 남의 것이 안 보이게 한다 — `poster/local-store.ts` 가 같은 판단을 한다.
 */
function localEasyStore(userId: string): EasyStore {
  const database = getLocalDatabase();

  /** 내 대화인가. 줄을 만지기 전에 늘 확인한다 — 파일에는 RLS 가 없다. */
  async function owns(conversationId: string): Promise<boolean> {
    return database.read((data) =>
      bucket(data, "easyConversations").some(
        (row) => row.id === conversationId && row.userId === userId,
      ));
  }

  return {
    async listConversations(limit = DEFAULT_LIMIT) {
      return database.read((data) =>
        bucket(data, "easyConversations")
          .filter((row) => row.userId === userId)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, limit)
          .map(({ userId: _drop, ...rest }) => rest));
    },

    async createConversation(title) {
      const now = new Date().toISOString();
      const record: EasyConversationRecord = { id: randomUUID(), title, createdAt: now, updatedAt: now };
      await database.update((data) => {
        bucket(data, "easyConversations").push({ ...record, userId });
      });
      return record;
    },

    async getConversation(id) {
      return database.read((data) => {
        const row = bucket(data, "easyConversations")
          .find((entry) => entry.id === id && entry.userId === userId);
        if (!row) return undefined;
        const { userId: _drop, ...rest } = row;
        return rest;
      });
    },

    async renameConversation(id, title) {
      await database.update((data) => {
        const row = bucket(data, "easyConversations")
          .find((entry) => entry.id === id && entry.userId === userId);
        if (row) {
          row.title = title;
          row.updatedAt = new Date().toISOString();
        }
      });
    },

    async removeConversation(id) {
      return database.update((data) => {
        const rows = bucket(data, "easyConversations");
        const at = rows.findIndex((entry) => entry.id === id && entry.userId === userId);
        if (at < 0) return false;
        rows.splice(at, 1);
        // 표는 `on delete cascade` 로 한다. 파일에는 그것이 없으니 손으로 지운다.
        const messages = bucket(data, "easyMessages");
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index]!.conversationId === id) messages.splice(index, 1);
        }
        return true;
      });
    },

    async listMessages(conversationId) {
      if (!await owns(conversationId)) return [];
      return database.read((data) =>
        bucket(data, "easyMessages")
          .filter((row) => row.conversationId === conversationId)
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    },

    async appendMessage(input) {
      if (!await owns(input.conversationId)) {
        throw new Error("대화를 찾을 수 없습니다.");
      }
      const record: EasyMessageRecord = {
        id: randomUUID(),
        conversationId: input.conversationId,
        role: input.role,
        body: input.body ?? "",
        workId: input.workId ?? null,
        createdAt: new Date().toISOString(),
      };
      await database.update((data) => {
        bucket(data, "easyMessages").push(record);
        const conversation = bucket(data, "easyConversations")
          .find((entry) => entry.id === input.conversationId);
        if (conversation) conversation.updatedAt = record.createdAt;
      });
      return record;
    },

    async listWorkIds() {
      return database.read((data) => {
        const mine = new Set(bucket(data, "easyConversations")
          .filter((row) => row.userId === userId)
          .map((row) => row.id));
        return [...new Set(bucket(data, "easyMessages")
          .filter((row) => row.workId && mine.has(row.conversationId))
          .map((row) => row.workId!))];
      });
    },
  };
}

/**
 * 저장소를 고른다.
 *
 * 로컬 파일과 운영 Supabase 는 같은 인터페이스를 채운다. 어느 쪽이든 화면과
 * 흐름은 같은 코드를 탄다 — 두 모드가 다르게 동작하면 로컬에서 확인한 것이
 * 운영에서 확인한 것이 아니게 된다.
 */
export function easyStoreForUser(userId: string): EasyStore {
  return isLocalStoreEnabled() ? localEasyStore(userId) : supabaseEasyStore(userId);
}
