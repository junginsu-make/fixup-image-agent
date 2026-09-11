import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only",()=>({}));
import { validateTranscriptionStrips, MAX_STRIP_BYTES } from "../validate-strips";
it("accepts all eight strips at the browser's normal maximum pixel size without changing their bytes",async()=>{
  const bytes=await sharp({create:{width:2048,height:2560,channels:3,background:"white"}}).jpeg().toBuffer();
  const base64=bytes.toString("base64");const strips=Array.from({length:8},()=>({base64,mimeType:"image/jpeg"}));
  await expect(validateTranscriptionStrips(strips)).resolves.toBeUndefined();
  expect(strips.every(s=>s.base64===base64)).toBe(true);
});
it("rejects byte excess and malformed images before calling a model",async()=>{
  await expect(validateTranscriptionStrips([{base64:"A".repeat(Math.ceil(MAX_STRIP_BYTES/3)*4+4),mimeType:"image/png"}])).rejects.toThrow("request_too_large");
  await expect(validateTranscriptionStrips([{base64:"AQID",mimeType:"image/png"}])).rejects.toThrow("invalid_image_input");
});
it("rejects pixel excess and a ninth strip",async()=>{
  const bytes=await sharp({create:{width:2049,height:2560,channels:3,background:"white"}}).png().toBuffer();
  await expect(validateTranscriptionStrips([{base64:bytes.toString("base64"),mimeType:"image/png"}])).rejects.toThrow("invalid_image_input");
  await expect(validateTranscriptionStrips(Array.from({length:9},()=>({base64:"AQID",mimeType:"image/png"})))).rejects.toThrow("invalid_image_input");
});
