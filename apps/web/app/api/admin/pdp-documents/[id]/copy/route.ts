import {createAdminDocumentHandlers} from "../../../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=async(req:Request,ctx:{params:Promise<{id:string}>})=>createAdminDocumentHandlers().copy(req,(await ctx.params).id);
