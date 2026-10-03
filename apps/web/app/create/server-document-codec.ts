import { createPdpDocument, documentToDraft, type PdpDocumentV3 } from "./document-state";
import type { PdpDraftInput } from "./pdp-drafts";
import { assetPath, ASSET_BYTES_LIMIT, DocumentError, validateDocument, type DocumentAsset, type Json, type JsonObject, type ServerDocument } from "../../lib/pdp/documents/model";

export const bytesFromBase64=(value:string)=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export function base64FromBytes(bytes:Uint8Array):string{
  let binary="";for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(binary);
}
export async function sha256(bytes:Uint8Array):Promise<string>{
  const hash=await crypto.subtle.digest("SHA-256",new Uint8Array(bytes));
  return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
function mimeOf(bytes:Uint8Array):DocumentAsset["mimeType"]{
  if(bytes[0]===137 && bytes[1]===80 && bytes[2]===78 && bytes[3]===71)return "image/png";
  if(bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return "image/jpeg";
  if(String.fromCharCode(...bytes.subarray(0,4))==="RIFF" && String.fromCharCode(...bytes.subarray(8,12))==="WEBP")return "image/webp";
  throw new DocumentError(400,"저장할 그림을 읽지 못했습니다. PNG·JPEG·WebP 원본을 다시 확인해 주세요.");
}
export interface AssetUpload { asset:DocumentAsset; bytes:Uint8Array }
/** 서버 제목 한도(300)는 UTF-16 길이다. 그 안에서 글자 단위로 잘라 이모지를 반으로 가르지 않는다. */
function clipTitle(text:string,limit=300):string{
  let clipped="";
  for(const character of text){if(clipped.length+character.length>limit)break;clipped+=character;}
  return clipped;
}
export async function encodeServerDocument(input:PdpDraftInput,userId:string,id:string):Promise<{document:ServerDocument;uploads:AssetUpload[]}>{
  const v3=createPdpDocument({...input,id});
  const emptyOriginal=Boolean(input.result && !input.result.originalImage);
  if(emptyOriginal && v3.originalAssetId){
    delete v3.assets[v3.originalAssetId];delete v3.originalAssetId;
  }
  const manifest:Record<string,DocumentAsset>={},uploads:AssetUpload[]=[],byContent=new Map<string,string>(),byHash=new Map<string,string>();
  async function intern(base64:string,key?:string,fileName?:string){
    base64=base64.replace(/^data:image\/(?:png|jpeg|webp);base64,/,"");
    const known=byContent.get(base64);
    if(known){if(key)manifest[key]={...manifest[known],...(fileName?{fileName}:{})};return key??known;}
    let bytes:Uint8Array;try{bytes=bytesFromBase64(base64);}catch{throw new DocumentError(400,"그림 데이터를 읽지 못했습니다.");}
    if(!bytes.length || bytes.length>ASSET_BYTES_LIMIT)throw new DocumentError(400,"그림 한 장은 20MB 이하여야 합니다.");
    const mimeType=mimeOf(bytes),hash=await sha256(bytes),assetId=key??hash;
    const legacyHash=[...new Uint8Array(await crypto.subtle.digest("SHA-1",new Uint8Array(bytes)))].map(x=>x.toString(16).padStart(2,"0")).join("");
    const asset:DocumentAsset={path:assetPath(userId,id,hash,mimeType),sha256:hash,legacyHash,bytes:bytes.length,mimeType,...(fileName?{fileName}:{})};
    manifest[assetId]=asset;byContent.set(base64,assetId);
    if(!byHash.has(hash)){uploads.push({asset,bytes});byHash.set(hash,assetId);}
    return assetId;
  }
  for(const [key,asset] of Object.entries(v3.assets))await intern(asset.base64,key,asset.fileName);
  async function pack(value:unknown,key="",parent:Record<string,unknown>={}):Promise<Json>{
    if(value===undefined)return null;
    if(value===null || typeof value==="number" || typeof value==="boolean")return value;
    if(typeof value==="string"){
      if(!value)return value;
      if(/^data:image\/(?:png|jpeg|webp);base64,/.test(value))return {$asset:await intern(value),format:"dataUrl"};
      if(["base64","imageBase64","originalImage"].includes(key))return {$asset:await intern(value),format:"base64"};
      if(["generatedImage","previewUrl"].includes(key)){
        const match=/^data:image\/(?:png|jpeg|webp);base64,([\s\S]+)$/.exec(value);
        const raw=match?.[1]??(key==="previewUrl" && typeof parent.base64==="string"?parent.base64:undefined);
        if(!raw)throw new DocumentError(400,"원본 그림이 없는 주소는 저장할 수 없습니다. 그림을 다시 불러와 주세요.");
        return {$asset:await intern(raw),format:"dataUrl"};
      }
      return value;
    }
    if(Array.isArray(value)){const result:Json[]=[];for(const item of value)result.push(await pack(item));return result;}
    if(typeof value==="object"){
      const object=value as Record<string,unknown>,entries:Array<[string,Json]>=[];
      for(const [name,item] of Object.entries(object)){if(item!==undefined)entries.push([name,await pack(item,name,object)]);}
      return Object.fromEntries(entries);
    }
    throw new DocumentError(400,"작업에 저장할 수 없는 값이 있습니다.");
  }
  const {schemaVersion:_version,id:_id,title:_title,sourceMode,stage,assets:_assets,...rest}=v3;
  // 옛 S1 번호와 편집 레이어 열쇠까지 그대로 둔다. 저장하면서 임의 UUID로 바꾸지 않는다.
  const sections=input.editorState?.sections.length?input.editorState.sections:input.result?.blueprint.sections??input.textDraft?.blueprint?.sections??[];
  const {sections:_editorSections,sectionKeys:editorKeys,...editor}=input.editorState??{sections:[],sectionKeys:[]};
  const body=await pack({...rest,sections,editor:input.editorState?editor:null,
    originalAppState:input.appState,editorKeys,
    ...(emptyOriginal?{emptyOriginal:true}:{}),
    attachmentFileNames:{product:input.preparedImage?.fileName??null,person:input.modelImage?.fileName??null}}) as JsonObject;
  const title=clipTitle(input.result?.blueprint.sections[0]?.section_name??input.preparedImage?.fileName??"상세페이지 작업");
  const document:ServerDocument={schemaVersion:3,id,title,sourceMode:sourceMode==="text"?"text":"image",stage,assets:manifest,body};
  validateDocument(document,userId,id);
  return {document,uploads};
}
export async function decodeServerDocument(document:ServerDocument,load:(asset:DocumentAsset)=>Promise<Uint8Array>):Promise<PdpDraftInput>{
  const encoded=new Map<string,string>(),assets:PdpDocumentV3["assets"]=Object.create(null);
  for(const [key,asset] of Object.entries(document.assets)){
    let base64=encoded.get(asset.sha256);
    if(!base64){
      const bytes=await load(asset);
      if(bytes.length!==asset.bytes || await sha256(bytes)!==asset.sha256 || mimeOf(bytes)!==asset.mimeType)throw new Error("그림 원본이 저장 정보와 다릅니다.");
      base64=base64FromBytes(bytes);encoded.set(asset.sha256,base64);
    }
    assets[key]={id:key,base64,mimeType:asset.mimeType,...(asset.fileName?{fileName:asset.fileName}:{})};
  }
  function unpack(node:Json):Json{
    if(!node || typeof node!=="object")return node;
    if(Array.isArray(node))return node.map(unpack);
    if("$asset" in node){
      const asset=assets[String(node.$asset)];if(!asset)throw new DocumentError(400,"그림이 누락됐습니다.");
      return node.format==="base64"?asset.base64:`data:${asset.mimeType};base64,${asset.base64}`;
    }
    return Object.fromEntries(Object.entries(node).map(([key,value])=>[key,unpack(value)]));
  }
  const body=unpack(document.body) as JsonObject;
  const doc={...body,schemaVersion:3,id:document.id,title:document.title,stage:document.stage,sourceMode:document.sourceMode,assets} as unknown as PdpDocumentV3;
  if(body.emptyOriginal===true){
    doc.originalAssetId="empty-original";
    doc.assets["empty-original"]={id:"empty-original",base64:"",mimeType:"image/jpeg"};
  }
  const result=documentToDraft(doc);
  const names=body.attachmentFileNames;
  if(names && typeof names==="object" && !Array.isArray(names)){
    if(result.preparedImage && typeof names.product==="string")result.preparedImage.fileName=names.product;
    if(result.modelImage && typeof names.person==="string")result.modelImage.fileName=names.person;
  }
  if(typeof body.originalAppState==="string")result.appState=body.originalAppState as PdpDraftInput["appState"];
  if(result.editorState && Array.isArray(body.editorKeys))result.editorState.sectionKeys=body.editorKeys as string[];
  return result;
}
