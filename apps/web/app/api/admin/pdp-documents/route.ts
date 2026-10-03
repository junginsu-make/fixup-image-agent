import {createAdminDocumentHandlers} from "../../../../lib/pdp/documents";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const GET=()=>createAdminDocumentHandlers().list();
