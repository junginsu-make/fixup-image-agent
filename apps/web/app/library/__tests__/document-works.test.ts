import { describe,expect,it } from "vitest";
import { mergeDocumentWorks } from "../document-works";
import type { DocumentSummary } from "../../../lib/pdp/documents/model";
import type { LibraryWork } from "../library-works";
const row:DocumentSummary & {mine:boolean;coverUrl:string|null}={id:"doc",userId:"u",revision:1,sourceDraftId:"legacy",
  createdAt:"2026-10-02",updatedAt:"2026-10-02",title:"작업",stage:"input",sectionCount:0,aspectRatio:"9:16",imageCount:0,cover:null,coverUrl:null,mine:true};
describe("서버 문서의 라이브러리 표시",()=>{
  it("F10: 같은 초안에 속해도 문서에 없는 옛 그림은 남긴다",()=>{
    const old={id:"old",tool:"create",sourceId:"legacy",imageCount:5} as LibraryWork;
    const items=mergeDocumentWorks([old],[row]);
    expect(items).toHaveLength(2);expect(items[1].href).toBe("/create?doc=doc");
    expect(items[0].imageCount).toBe(5);expect(items[1].status).toBe("draft");
  });
  it("새 버전에서 섹션을 삭제해도 작업 ID는 같다",()=>{
    const a=mergeDocumentWorks([],[{...row,imageCount:3,revision:1}])[0];
    const b=mergeDocumentWorks([],[{...row,imageCount:2,revision:2}])[0];
    expect(a.id).toBe(b.id);expect(b.imageCount).toBe(2);
  });
  it("일부 섹션만 만들었으면 완료라고 표시하지 않는다",()=>{
    expect(mergeDocumentWorks([],[{...row,imageCount:1,sectionCount:3}])[0].status).toBe("draft");
  });
  it("관리자는 남의 문서를 읽기 전용 경로로 연다",()=>{
    expect(mergeDocumentWorks([],[{...row,mine:false}])[0].href).toBe("/library/pdp/doc?owner=u");
  });
});
