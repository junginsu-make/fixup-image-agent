import "server-only";
import { CHARACTER_SHEET, CHARACTER_SHEET_ASPECT, DEFAULT_EXTRA_ANGLES, selectCharacterModel, type AspectRatio, type ImageModelId, type CharacterAngle } from "@fixup/pdp-core";
import { createCharacter, generateCandidates, regenerateAngle, characterForWrite, DEFAULT_CANDIDATES } from "../characters";
import { quotePdpImage } from "../pdp/fal";
import { runImageOperation } from "./image-operation";
import { recordedImageRun, type RecordedImage } from "./recorded-image";
import { withGenerationFence } from "./fence-context";
import { generationFailureResponse, inputHash } from "./run-store";
import type { Body } from "../../app/api/characters/route";
import type { ViewBody } from "../../app/api/characters/views/route";

function price(model: ImageModelId, aspectRatio: AspectRatio, reference: boolean) {
  return quotePdpImage(model, { prompt: "", systemPrompt: "", aspectRatio,
    references: reference ? [{ kind: "person", base64: "", mimeType: "image/png" }] : [] });
}
function currentRun() { const run=recordedImageRun(); if(!run)throw new Error("execution_context_required"); return run; }
function failure(error: unknown) { return generationFailureResponse(error) ?? Response.json({ ok:false,message:"캐릭터 작업을 완료하지 못했습니다." },{status:500}); }
export async function durableCharacterRequest(request: Request, userId: string, body: Body): Promise<Response> {
  try {
    const model=(body.modelId??selectCharacterModel(body.look)) as ImageModelId;
    const raw=(value:string)=>value.replace(/^data:[^;]+;base64,/,"");
    const reference=body.reference?{...body.reference,base64:raw(body.reference.base64)}:undefined;
    const angles=(body.angles??DEFAULT_EXTRA_ANGLES).filter(angle=>angle!=="front") as CharacterAngle[];
    const count=body.step==="candidates"?body.candidates??DEFAULT_CANDIDATES:angles.length+(body.sheet?1:0);
    if(body.step==="create"&&!raw(body.chosenBase64??""))return Response.json({ok:false,message:"고른 후보가 없습니다."},{status:400});
    const normalPrice=price(model,body.aspectRatio,body.step==="create"||Boolean(reference));
    const sheetPrice=body.step==="create"&&body.sheet?price(model,CHARACTER_SHEET_ASPECT,true):0;
    const total=body.step==="candidates"?normalPrice*count:normalPrice*angles.length+sheetPrice;
    const reply=await runImageOperation<{status:number;body:Record<string,unknown>}>(request,userId,{
      operation:"pdp_image",units:Math.ceil(total/50000),identity:{mode:`character_${body.step}`,bodyHash:inputHash(body),model,normalPrice,sheetPrice},
      models:[model],maximumImages:count,maximumImageCostMicrousd:Math.max(normalPrice,sheetPrice),maximumLlmCalls:0,allowNoNewImages:count===0,
    },()=>withGenerationFence(currentRun(),async()=>{
      if(body.step==="candidates"){
        const result=await generateCandidates({description:body.description,aspectRatio:body.aspectRatio,kind:body.kind,look:body.look,modelId:model,reference,candidates:body.candidates});
        return {value:{status:200,body:{ok:result.candidates.length>0,candidates:result.candidates,requested:result.requested,message:result.candidates.length?undefined:"후보를 만들지 못했습니다."}},images:result.candidates,success:result.candidates.length>0};
      }
      const images:RecordedImage[]=[];
      const result=await createCharacter({executionId:currentRun().id,userId,name:(body.name||body.description).slice(0,80),description:body.description,
        aspectRatio:body.aspectRatio,kind:body.kind,look:body.look,modelId:model,chosenBase64:raw(body.chosenBase64??""),chosenMimeType:body.chosenMimeType||"image/png",
        angles,sheet:body.sheet,onStoredViews:views=>images.push(...views.filter(view=>view.angle!=="front")),
      });
      return {value:{status:result.ok?200:500,body:{...result}},images,success:result.ok&&(count===0||images.length>0)};
    }));
    return Response.json(reply.body,{status:reply.status});
  }catch(error){return failure(error);}
}
export async function durableCharacterView(request: Request, userId: string, body: ViewBody): Promise<Response> {
  try {
    const character=await characterForWrite(userId,body.characterId);
    if(!character)return Response.json({ok:false,message:"캐릭터를 찾지 못했습니다."},{status:404});
    const model=(body.modelId??selectCharacterModel(character.look)) as ImageModelId;
    const unit=price(model,body.angle===CHARACTER_SHEET.id?CHARACTER_SHEET_ASPECT:body.aspectRatio,true);
    const reply=await runImageOperation<{status:number;body:Record<string,unknown>}>(request,userId,{
      operation:"pdp_image",resourceId:body.characterId,units:Math.ceil(unit/50000),identity:{mode:"character_view",body,model,unit},
      models:[model],maximumImages:1,maximumImageCostMicrousd:unit,maximumLlmCalls:0,
    },()=>withGenerationFence(currentRun(),async()=>{
      const images:RecordedImage[]=[];
      const result=await regenerateAngle({...body,userId,modelId:model,angle:body.angle as Parameters<typeof regenerateAngle>[0]["angle"],onStoredViews:views=>images.push(...views)});
      return {value:{status:result.ok?200:500,body:{...result}},images,success:result.ok};
    }));
    return Response.json(reply.body,{status:reply.status});
  }catch(error){return failure(error);}
}
