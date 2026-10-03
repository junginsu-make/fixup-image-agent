import {expect,it} from "vitest";
import {validateDocument,DOCUMENT_JSON_LIMIT} from "../model";
const user="11111111-1111-4111-8111-111111111111",id="33333333-3333-4333-8333-333333333333";
const doc=()=>({schemaVersion:3 as const,id,title:"t",stage:"editor" as const,sourceMode:"image" as const,assets:{},
  body:{sections:[],inputs:{additionalInfo:""},settings:{desiredTone:"",aspectRatio:"9:16"},references:[],blueprint:{},editor:null,notice:""}});
const pgText=(value:unknown):string=>Array.isArray(value)?"["+value.map(pgText).join(", ")+"]":
  value!==null&&typeof value==="object"?"{"+Object.entries(value).map(([k,v])=>JSON.stringify(k)+": "+pgText(v)).join(", ")+"}":JSON.stringify(value);
it("F5: 956395바이트 레이어 사례를 DB에 보내기 전에 크기 오류로 거절한다",()=>{
  const value={...doc(),body:{...doc().body,editor:{layers:Array.from({length:12000},(_,i)=>({id:"l"+i,x:i,y:i*2,w:100,h:50,rot:0,op:1,t:"텍스트"}))}}};
  expect(Buffer.byteLength(JSON.stringify(value))).toBeLessThan(DOCUMENT_JSON_LIMIT);
  expect(()=>validateDocument(value,user,id)).toThrow(expect.objectContaining({status:413}));
});
it("F5: DB 공백을 포함한 정확한 한도 양쪽을 구별한다",()=>{
  const value=doc();value.body.notice=".".repeat(DOCUMENT_JSON_LIMIT-Buffer.byteLength(pgText(value)));
  expect(()=>validateDocument(value,user,id)).not.toThrow();
  value.body.notice+="x";
  expect(()=>validateDocument(value,user,id)).toThrow(expect.objectContaining({status:413}));
});
