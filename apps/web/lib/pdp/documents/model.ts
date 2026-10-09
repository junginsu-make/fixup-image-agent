import { z } from "zod";
import { PRODUCT_IDS, PRODUCT_LIMITS } from "@fixup/pdp-core";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export const DOCUMENT_JSON_LIMIT = 1024 * 1024;
/** PostgreSQL jsonb::text와 같은 UTF-8 크기(쉼표/콜론 뒤 공백, 지수의 십진 표기). */
export function documentJsonBytes(value: unknown): number {
  const bytes=(text:string)=>new TextEncoder().encode(text).length;
  function count(node:unknown):number {
    if(Array.isArray(node))return 2+Math.max(0,node.length-1)*2+node.reduce((sum,x)=>sum+count(x),0);
    if(node!==null && typeof node==="object"){
      const entries=Object.entries(node);
      return 2+Math.max(0,entries.length-1)*2+entries.reduce((sum,[key,x])=>sum+bytes(JSON.stringify(key))+2+count(x),0);
    }
    const text=JSON.stringify(node);
    if(typeof node!=="number" || !/[eE]/.test(text))return bytes(text);
    const [mantissa,exponent]=text.split("e"),negative=mantissa.startsWith("-");
    const digits=mantissa.replace("-","").replace(".","");
    const point=(mantissa.replace("-","").split(".")[0].length)+Number(exponent);
    return (negative?1:0)+(point<=0?2-point+digits.length:point>=digits.length?point:digits.length+1);
  }
  return count(value);
}
export const ASSET_BYTES_LIMIT = 20 * 1024 * 1024;
export const DOCUMENT_BUCKET = "pdp-documents";
export const uuid = z.string().uuid();
export const assetSchema = z.object({
  path: z.string().max(240), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(ASSET_BYTES_LIMIT),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  fileName: z.string().max(300).optional(),
  legacyHash: z.string().regex(/^[a-f0-9]{40}$/).optional(),
}).strict();
export type DocumentAsset = z.infer<typeof assetSchema>;
const imageReference=z.object({$asset:z.string(),format:z.enum(["base64","dataUrl"])}).strict();
/*
  제품 칸(설계 2026-10-08 §3.2)의 값도 모양을 본다(보안 리뷰 L5). `.passthrough()` 라 선언하지 않으면
  무엇이든 지나간다. 이름은 화면이 코드 포인트 30자로 자르므로 UTF-16 으로 60 까지 받는다. 없으면 옛 문서다.
*/
const productIdField=z.enum(PRODUCT_IDS);
const productNameField=z.string().max(PRODUCT_LIMITS.nameChars*2);
const bodySchema=z.object({
  sections:z.array(z.object({
    section_id:z.string().min(1).max(120),section_name:z.string().optional(),
    headline:z.string().optional(),prompt_ko:z.string().optional(),prompt_en:z.string().optional(),
    generatedImage:imageReference.or(z.literal("")).optional(),
  }).passthrough()).max(30),
  references:z.array(z.object({role:z.enum(["product","person","character","style"]),assetId:z.string().min(1),enabled:z.boolean(),
    productId:productIdField.optional(),productName:productNameField.optional(),
    photoIndex:z.number().int().min(0).max(PRODUCT_LIMITS.photos-1).optional()}).passthrough()).max(200).default([]),
  productSlots:z.array(z.object({id:productIdField,name:productNameField}).passthrough()).max(PRODUCT_LIMITS.products).optional(),
  planningProductsKey:z.string().max(4000).optional(),
  inputs:z.object({additionalInfo:z.string().default("")}).passthrough().default({additionalInfo:""}),
  settings:z.object({desiredTone:z.string().default(""),aspectRatio:z.enum(["1:1","3:4","4:3","9:16","16:9"]).default("9:16")}).passthrough().default({desiredTone:"",aspectRatio:"9:16"}),
  blueprint:z.record(z.string(),z.json()).default({}),
  editor:z.record(z.string(),z.json()).nullable().default(null),
  notice:z.string().default(""),
}).passthrough();
export const documentSchema = z.object({
  schemaVersion: z.literal(3), id: uuid, title: z.string().max(300),
  sourceMode: z.enum(["image", "text"]),
  stage: z.enum(["input", "planning", "outline", "evidence", "key_visual", "generating", "review", "editor"]),
  assets: z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), assetSchema),
  // v3의 나머지 필드. 그림 문자열은 {$asset, format} 참조로 바꾼다.
  body: z.record(z.string(), z.json()),
}).strict();
export type ServerDocument = z.infer<typeof documentSchema>;
export interface DocumentRecord {
  id: string; userId: string; revision: number; document: ServerDocument | null;
  sourceDraftId: string | null; createdAt: string; updatedAt: string;
  deletedAt: string | null; lastRequestId: string | null;
  cleanupPending?:boolean;
  /** 지운 사람(2026-10-08). 회원이 지우면 문서는 남고 관리자가 확인한다 — 6개월 뒤 파기. */
  deletedBy?:string|null;
  /** 관리자 사본의 원래 회원. 서버만 적고, 그 회원이 떠날 때 사본도 지운다. */
  copiedFromOwner?:string|null;
  /** 이 문서가 한 번이라도 가졌던 섹션 그림 지문(오래 전 것부터). 서버가 저장할 때만 더한다(`heldImageTagsAfter`). */
  heldImageTags?:string[];
}
export type DocumentCopy = Pick<DocumentRecord, "id" | "userId" | "sourceDraftId">;
export interface DocumentRevision { revision: number; createdAt: string }
export interface DocumentSummary extends Omit<DocumentRecord, "document" | "lastRequestId" | "deletedAt"> {
  /** 회원이 지운 때. 관리자 목록에만 온다(`list(null,{includeDeleted:true})`). */
  deletedAt?: string | null;
  imageTags?: string[];
  title: string; stage: string; sectionCount:number; aspectRatio:string|null; imageCount: number; cover: DocumentAsset | null;
}
export class DocumentError extends Error {
  constructor(public status: number, message: string, public current?: DocumentRecord) { super(message); }
}
export const notFound = () => new DocumentError(404, "작업을 찾지 못했습니다.");
/**
 * 문서가 가졌던 그림 지문 — 지난 목록에 이번 문서의 섹션 그림 지문을 더한다(최종 리뷰 M1).
 * 다시 본 지문은 가장 최근으로 옮기고, 최근 500개만 남긴다(마이그레이션 `pdp_held_image_tags` 와 같은 규칙).
 */
export const HELD_IMAGE_TAG_LIMIT = 500;
export function heldImageTagsAfter(previous: readonly string[], current: readonly string[]): string[] {
  const seen = [...previous, ...current];
  return seen.filter((tag, index) => seen.lastIndexOf(tag) === index).slice(-HELD_IMAGE_TAG_LIMIT);
}
// 보관 지점은 버전이 새로운 5개만 남는다. 곧바로 밀려날 옛 버전 보관을 「보관됨」으로 답하지 않는다.
export const PIN_LIMIT = 5;
export const pinLimitError = () => new DocumentError(409, "더 최근에 보관한 버전이 5개 있어 이 버전은 보관할 수 없습니다.");
// PostgreSQL jsonb 는 NUL 과 짝 없는 서로게이트를 받지 않는다. DB 오류(503) 대신 검증에서 400 으로 거절한다.
export const UNSAFE_CHARACTERS_MESSAGE = "저장할 수 없는 문자가 있습니다.";
export const hasUnsafeCharacters = (text: string) => text.includes("\u0000") || /\p{Cs}/u.test(text);
export function assetPath(userId: string, documentId: string, hash: string, mimeType: DocumentAsset["mimeType"]) {
  uuid.parse(userId); uuid.parse(documentId);
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new DocumentError(400, "그림 정보가 올바르지 않습니다.");
  return `${userId}/pdp-docs/${documentId}/${hash}.${mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp"}`;
}
// 화면 글(「Data: 국내산 100%」 「Data:2026/10, 국내 출시」)은 통과시키고 브라우저가 그림으로 여는 문자열만 막는다.
const zeroWidth=new Set(["\u180e","\u200b","\u200c","\u200d","\u2060","\ufeff"]);
const invisible=(c:string)=>c.charCodeAt(0)<=0x20 || /\s/.test(c) || zeroWidth.has(c);
function trimInvisible(value:string):string{
  let start=0,end=value.length;
  while(start<end && invisible(value[start]))start++;
  while(end>start && invisible(value[end-1]))end--;
  return value.slice(start,end);
}
// data URL(RFC 2397): 매체형은 글자로 시작하는 진짜 낱말(`image/png`). 브라우저는 형식 뒤·매개변수 안의 빈칸을
// 받아 그림으로 연다(`data:image/png; base64,…`) — 매개변수는 쉼표 앞까지 무엇이든 본다(최종 리뷰 2차).
// 콜론 뒤 빈칸은 그림 형식(`data: image/png;…`)일 때만 본다 — 「Data: CD/DVD, 블루레이」 같은 글은 막지 않는다.
// 매체형이 없으면 매개변수가 있는 꼴(`data:;base64,`)이거나, `data:,` 바로 뒤에 내용이 붙은 꼴만 본다.
const typedDataUrl=/^data:[a-z][\w.+-]*\/[a-z0-9][\w.+-]*\s*(?:;[^,]*)?,/i;
const imageDataUrl=/^data:\s*image\/[\w.+-]+\s*(?:;[^,]*)?,/i;
const untypedDataUrl=/^data:(?:(?:;[^\s;,]+)+,|,\S)/i;
const base64Token=/^[A-Za-z0-9+/_-]+={0,2}$/;
const mimeBase64Line=/^[A-Za-z0-9+/]+={0,2}$/;
/** 메일·PEM 처럼 같은 너비(60~76자, 4의 배수)로 끊은 표준 base64 — 줄은 이 꼴일 때만 이어 본다. 품번 목록 같은 글은 잇지 않는다. */
function isWrappedBase64(text:string):boolean{
  const lines=text.split(/\r?\n/),width=lines[0]?.length??0,last=lines.length-1;
  if(lines.length<2 || width<60 || width>76 || width%4!==0)return false;
  return lines.every((line,index)=>mimeBase64Line.test(line) && (index===last?line.length<=width:line.length===width && !line.endsWith("=")));
}
export function isInlineImageText(value:string):boolean{
  // URL 파서처럼 탭·줄바꿈을 지우고 앞뒤의 공백·제어·제로폭 문자를 뗀 뒤 data URL 을 본다.
  const url=trimInvisible(value.replace(/[\t\n\r]/g,""));
  if(typedDataUrl.test(url) || imageDataUrl.test(url) || untypedDataUrl.test(url))return true;
  // 긴 base64(2,048자 넘게 ≈ 1.5KB 넘는 바이트): 한 덩어리(표준·URL-safe)이거나, 같은 너비로 끊은 줄.
  const text=trimInvisible(value);
  return text.length>2048 && (base64Token.test(text) || isWrappedBase64(text));
}
/** 화면에 보이는 칸 이름. 내부 열쇠 이름은 안내에 내보내지 않는다(모르는 칸은 「작업 내용」). */
const FIELD_LABELS=new Map([["title","작업 제목"],["section_name","섹션 이름"],["goal","목표"],["headline","헤드라인"],
  ["subheadline","서브헤드라인"],["bullets","강조 문구"],["trust_or_objection_line","신뢰·반론 문구"],["CTA","행동 유도 문구"],
  ["prompt_ko","이미지 방향"],["layout_notes","레이아웃 메모"],["additionalInfo","추가 정보"],["desiredTone","원하는 분위기"],["notice","안내 문구"]]);
/** 막힌 글이 어디 있는지 — 「편집 화면」·「섹션 N」·칸 이름. 사용자가 무엇을 고칠지 안다(최종 리뷰 L1). */
function fieldLocation(path:ReadonlyArray<string|number>):string{
  const sectionAt=path.findIndex((key,index)=>key==="sections" && typeof path[index+1]==="number");
  const named=path.flatMap(key=>typeof key==="string" && FIELD_LABELS.has(key)?[FIELD_LABELS.get(key)!]:[]).at(-1);
  const parts=[path.includes("editor")?"편집 화면":null,sectionAt>=0?`섹션 ${Number(path[sectionAt+1])+1}`:null,named??null];
  return parts.filter(Boolean).join(" · ") || "작업 내용";
}
const inlineImageError=(path:ReadonlyArray<string|number>)=>new DocumentError(400,
  `「${fieldLocation(path)}」의 글이 그림 데이터로 읽혀 저장하지 못했습니다. 이 글을 고쳐 주세요. 그림은 먼저 업로드해야 합니다.`);
export function validateDocument(value: unknown, userId: string, id: string): ServerDocument {
  // z.json()도 재귀하므로 그 검증을 시작하기 전에 깊이를 제한한다.
  function checkDepth(node:unknown,depth=0):void{
    if(depth>40)throw new DocumentError(400,"작업 구조가 너무 깊습니다.");
    if(node && typeof node==="object"){
      for(const child of Array.isArray(node)?node:Object.values(node))checkDepth(child,depth+1);
    }
  }
  checkDepth(value);
  const parsed = documentSchema.safeParse(value);
  if (!parsed.success || parsed.data.id !== id) throw new DocumentError(400, "작업 형식이 올바르지 않습니다.");
  const doc = parsed.data;
  const body=bodySchema.safeParse(doc.body);
  if(!body.success)throw new DocumentError(400,"작업 내용이 올바르지 않습니다.");
  // 기본값은 불완전한 옛 메타데이터를 읽을 때도 화면의 필수 문자열을 지킨다.
  doc.body=body.data as Record<string,Json>;
  if (documentJsonBytes(doc) > DOCUMENT_JSON_LIMIT) throw new DocumentError(413, "작업 정보가 너무 큽니다.");
  if (Object.keys(doc.assets).length > 200) throw new DocumentError(400, "그림이 너무 많습니다.");
  for (const asset of Object.values(doc.assets)) {
    if (asset.path !== assetPath(userId, id, asset.sha256, asset.mimeType)) throw new DocumentError(400, "그림 경로가 올바르지 않습니다.");
  }
  function visit(node: Json, depth = 0, path: ReadonlyArray<string|number> = []): void {
    if (depth > 40) throw new DocumentError(400, "작업 구조가 너무 깊습니다.");
    if(typeof node==="string" && hasUnsafeCharacters(node))throw new DocumentError(400,UNSAFE_CHARACTERS_MESSAGE);
    if(typeof node==="string" && isInlineImageText(node))throw inlineImageError(path);
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((x, index) => visit(x, depth + 1, [...path, index])); return; }
    if ("$asset" in node) {
      if (typeof node.$asset !== "string" || !Object.hasOwn(doc.assets,node.$asset) ||
          !["base64", "dataUrl"].includes(String(node.format)) || Object.keys(node).length !== 2) {
        throw new DocumentError(400, "그림 연결이 올바르지 않습니다.");
      }
      return;
    }
    for (const [key, entry] of Object.entries(node)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) throw new DocumentError(400, "작업 형식이 올바르지 않습니다.");
      if (hasUnsafeCharacters(key)) throw new DocumentError(400, UNSAFE_CHARACTERS_MESSAGE);
      if (["base64", "imageBase64", "originalImage", "generatedImage", "previewUrl"].includes(key) && typeof entry === "string" && entry) {
        throw new DocumentError(400, "그림은 먼저 업로드해야 합니다.");
      }
      visit(entry, depth + 1, [...path, key]);
    }
  }
  visit(doc as unknown as Json);
  for(const ref of body.data.references){
    if(ref.role!=="character" && !Object.hasOwn(doc.assets,ref.assetId))throw new DocumentError(400,"첨부 그림이 누락됐습니다.");
    // 제품 원본(설계 2026-10-08 §4.6): 참조 안의 `originalAssetId` 도 문서에 실린 그림이어야 한다.
    const originalId=(ref as {originalAssetId?:unknown}).originalAssetId;
    if(originalId!==undefined && (typeof originalId!=="string" || !Object.hasOwn(doc.assets,originalId)))throw new DocumentError(400,"첨부 그림이 누락됐습니다.");
  }
  if(typeof doc.body.originalAssetId==="string" && !Object.hasOwn(doc.assets,doc.body.originalAssetId))throw new DocumentError(400,"원본 그림이 누락됐습니다.");
  if (!Array.isArray(doc.body.sections) || doc.body.sections.length > 30) throw new DocumentError(400, "섹션 정보가 올바르지 않습니다.");
  return doc;
}
export function summarize(record: DocumentRecord): DocumentSummary {
  const doc = record.document!;
  const sections = (doc.body.sections ?? []) as Array<Record<string, Json>>;
  const settings=doc.body.settings as Record<string,Json>|undefined;
  const images = sections.flatMap(section => {
    const ref = section.generatedImage as { $asset?: string } | undefined;
    return ref?.$asset && Object.hasOwn(doc.assets,ref.$asset) ? [doc.assets[ref.$asset]] : [];
  });
  return { id: record.id, userId: record.userId, revision: record.revision, sourceDraftId: record.sourceDraftId,
    createdAt: record.createdAt, updatedAt: record.updatedAt, title: doc.title, stage: doc.stage,
    sectionCount:sections.length,aspectRatio:typeof settings?.aspectRatio==="string"?settings.aspectRatio:null,
    imageCount: images.length, cover: images[0] ?? null,
    imageTags:images.flatMap(a=>a.legacyHash?[a.legacyHash.slice(0,8)]:[]), heldImageTags:record.heldImageTags ?? [] };
}
