import { timingSafeEqual } from "node:crypto";
export function authorizedGenerationExecutor(request:Request,secret:string|undefined,releaseId:string):boolean {
  if(!secret||secret.length<32)return false;
  const url=new URL(request.url);
  if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))return false;
  const host=request.headers.get("host");
  if(!host||!/^((127\.0\.0\.1|localhost)(:\d+)?|\[::1\](:\d+)?)$/.test(host))return false;
  // Next BaseServer adds these headers even on a direct loopback request.
  // Accept only that exact local shape, never proxy chains or public origins.
  if(request.headers.has("forwarded"))return false;
  const forwardedHost=request.headers.get("x-forwarded-host");
  const forwardedProto=request.headers.get("x-forwarded-proto");
  const forwardedFor=request.headers.get("x-forwarded-for");
  if(forwardedHost!==null&&forwardedHost!==host)return false;
  if(forwardedProto!==null&&forwardedProto!=="http")return false;
  if(forwardedFor!==null&&!["127.0.0.1","::1","::ffff:127.0.0.1"].includes(forwardedFor))return false;
  if(request.headers.get("x-generation-release")!==releaseId||request.headers.get("x-generation-protocol")!=="2")return false;
  const token=/^Bearer (.+)$/i.exec(request.headers.get("authorization")??"")?.[1]??"";
  const expected=Buffer.from(secret);const received=Buffer.from(token);
  return expected.length===received.length&&timingSafeEqual(expected,received);
}
