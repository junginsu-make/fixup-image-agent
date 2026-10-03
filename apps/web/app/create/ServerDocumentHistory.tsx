"use client";
import { useState } from "react";
import type { DocumentRevision } from "../../lib/pdp/documents/model";
export function ServerDocumentHistory({id,onRestore}:{id:string;onRestore:(revision:number)=>Promise<unknown>}){
  const [versions,setVersions]=useState<DocumentRevision[]|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  async function read(){
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/pdp/documents/"+id+"/revisions",{cache:"no-store"});
      const body=await response.json();
      if(!response.ok || !body.ok)throw new Error("이전 버전을 불러오지 못했습니다.");
      setVersions(body.revisions);
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  return <div className="mb-3 rounded-md border p-3 text-sm">
    <button type="button" disabled={busy} onClick={()=>void read()} className="underline">이전 버전 보기</button>
    {versions?.length===0?<span className="ml-3">아직 이전 버전이 없습니다.</span>:null}
    {versions?.length?<select aria-label="되돌릴 버전" value="" disabled={busy} onChange={event=>{
      const revision=Number(event.target.value);if(!revision)return;
      if(!window.confirm("선택한 버전으로 되돌릴까요? 지금 저장된 내용도 이전 버전으로 남습니다."))return;
      setBusy(true);void onRestore(revision).finally(()=>{setBusy(false);setVersions(null);});
    }} className="ml-3 rounded border p-1">
      <option value="">되돌릴 버전을 선택하세요</option>
      {versions.map(v=><option key={v.revision} value={v.revision}>{v.revision}번째 저장 · {new Date(v.createdAt).toLocaleString("ko-KR")}</option>)}
    </select>:null}
    {message?<p role="alert">{message}</p>:null}
  </div>;
}
