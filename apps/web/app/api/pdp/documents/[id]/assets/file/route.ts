import { z } from "zod";
import { authenticateApiMember } from "../../../../../../../lib/membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../../../../../../lib/local-store";
import { createLocalDocumentStorage } from "../../../../../../../lib/pdp/documents/storage";
import { createLocalDocumentRepository } from "../../../../../../../lib/pdp/documents/local-repository";
import { serverDocumentsEnabled } from "../../../../../../../lib/pdp/documents";
import { assetSchema, assetPath, ASSET_BYTES_LIMIT, notFound } from "../../../../../../../lib/pdp/documents/model";
import { documentResponseError, readDocumentBytes } from "../../../../../../../lib/pdp/documents/http";
export const runtime="nodejs";
export const dynamic="force-dynamic";
type Context={params:Promise<{id:string}>};
async function handle(req:Request,ctx:Context,write:boolean){
  try{
    if(!serverDocumentsEnabled() || !isLocalStoreEnabled())throw notFound();
    const auth=await authenticateApiMember();if(!auth.ok)return auth.response;
    const {id}=await ctx.params,userId=auth.member.userId;
    if(!await createLocalDocumentRepository(localStoreRoot()).get(userId,id))throw notFound();
    const query=Object.fromEntries(new URL(req.url).searchParams);
    const input=assetSchema.omit({path:true,fileName:true}).extend({bytes:z.coerce.number().int().positive().max(ASSET_BYTES_LIMIT)}).strict().parse(query);
    const asset={...input,path:assetPath(userId,id,input.sha256,input.mimeType)};
    const storage=createLocalDocumentStorage(localStoreRoot());
    if(write){
      const bytes=await readDocumentBytes(req,ASSET_BYTES_LIMIT);
      if(!await createLocalDocumentRepository(localStoreRoot()).get(userId,id))throw notFound();
      await storage.upload(asset,bytes);return Response.json({ok:true});
    }
    const bytes=await storage.read(asset);
    return new Response(new Uint8Array(bytes),{headers:{"content-type":asset.mimeType,"cache-control":"no-store","x-content-type-options":"nosniff"}});
  }catch(e){return documentResponseError(e);}
}
export const GET=(req:Request,ctx:Context)=>handle(req,ctx,false);
export const PUT=(req:Request,ctx:Context)=>handle(req,ctx,true);
