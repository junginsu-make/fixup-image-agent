import {requireActiveMember} from "../../../../lib/membership/server";
import {DocumentInspector} from "./inspector";
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{owner?:string}>}){
  await requireActiveMember();const {id}=await params;const {owner}=await searchParams;
  return <DocumentInspector id={id} owner={owner??""}/>;
}
