import { createDocumentHandlers } from "../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=()=>createDocumentHandlers().list();
export const POST=(req:Request)=>createDocumentHandlers().create(req);
