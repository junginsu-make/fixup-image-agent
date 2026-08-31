import { neon } from "@neondatabase/serverless";
import OpenAI from "openai";
import { createHash } from "node:crypto";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

/**
 * 지식의 종류.
 *
 * `redesign` 은 기존 상세페이지를 전사한 텍스트, `sales` 는 판매 원칙이다.
 * 성격이 전혀 달라서 한 통에서 검색하면 판매 원칙을 찾을 때 남의 페이지
 * 문구가 딸려 나온다.
 */
export type KnowledgeKind = "sales" | "redesign";

const KNOWLEDGE_KINDS: KnowledgeKind[] = ["sales", "redesign"];

/**
 * 유사도 하한 기본값.
 *
 * 코사인 유사도는 무관한 문장 쌍에서도 0.1~0.25 언저리가 흔히 나온다.
 * 하한 없이 상위 K건을 그대로 쓰면, 지식이 얇을 때 전혀 무관한 조각이
 * "검증된 판매 지식"이라는 이름표를 달고 프롬프트에 들어간다.
 */
export const DEFAULT_MIN_SIMILARITY = 0.35;

type KnowledgeChunk = {
  content: string;
  sourceName: string;
  chunkIndex: number;
};

export type RetrievedKnowledge = {
  sourceName: string;
  chunkIndex: number;
  content: string;
  similarity: number;
};

let schemaReady = false;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return null;
  return neon(databaseUrl);
}

function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function isRagConfigured() {
  return Boolean(process.env.DATABASE_URL && process.env.OPENAI_API_KEY);
}

/**
 * 모르는 값은 `redesign` 으로 떨어뜨린다.
 *
 * 기존 문서는 전부 리디자인 전사본이다. 판단이 안 될 때 `sales` 로 넘기면
 * 남의 페이지 문구가 판매 원칙 행세를 하게 된다. 안전한 쪽으로 떨어뜨린다.
 */
export function normalizeKnowledgeKind(value: unknown): KnowledgeKind {
  return KNOWLEDGE_KINDS.includes(value as KnowledgeKind) ? (value as KnowledgeKind) : "redesign";
}

/** 유사도 하한 미만을 버린다. 순서는 그대로 둔다(이미 유사도 내림차순이다). */
export function filterByRelevance(
  chunks: readonly RetrievedKnowledge[],
  minSimilarity: number,
): RetrievedKnowledge[] {
  return chunks.filter((chunk) => chunk.similarity >= minSimilarity);
}

export async function ensureRagSchema() {
  const sql = getSql();
  if (!sql || schemaReady) return false;

  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_documents (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name text NOT NULL,
      content_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
      source_name text NOT NULL,
      chunk_index integer NOT NULL,
      content text NOT NULL,
      embedding vector(1536) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
    ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS knowledge_chunks_document_id_idx
    ON knowledge_chunks (document_id)
  `;

  // CREATE TABLE IF NOT EXISTS 는 이미 있는 테이블에 컬럼을 붙이지 않는다.
  // 먼저 만들어진 저장소에도 kind 가 생기도록 따로 붙인다. 기본값이 redesign 이라
  // 기존 행은 전부 리디자인 지식으로 남고, 기존 호출부의 동작은 바뀌지 않는다.
  await sql`
    ALTER TABLE knowledge_documents
    ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'redesign'
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS knowledge_documents_kind_idx
    ON knowledge_documents (kind)
  `;

  schemaReady = true;
  return true;
}

export async function indexKnowledgeDocument({
  name,
  text,
  kind,
}: {
  name: string;
  text: string;
  kind?: KnowledgeKind;
}) {
  const sql = getSql();
  const openai = getOpenAI();
  if (!sql || !openai) {
    return { indexed: false, chunks: 0, reason: "DATABASE_URL 또는 OPENAI_API_KEY가 없습니다." };
  }

  await ensureRagSchema();
  const documentKind = normalizeKnowledgeKind(kind);
  const contentHash = await sha256(`${name}:${text}`);
  const chunks = chunkText(text, name);
  if (chunks.length === 0) return { indexed: false, chunks: 0, reason: "인덱싱할 텍스트가 없습니다." };

  const rows = await sql`
    INSERT INTO knowledge_documents (name, content_hash, kind)
    VALUES (${name}, ${contentHash}, ${documentKind})
    ON CONFLICT (content_hash) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind
    RETURNING id
  `;
  const documentId = rows[0].id as string;

  await sql`DELETE FROM knowledge_chunks WHERE document_id = ${documentId}`;

  for (const chunk of chunks) {
    const embedding = await embedText(openai, chunk.content);
    await sql`
      INSERT INTO knowledge_chunks (document_id, source_name, chunk_index, content, embedding)
      VALUES (${documentId}, ${chunk.sourceName}, ${chunk.chunkIndex}, ${chunk.content}, ${toVector(embedding)}::vector)
    `;
  }

  return { indexed: true, chunks: chunks.length, documentId };
}

export interface RetrieveKnowledgeOptions {
  /** 이 종류의 문서에서만 찾는다. 비우면 종류를 가리지 않는다(기존 동작). */
  kind?: KnowledgeKind;
  /** 이 값 미만의 조각은 버린다. */
  minSimilarity?: number;
}

export async function retrieveKnowledge(
  query: string,
  limit = 8,
  options: RetrieveKnowledgeOptions = {},
): Promise<RetrievedKnowledge[]> {
  const sql = getSql();
  const openai = getOpenAI();
  if (!sql || !openai || !query.trim()) return [];

  await ensureRagSchema();
  const embedding = await embedText(openai, query.slice(0, 8000));
  const vector = toVector(embedding);

  // kind 가 없으면 전체에서 찾는다. 기존 리디자인 호출부가 그대로 돌아야 한다.
  const rows = options.kind
    ? await sql`
        SELECT c.source_name, c.chunk_index, c.content,
               1 - (c.embedding <=> ${vector}::vector) AS similarity
        FROM knowledge_chunks c
        JOIN knowledge_documents d ON d.id = c.document_id
        WHERE d.kind = ${options.kind}
        ORDER BY c.embedding <=> ${vector}::vector
        LIMIT ${limit}
      `
    : await sql`
        SELECT source_name, chunk_index, content,
               1 - (embedding <=> ${vector}::vector) AS similarity
        FROM knowledge_chunks
        ORDER BY embedding <=> ${vector}::vector
        LIMIT ${limit}
      `;

  const chunks = rows.map((row) => ({
    sourceName: row.source_name as string,
    chunkIndex: row.chunk_index as number,
    content: row.content as string,
    similarity: Number(row.similarity)
  }));

  return filterByRelevance(chunks, options.minSimilarity ?? 0);
}

export async function getKnowledgeStats() {
  const sql = getSql();
  if (!sql) return { configured: false, documents: 0, chunks: 0 };

  await ensureRagSchema();
  const rows = await sql`
    SELECT
      (SELECT count(*)::int FROM knowledge_documents) AS documents,
      (SELECT count(*)::int FROM knowledge_chunks) AS chunks,
      (SELECT count(*)::int FROM knowledge_documents WHERE kind = 'sales') AS sales_documents
  `;

  return {
    configured: true,
    documents: Number(rows[0]?.documents || 0),
    chunks: Number(rows[0]?.chunks || 0),
    // 판매 지식이 0건이면 심사 루프가 근거 없이 도는 것이라 따로 센다.
    salesDocuments: Number(rows[0]?.sales_documents || 0)
  };
}

export async function deleteKnowledgeDocument(documentId: string) {
  const sql = getSql();
  if (!sql || !documentId) return { deleted: false };

  await ensureRagSchema();
  const rows = await sql`
    DELETE FROM knowledge_documents
    WHERE id = ${documentId}
    RETURNING id
  `;

  return { deleted: rows.length > 0 };
}

const MAX_CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 220;
const MIN_CHUNK_SIZE = 120;
const MAX_CHUNKS = 80;

/**
 * 문서를 검색 단위로 나눈다.
 *
 * 크기로만 자르면 한 조각에 여러 주제가 섞인다. 섞인 조각의 임베딩은
 * 무엇과도 강하게 맞지 않아서, "반론을 어떻게 다루나"를 물어도 엉뚱한
 * 조각이 나온다. 실제로 그랬다 — 판매 원칙 문서를 1400자로 자르니
 * "대상 고객을 좁히는 방법" 질의가 0건이었다. 문서에 그 절이 통째로
 * 있는데도 그랬다.
 *
 * 그래서 제목(`## `)이 있으면 절 단위로 나눈다. 제목은 조각 안에 남긴다 —
 * 조각만 떼어놓고 임베딩하므로 제목이 없으면 무엇에 관한 글인지 알 수 없다.
 *
 * 제목이 없는 문서(상세페이지를 전사한 텍스트가 그렇다)는 예전처럼 크기로 자른다.
 */
export function chunkText(text: string, sourceName: string): KnowledgeChunk[] {
  const sections = splitByHeading(text);
  const chunks: KnowledgeChunk[] = [];

  for (const section of sections) {
    for (const piece of splitBySize(section)) {
      if (piece.length < MIN_CHUNK_SIZE) continue;
      chunks.push({ content: piece, sourceName, chunkIndex: chunks.length });
      if (chunks.length >= MAX_CHUNKS) return chunks;
    }
  }

  return chunks;
}

/** 마크다운 제목에서 자른다. 제목이 없으면 문서 전체가 한 덩이다. */
function splitByHeading(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const sections = trimmed
    .split(/\n(?=#{1,3} )/)
    .map((section) => section.trim())
    .filter(Boolean);

  return sections.length > 1 ? sections : [trimmed];
}

/**
 * 한 절이 상한을 넘으면 더 자른다. 겹치는 부분을 두어 경계에서 잘린 문장이
 * 양쪽 조각 어디에서도 안 읽히는 일을 막는다.
 */
function splitBySize(section: string): string[] {
  if (section.length <= MAX_CHUNK_SIZE) return [section];

  const pieces: string[] = [];
  for (let start = 0; start < section.length; start += MAX_CHUNK_SIZE - CHUNK_OVERLAP) {
    const piece = section.slice(start, start + MAX_CHUNK_SIZE).trim();
    if (piece) pieces.push(piece);
  }

  return pieces;
}

async function embedText(openai: OpenAI, input: string) {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input,
    dimensions: EMBEDDING_DIMENSIONS
  });
  return response.data[0].embedding;
}

function toVector(values: number[]) {
  return `[${values.join(",")}]`;
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}
