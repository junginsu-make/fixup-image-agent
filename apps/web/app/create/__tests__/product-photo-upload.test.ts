import { describe, expect, it } from "vitest";
import { createProductPhotoUploader, productImageFields, ProductPhotoUploadError } from "../product-photo-upload";

const 사진 = { base64: "QUJD", mimeType: "image/jpeg" };

function 가짜서버(now: { t: number }) {
  const 올린것: string[] = [];
  return {
    올린것,
    post: async (bytes: Uint8Array, mimeType: string) => {
      올린것.push(`${mimeType}:${bytes.byteLength}`);
      return { ok: true as const, url: `https://v3.fal.media/files/${올린것.length}.jpg`, expiresAt: now.t + 60 * 60 * 1000 };
    },
  };
}

describe("제품 원본 올리기", () => {
  it("같은 사진은 한 번만 올린다", async () => {
    const now = { t: 0 };
    const server = 가짜서버(now);
    const uploader = createProductPhotoUploader({ post: server.post, now: () => now.t });
    expect(await uploader.urlFor(사진)).toBe("https://v3.fal.media/files/1.jpg");
    expect(await uploader.urlFor(사진)).toBe("https://v3.fal.media/files/1.jpg");
    expect(server.올린것).toEqual(["image/jpeg:3"]);
  });

  it("남은 시간이 10분 아래면 다시 올린다 — fal 은 한 시간 뒤 지운다", async () => {
    const now = { t: 0 };
    const server = 가짜서버(now);
    const uploader = createProductPhotoUploader({ post: server.post, now: () => now.t });
    await uploader.urlFor(사진);
    now.t = 51 * 60 * 1000;
    expect(await uploader.urlFor(사진)).toBe("https://v3.fal.media/files/2.jpg");
  });

  it("서버가 거절하면 그 문구로 멈춘다", async () => {
    const uploader = createProductPhotoUploader({ post: async () => ({ ok: false as const, message: "이미지 용량이 너무 큽니다." }) });
    await expect(uploader.urlFor(사진)).rejects.toThrow(ProductPhotoUploadError);
    await expect(uploader.urlFor(사진)).rejects.toThrow("이미지 용량이 너무 큽니다.");
  });
});

describe("요청에 싣는 제품 사진 칸", () => {
  const uploader = { urlFor: async () => "https://v3.fal.media/files/x.jpg" };

  it("사진 경로는 원본 주소", async () => {
    expect(await productImageFields({ startMode: "image", productPhoto: 사진, fallbackBase64: "SMALL", uploader }))
      .toEqual({ productImageUrl: "https://v3.fal.media/files/x.jpg" });
  });

  it("원본이 없는 옛 작업은 1024 사본을 올려 주소로", async () => {
    const seen: string[] = [];
    const recording = { urlFor: async (source: { base64: string }) => { seen.push(source.base64); return "https://v3.fal.media/files/y.jpg"; } };
    expect(await productImageFields({ startMode: "image", fallbackBase64: "SMALL", uploader: recording }))
      .toEqual({ productImageUrl: "https://v3.fal.media/files/y.jpg" });
    expect(seen).toEqual(["SMALL"]);
  });

  it("글 경로(대표 이미지)는 지금처럼 그림을 싣는다", async () => {
    expect(await productImageFields({ startMode: "text", productPhoto: 사진, fallbackBase64: "KEYVISUAL", uploader }))
      .toEqual({ originalImageBase64: "KEYVISUAL" });
  });
});
