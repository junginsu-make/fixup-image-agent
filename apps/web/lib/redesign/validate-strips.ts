import "server-only";
import sharp from "sharp";
// Match the current browser slicer: at most eight 2048 x 2560 strips per call.
export const MAX_STRIP_PIXELS = 2048 * 2560;
export const MAX_STRIP_BYTES = 12 * 1024 * 1024;
export async function validateTranscriptionStrips(value: unknown): Promise<void> {
  if (!Array.isArray(value) || !value.length || value.length > 8) throw new Error("invalid_image_input");
  for (const strip of value) {
    if (!strip || typeof strip.base64 !== "string" || !["image/jpeg", "image/png", "image/webp"].includes(strip.mimeType)) throw new Error("invalid_image_input");
    if (strip.base64.length > Math.ceil(MAX_STRIP_BYTES / 3) * 4) throw new Error("request_too_large");
    if (!strip.base64.length || !/^[A-Za-z0-9+/]*={0,2}$/.test(strip.base64)) throw new Error("invalid_image_input");
    const bytes = Buffer.from(strip.base64, "base64");
    if (bytes.length > MAX_STRIP_BYTES) throw new Error("request_too_large");
    const format = bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a", "hex")) ? "png"
      : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? "jpeg"
      : bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP" ? "webp" : undefined;
    if (!format || strip.mimeType !== `image/${format}`) throw new Error("invalid_image_input");
    try {
      const image = sharp(bytes, { limitInputPixels: MAX_STRIP_PIXELS, animated: false });
      const info = await image.metadata();
      if (!info.width || !info.height || info.width * info.height > MAX_STRIP_PIXELS || (info.pages ?? 1) > 1) throw new Error("invalid_image_input");
      await image.resize(1,1,{fit:"inside"}).toBuffer();
    } catch { throw new Error("invalid_image_input"); }
  }
}
