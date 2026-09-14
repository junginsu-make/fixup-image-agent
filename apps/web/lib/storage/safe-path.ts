/** Storage keys are object keys, not URLs or filesystem traversal expressions. */
export function assertStoragePath(path: unknown, allowEmpty=false): asserts path is string {
  if(allowEmpty&&path==="")return;
  if(typeof path!=="string"||!path||/[\\%?#\u0000-\u001f\u007f]/.test(path)||path.split("/").some(p=>!p||p==="."||p===".."))throw new Error("invalid_storage_path");
}
