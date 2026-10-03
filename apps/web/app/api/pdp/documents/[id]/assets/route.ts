import { createDocumentHandlers } from "../../../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export const POST=async(req:Request,ctx:Context)=>createDocumentHandlers().assets(req,(await ctx.params).id);
