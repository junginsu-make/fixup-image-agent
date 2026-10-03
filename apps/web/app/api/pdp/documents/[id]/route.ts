import { createDocumentHandlers } from "../../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
export const GET=async(req:Request,ctx:Context)=>createDocumentHandlers().get(req,(await ctx.params).id);
export const PUT=async(req:Request,ctx:Context)=>createDocumentHandlers().put(req,(await ctx.params).id);
export const DELETE=async(req:Request,ctx:Context)=>createDocumentHandlers().remove(req,(await ctx.params).id);
