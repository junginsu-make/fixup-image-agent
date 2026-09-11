import { timingSafeEqual } from "node:crypto";
export function authorizedGenerationExecutor(request:Request,secret:string|undefined,releaseId:string):boolean {
  if(!secret||secret.length<32)return false;
  const url=new URL(request.url);
  if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))return false;
  const host=request.headers.get("host");
  if(!host||!/^((127\.0\.0\.1|localhost)(:\d+)?|\[::1\](:\d+)?)$/.test(host))return false;
  if(["forwarded","x-forwarded-for","x-forwarded-host","x-forwarded-proto"].some(h=>request.headers.has(h)))return false;
  if(request.headers.get("x-generation-release")!==releaseId||request.headers.get("x-generation-protocol")!=="2")return false;
  const token=/^Bearer (.+)$/i.exec(request.headers.get("authorization")??"")?.[1]??"";
  const expected=Buffer.from(secret);const received=Buffer.from(token);
  return expected.length===received.length&&timingSafeEqual(expected,received);
}
