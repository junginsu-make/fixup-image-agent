export interface ReadImage { url: string; base64: string; mimeType: string }

/** 그림 한 장을 base64 로 읽는다. 서버는 본문을 그대로 fal 에 넘긴다. */
export async function readImageBlob(source: Blob): Promise<ReadImage> {
  const buffer = await source.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]!);
  const base64 = btoa(binary);
  const mimeType = source.type || "image/png";
  return { url: `data:${mimeType};base64,${base64}`, base64, mimeType };
}
