import "server-only";
import { authenticateApiMember, authenticateApiAdmin } from "../../membership/api";
import { isLocalStoreEnabled, localStoreRoot } from "../../local-store";
import { createSupabaseAdminClient } from "../../supabase/admin";
import { createLocalDocumentRepository } from "./local-repository";
import { createSupabaseDocumentRepository } from "./supabase-repository";
import { createLocalDocumentStorage, createRemoteDocumentStorage } from "./storage";
import { documentHandlers } from "./http";
import { adminDocumentHandlers } from "./admin";
import {serverDocumentsEnabled} from "./flags";
import {deleteDocumentLegacy} from "./delete-legacy";
export {serverDocumentsEnabled} from "./flags";
export function documentServices(){
  return isLocalStoreEnabled()
    ? {repo:createLocalDocumentRepository(localStoreRoot()),storage:createLocalDocumentStorage(localStoreRoot())}
    : {repo:createSupabaseDocumentRepository(createSupabaseAdminClient()),storage:createRemoteDocumentStorage(createSupabaseAdminClient())};
}
export function createDocumentHandlers(){
  // 꺼진 기능은 운영 DB 연결조차 만들지 않는다.
  const services=()=>documentServices();
  return documentHandlers({enabled:serverDocumentsEnabled,
    cleanupLegacy:async(userId,ids)=>{if(!isLocalStoreEnabled())await deleteDocumentLegacy(createSupabaseAdminClient(),userId,ids);},
    authenticate:async()=>{
    const auth=await authenticateApiMember();return auth.ok?{userId:auth.member.userId}:auth.response;
  },repo:new Proxy({} as ReturnType<typeof services>["repo"],{get:(_,key)=>Reflect.get(services().repo,key)}),
  storage:new Proxy({} as ReturnType<typeof services>["storage"],{get:(_,key)=>Reflect.get(services().storage,key)})});
}
export function createAdminDocumentHandlers(){
  return adminDocumentHandlers({enabled:serverDocumentsEnabled,authenticate:async()=>{
    const auth=await authenticateApiAdmin();return auth.ok?{userId:auth.member.userId}:auth.response;
  },repo:new Proxy({} as ReturnType<typeof documentServices>["repo"],{get:(_,key)=>Reflect.get(documentServices().repo,key)}),
  storage:new Proxy({} as ReturnType<typeof documentServices>["storage"],{get:(_,key)=>Reflect.get(documentServices().storage,key)})});
}
