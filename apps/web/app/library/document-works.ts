import type {DocumentSummary} from "../../lib/pdp/documents/model";
import type {LibraryWork} from "./library-works";
export type DocumentListEntry=DocumentSummary & {mine:boolean;coverUrl:string|null;ownerEmail?:string|null;deletedAt?:string|null};
export function mergeDocumentWorks(legacy:LibraryWork[],documents:DocumentListEntry[]):LibraryWork[]{
  // 서버가 그림 단위로 걸러 준 옛 항목을 다시 초안 번호로 없애지 않는다.
  const ids=new Set(documents.map(d=>d.id));
  const old=legacy.filter(w=>!ids.has(w.id));
  return [...old,...documents.map(d=>({
    id:d.id,tool:"create" as const,title:d.title,status:d.imageCount>0 && d.imageCount===d.sectionCount?"done":"draft",
    createdAt:d.createdAt,updatedAt:d.updatedAt,ownerEmail:d.ownerEmail??null,mine:d.mine,
    cover:d.coverUrl,imageCount:d.imageCount,images:[],intent:"",settings:[["장수",d.imageCount+"장"]] as Array<[string,string]>,
    href:d.mine?`/create?doc=${d.id}`:`/library/pdp/${d.id}?owner=${d.userId}`,
    documentId:d.id,documentOwner:d.userId,sourceId:d.sourceDraftId??d.id,
    // 회원이 지운 문서. 관리자 목록에만 온다 — 「회원이 삭제함」 표시(2026-10-08).
    ...(d.deletedAt?{deletedAt:d.deletedAt}:{}),
  }))];
}
/** 연결된 문서에서 아는 것 — 지금 그림 지문과, 서버가 저장 때마다 더한 「가졌던」 그림 지문. */
export interface LinkedDocumentFacts { imageTags?:readonly string[]; heldImageTags?:readonly string[] }
/**
 * 문서와 연결된 옛 라이브러리 그림(파일 이름의 그림 지문 `artifact`)을 목록에서 뺄까(3차 리뷰 W9, 최종 리뷰 M1).
 * - 지금 문서에 있다 → 뺀다. 문서 카드가 보여 준다
 * - 예전에 가졌는데 지금 없다 → 뺀다. 문서가 일부러 뺀 그림이다(삭제·다시 만들기·복원)
 * - 한 번도 가진 적 없다 → 남긴다. 이관 전 옛 그림(F10)이거나 문서가 아직 못 받은 결과다(F11·M1)
 * 시각으로 가르지 않는다 — 저장 → 다시 만들기 → 창 닫기 → 글자만 고쳐 저장하면 새 그림이 「저장 사이」에 들어가
 * 숨었다(M1). 지문이 없는 옛 이름의 줄은 남긴다 — 모르는 것을 추측해서 숨기지 않는다.
 */
export function legacyRowHidden(artifact:string|null,doc:LinkedDocumentFacts):boolean{
  if(!artifact)return false;
  return Boolean(doc.imageTags?.includes(artifact) || doc.heldImageTags?.includes(artifact));
}
/** 문서 목록을 못 읽어 문서 정보가 없는 문서 카드를 지우려 할 때(3차 리뷰 W24). */
export const UNCONFIRMED_DOCUMENT_NOTICE="상세페이지 정보를 아직 불러오지 못해 지금은 지울 수 없습니다. 잠시 뒤 다시 시도해 주세요.";
export function documentImages(record:{document:{body:Record<string,unknown>;assets:Record<string,unknown>}|null},urls:Record<string,string>){
  const sections=(record.document?.body.sections??[]) as Array<{section_name?:string;generatedImage?:{$asset?:string}}>;
  return sections.flatMap((s,index)=>{
    const url=s.generatedImage?.$asset?urls[s.generatedImage.$asset]:undefined;
    return url?[{url,label:s.section_name??`${index+1}번째`,index}]:[];
  });
}
