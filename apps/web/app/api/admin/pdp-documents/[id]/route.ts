import {createAdminDocumentHandlers} from "../../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=async(req:Request,ctx:{params:Promise<{id:string}>})=>createAdminDocumentHandlers().get(req,(await ctx.params).id);
// 관리자의 완전 삭제(2026-10-08). 회원의 지우기는 지운 때만 적고, 완전히 지우는 것은 관리자뿐이다.
export const DELETE=async(req:Request,ctx:{params:Promise<{id:string}>})=>createAdminDocumentHandlers().remove(req,(await ctx.params).id);
