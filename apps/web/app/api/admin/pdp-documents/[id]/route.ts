import {createAdminDocumentHandlers} from "../../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=async(req:Request,ctx:{params:Promise<{id:string}>})=>createAdminDocumentHandlers().get(req,(await ctx.params).id);
