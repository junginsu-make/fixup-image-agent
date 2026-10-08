import {createAdminDocumentHandlers} from "../../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=async(req:Request,ctx:{params:Promise<{id:string}>})=>createAdminDocumentHandlers().get(req,(await ctx.params).id);
// 관리자는 남의 상세페이지도 지운다(2026-10-09). 주인은 `?owner=` 로 받는다 — 관리자 확인은 `run` 이 한다.
export const DELETE=async(req:Request,ctx:{params:Promise<{id:string}>})=>createAdminDocumentHandlers().remove(req,(await ctx.params).id);
