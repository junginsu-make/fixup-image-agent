"use client";
import {useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import type {DocumentRecord} from "../../../../lib/pdp/documents/model";
import {documentImages} from "../../document-works";
import {ThumbImage} from "../../../_components/thumb-image";
export function DocumentInspector({id,owner}:{id:string;owner:string}){
  const router=useRouter(),target=useRef<string|null>(null);
  const [record,setRecord]=useState<DocumentRecord|null>(null),[urls,setUrls]=useState<Record<string,string>>({});
  const [error,setError]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{
    let alive=true;
    void fetch(`/api/admin/pdp-documents/${id}?owner=${encodeURIComponent(owner)}`,{cache:"no-store"})
      .then(async response=>{const body=await response.json();if(!response.ok || !body.ok)throw Error(body.message??"작업을 읽지 못했습니다.");
        if(alive){setRecord(body.record);setUrls(body.urls);}})
      .catch(e=>{if(alive)setError((e as Error).message);});
    return()=>{alive=false;};
  },[id,owner]);
  if(!record)return <p role="status">{error||"작업을 불러오는 중입니다."}</p>;
  const document=record.document!,inputs=document.body.inputs as Record<string,unknown>;
  const settings=document.body.settings as Record<string,unknown>;
  const blueprint=document.body.blueprint as Record<string,unknown>;
  const sections=document.body.sections as Array<Record<string,unknown>>;
  return <div className="grid gap-5">
    <h1 className="text-xl font-bold">{document.title}</h1>
    <p>다른 회원의 작업을 보고 있습니다. 수정하려면 내 작업으로 복사해 주세요.</p>
    <button type="button" disabled={busy} className="rounded border p-2" onClick={async()=>{
      setBusy(true);setError("");target.current??=crypto.randomUUID();
      try{
        const response=await fetch(`/api/admin/pdp-documents/${id}/copy`,{method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({ownerId:owner,targetId:target.current,revision:record.revision})});
        const body=await response.json();if(!response.ok || !body.ok)throw Error(body.message??"복사하지 못했습니다.");
        router.push("/create?doc="+body.id);
      }catch(e){setError((e as Error).message);}finally{setBusy(false);}
    }}>내 작업으로 복사해서 편집</button>
    {error?<p role="alert">{error}</p>:null}
    <section><h2 className="font-semibold">입력과 설정</h2>
      <p>{String(inputs?.additionalInfo??"")}</p>
      <p>{String(settings?.userInstruction??"")}</p>
      <p>{String(settings?.planInstruction??"")}</p>
    </section>
    <section><h2 className="font-semibold">기획</h2><p>{String(blueprint?.executiveSummary??"")}</p>
      {sections.map((s,i)=><div key={i} className="my-2 rounded border p-3"><b>{String(s.section_name??"")}</b><p>{String(s.headline??"")}</p><p>{String(s.prompt_ko??"")}</p></div>)}
    </section>
    <section><h2 className="font-semibold">생성한 그림</h2><div className="grid grid-cols-2 gap-3">
      {documentImages(record,urls).map(image=><figure key={image.index}><ThumbImage src={image.url} alt={image.label} className="w-full"/><figcaption>{image.label}</figcaption></figure>)}
    </div></section>
  </div>;
}
