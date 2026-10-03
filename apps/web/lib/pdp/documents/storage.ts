import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sniffImageMime } from "../../image-encoding";
import { assetPath, DOCUMENT_BUCKET, DocumentError, uuid, type DocumentAsset } from "./model";
export interface UploadTicket { uploadUrl?: string; exists?: boolean }
export interface DocumentStorage {
  read?:(asset:DocumentAsset)=>Promise<Buffer>;
  exists(asset: DocumentAsset): Promise<boolean>;
  uploadTicket(asset: DocumentAsset): Promise<UploadTicket>;
  urls(assets: Record<string,DocumentAsset>): Promise<Record<string,string>>;
  removeAll(userId:string,id:string):Promise<void>;
  copy(source:DocumentAsset,target:DocumentAsset):Promise<void>;
}
const pathPattern=/^[a-f0-9-]{36}\/pdp-docs\/[a-f0-9-]{36}\/[a-f0-9]{64}\.(png|jpg|webp)$/;
function safe(asset:DocumentAsset) {
  if(!pathPattern.test(asset.path))throw new DocumentError(400,"그림 경로가 올바르지 않습니다.");
  const [user,,id]=asset.path.split("/");
  if(asset.path!==assetPath(user,id,asset.sha256,asset.mimeType))throw new DocumentError(400,"그림 경로가 올바르지 않습니다.");
}
export function createRemoteDocumentStorage(db:SupabaseClient):DocumentStorage {
  const bucket=()=>db.storage.from(DOCUMENT_BUCKET);
  return {
    async read(asset){
      safe(asset);const {data,error}=await bucket().download(asset.path);
      if(error || !data)throw new DocumentError(503,"그림을 읽지 못했습니다.");
      const bytes=Buffer.from(await data.arrayBuffer());
      if(bytes.length!==asset.bytes || createHash("sha256").update(bytes).digest("hex")!==asset.sha256 ||
        sniffImageMime(bytes,"")!==asset.mimeType)throw new DocumentError(400,"그림 원본이 저장 정보와 다릅니다.");
      return bytes;
    },
    async exists(asset){
      safe(asset);
      const {data,error}=await bucket().info(asset.path);
      if(error){
        if(error.status===404 || String(error.statusCode)==="404")return false;
        throw new DocumentError(503,"그림 업로드 상태를 확인하지 못했습니다.");
      }
      if(data.size!==asset.bytes || data.contentType!==asset.mimeType)throw new DocumentError(400,"업로드한 그림 정보가 일치하지 않습니다.");
      return true;
    },
    async uploadTicket(asset){
      safe(asset);
      const {data,error}=await bucket().createSignedUploadUrl(asset.path,{upsert:false});
      if(error || !data)throw new DocumentError(503,"그림 업로드 주소를 만들지 못했습니다.");
      return {uploadUrl:data.signedUrl};
    },
    async urls(assets){
      const entries=Object.entries(assets);if(!entries.length)return {};
      entries.forEach(([,asset])=>safe(asset));
      const {data,error}=await bucket().createSignedUrls(entries.map(([,a])=>a.path),600);
      if(error || !data)throw new DocumentError(503,"그림을 불러오지 못했습니다.");
      const urls=new Map(data.filter(x=>x.signedUrl && !x.error).map(x=>[x.path,x.signedUrl!]));
      return Object.fromEntries(entries.flatMap(([key,a])=>urls.has(a.path)?[[key,urls.get(a.path)!]]:[]));
    },
    async removeAll(userId,id){
      uuid.parse(userId);uuid.parse(id);const prefix=`${userId}/pdp-docs/${id}`;
      const removedNames=new Set<string>();
      for(let page=0;page<100;page++){
        const {data,error}=await bucket().list(prefix,{limit:100,offset:0});
        if(error)throw new DocumentError(503,"그림을 정리하지 못했습니다.");
        if(!data?.length)return;
        if(data.some(x=>!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(x.name)))throw new DocumentError(400,"그림 경로를 확인해야 합니다.");
        if(data.some(x=>removedNames.has(x.name)))throw new DocumentError(503,"그림 정리가 진행되지 않았습니다. 잠시 뒤 다시 시도해 주세요.");
        const removed=await bucket().remove(data.map(x=>prefix+"/"+x.name));
        if(removed.error)throw new DocumentError(503,"그림을 정리하지 못했습니다.");
        data.forEach(x=>removedNames.add(x.name));
      }
      throw new DocumentError(503,"남은 그림 정리를 위해 삭제를 다시 시도해 주세요.");
    },
    async copy(source,target){
      safe(source);safe(target);
      const {error}=await bucket().copy(source.path,target.path);
      if(error)throw new DocumentError(503,"그림을 복사하지 못했습니다.");
    },
  };
}
export function createLocalDocumentStorage(root:string):DocumentStorage & {
  upload(asset:DocumentAsset,bytes:Buffer):Promise<void>;read(asset:DocumentAsset):Promise<Buffer>;
} {
  const file=(asset:DocumentAsset)=>{safe(asset);return path.join(root,"pdp-document-assets",...asset.path.split("/"));};
  const validate=(asset:DocumentAsset,bytes:Buffer)=>{
    if(bytes.length!==asset.bytes || createHash("sha256").update(bytes).digest("hex")!==asset.sha256 ||
       sniffImageMime(bytes,"")!==asset.mimeType)throw new DocumentError(400,"그림 내용이 올바르지 않습니다.");
  };
  return {
    async exists(asset){
      try{const bytes=readFileSync(file(asset));validate(asset,bytes);return true;}
      catch(e){if((e as NodeJS.ErrnoException).code==="ENOENT")return false;throw e;}
    },
    async uploadTicket(asset){
      safe(asset);const id=asset.path.split("/")[2];
      return {uploadUrl:`/api/pdp/documents/${id}/assets/file?sha256=${asset.sha256}&mimeType=${encodeURIComponent(asset.mimeType)}&bytes=${asset.bytes}`};
    },
    async upload(asset,bytes){
      validate(asset,bytes);const target=file(asset);
      mkdirSync(path.dirname(target),{recursive:true});
      try{writeFileSync(target,bytes,{flag:"wx"});}
      catch(e){if((e as NodeJS.ErrnoException).code!=="EEXIST")throw e;validate(asset,readFileSync(target));}
    },
    async read(asset){const bytes=readFileSync(file(asset));validate(asset,bytes);return bytes;},
    async urls(assets){
      return Object.fromEntries(Object.entries(assets).map(([key,asset])=>{
        safe(asset);const id=asset.path.split("/")[2];
        return [key,`/api/pdp/documents/${id}/assets/file?sha256=${asset.sha256}&mimeType=${encodeURIComponent(asset.mimeType)}&bytes=${asset.bytes}`];
      }));
    },
    async removeAll(userId,id){
      uuid.parse(userId);uuid.parse(id);
      const directory=path.join(root,"pdp-document-assets",userId,"pdp-docs",id);
      if(!existsSync(directory))return;
      for(const name of readdirSync(directory)){
        if(!/^[a-f0-9]{64}\.(png|jpg|webp)$/.test(name))throw new DocumentError(400,"그림 경로를 확인해야 합니다.");
        unlinkSync(path.join(directory,name));
      }
    },
    async copy(source,target){
      const bytes=readFileSync(file(source));validate(source,bytes);validate(target,bytes);
      const dest=file(target);mkdirSync(path.dirname(dest),{recursive:true});writeFileSync(dest,bytes,{flag:"wx"});
    },
  };
}
