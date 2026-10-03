import { createDocumentHandlers } from "../../../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export const GET=async(req:Request,ctx:Context)=>createDocumentHandlers().revisions(req,(await ctx.params).id);
