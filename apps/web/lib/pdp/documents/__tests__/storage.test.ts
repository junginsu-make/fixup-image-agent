import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLocalDocumentStorage, createRemoteDocumentStorage } from "../storage";
import { assetPath, DOCUMENT_BUCKET } from "../model";
const user="11111111-1111-4111-8111-111111111111",id="33333333-3333-4333-8333-333333333333";
const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==","base64");
const hash=createHash("sha256").update(bytes).digest("hex");
const asset={sha256:hash,bytes:bytes.length,mimeType:"image/png" as const,path:assetPath(user,id,hash,"image/png")};
const roots:string[]=[];
afterEach(()=>{for(const r of roots.splice(0)){if(!r.startsWith(join(tmpdir(),"pdp-storage-")))throw Error("unsafe");rmSync(r,{recursive:true,force:true});}});
describe("문서 그림 원본과 경로",()=>{
  it("SDK의 HTTP 404는 새 파일 업로드로, 권한 오류는 실패로 구분한다",async()=>{
    const info=vi.fn().mockResolvedValueOnce({data:null,error:{status:404}})
      .mockResolvedValueOnce({data:null,error:{status:403}});
    const s=createRemoteDocumentStorage({storage:{from:()=>({info})}} as never);
    expect(await s.exists(asset)).toBe(false);
    await expect(s.exists(asset)).rejects.toMatchObject({status:503});
  });
  it("삭제가 진행되지 않는 원격 저장소를 무한 반복하지 않는다",async()=>{
    const page={data:[{name:asset.path.split("/").at(-1)}],error:null};
    const bucket={list:vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(page).mockRejectedValue(new Error("시험 중단")),
      remove:vi.fn(async()=>({data:[],error:null}))};
    const s=createRemoteDocumentStorage({storage:{from:()=>bucket}} as never);
    await expect(s.removeAll(user,id)).rejects.toMatchObject({status:503});
    expect(bucket.remove).toHaveBeenCalledTimes(1);
    expect(bucket.list).toHaveBeenCalledTimes(2);
  });
  it("원본 바이트를 그대로 보관하고 변조된 바이트는 거절한다",async()=>{
    const root=mkdtempSync(join(tmpdir(),"pdp-storage-"));roots.push(root);const s=createLocalDocumentStorage(root);
    await s.upload(asset,bytes);await s.upload(asset,bytes);
    expect(await s.read(asset)).toEqual(bytes);
    await expect(s.upload(asset,Buffer.alloc(bytes.length))).rejects.toMatchObject({status:400});
    await expect(s.exists({...asset,path:asset.path.replace("/pdp-docs/","/../")})).rejects.toMatchObject({status:400});
    await s.removeAll(user,id);expect(await s.exists(asset)).toBe(false);
  });
  it("원격 업로드는 덮어쓰기를 허용하지 않고 별도 비공개 버킷을 쓴다",async()=>{
    const bucket={createSignedUploadUrl:vi.fn(async()=>({data:{signedUrl:"https://storage/signed"},error:null}))};
    const db={storage:{from:vi.fn(()=>bucket)}};const s=createRemoteDocumentStorage(db as never);
    await s.uploadTicket(asset);
    expect(db.storage.from).toHaveBeenCalledWith(DOCUMENT_BUCKET);
    expect(bucket.createSignedUploadUrl).toHaveBeenCalledWith(asset.path,{upsert:false});
  });
  it("크기·형식이 다른 파일은 업로드 완료로 취급하지 않는다",async()=>{
    const bucket={info:vi.fn(async()=>({data:{size:2,contentType:"image/png"},error:null}))};
    const s=createRemoteDocumentStorage({storage:{from:()=>bucket}} as never);
    await expect(s.exists(asset)).rejects.toMatchObject({status:400});
  });
  it("F14: 한 그림 서명이 실패해도 다른 그림 주소는 반환한다",async()=>{
    const bad={...asset,sha256:"a".repeat(64),path:assetPath(user,id,"a".repeat(64),"image/png")};
    const bucket={createSignedUrls:vi.fn(async()=>({data:[{path:asset.path,signedUrl:"signed:good"},{path:bad.path,error:"missing"}],error:null}))};
    const s=createRemoteDocumentStorage({storage:{from:()=>bucket}} as never);
    expect(await s.urls({good:asset,bad})).toEqual({good:"signed:good"});
  });
});
