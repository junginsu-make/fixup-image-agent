import { describe, expect, it, vi } from "vitest";
import {
  createProductPhotoUploader,
  productImageFields,
  ProductPhotoUploadError,
  PRODUCT_PHOTO_UPLOAD_FAILED,
  productPhotoErrorMessage,
  productRequestFields,
  productRequestFieldsOrThrow,
  PRODUCTS_CHANGED_MESSAGE,
} from "../product-photo-upload";
import { productsKey } from "../products";
import { productFactsFrom } from "@fixup/pdp-core";

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

  it("만료는 받은 순간 제 시계로 잰다 — 사용자 시계가 서버보다 50분 빨라도 곧바로 다시 올리지 않는다", async () => {
    const now = { t: 50 * 60 * 1000 };
    const 올린것: number[] = [];
    const uploader = createProductPhotoUploader({
      // 서버 시계로는 한 시간 뒤지만 사용자 시계로는 10분 뒤다.
      post: async () => { 올린것.push(1); return { ok: true as const, url: "https://v3.fal.media/files/1.jpg", expiresAt: 60 * 60 * 1000, expiresInMs: 60 * 60 * 1000 }; },
      now: () => now.t,
    });
    await uploader.urlFor(사진);
    now.t += 30 * 60 * 1000;
    await uploader.urlFor(사진);
    expect(올린것).toHaveLength(1);
    now.t += 21 * 60 * 1000;
    await uploader.urlFor(사진);
    expect(올린것).toHaveLength(2);
  });

  it("남은 시간이 없는 옛 서버 답이면 만료 시각을 그대로 쓴다", async () => {
    const now = { t: 0 };
    const 올린것: number[] = [];
    const uploader = createProductPhotoUploader({
      post: async () => { 올린것.push(1); return { ok: true as const, url: "https://v3.fal.media/files/1.jpg", expiresAt: 5 * 60 * 1000 }; },
      now: () => now.t,
    });
    await uploader.urlFor(사진);
    await uploader.urlFor(사진);
    expect(올린것).toHaveLength(2);
  });

  it("실제 서버 답에서 남은 시간만 와도 받는다", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true, url: "https://v3.fal.media/files/r.jpg", expiresInMs: 3600000 }), { status: 200 }));
    try {
      expect(await createProductPhotoUploader().urlFor(사진)).toBe("https://v3.fal.media/files/r.jpg");
    } finally {
      vi.unstubAllGlobals();
    }
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

describe("옛 작업의 data URL 사진", () => {
  it("접두를 떼고 그 안의 mime 으로 올린다", async () => {
    const seen: Array<{ base64: string; mimeType: string }> = [];
    const recording = { urlFor: async (source: { base64: string; mimeType: string }) => { seen.push(source); return "https://v3.fal.media/files/z.jpg"; } };
    await productImageFields({ startMode: "image", fallbackBase64: "data:image/png;base64,QUJD", uploader: recording });
    expect(seen).toEqual([{ base64: "QUJD", mimeType: "image/png" }]);
  });

  it("실제 올리기도 data URL 로 터지지 않는다", async () => {
    const uploader = createProductPhotoUploader({ post: async (bytes) => ({ ok: true as const, url: `https://v3.fal.media/files/${bytes.byteLength}.jpg`, expiresAt: Date.now() + 3600000 }) });
    expect(await productImageFields({ startMode: "image", fallbackBase64: "data:image/jpeg;base64,QUJD", uploader }))
      .toEqual({ productImageUrl: "https://v3.fal.media/files/3.jpg" });
  });
});

describe("사용자에게 보이는 오류 문구", () => {
  it("서버가 준 문구는 그대로", () => {
    expect(productPhotoErrorMessage(new ProductPhotoUploadError("용량 초과"))).toBe("용량 초과");
  });
  it("그 밖의 오류는 고정 문구", () => {
    expect(productPhotoErrorMessage(new TypeError("crypto.subtle is undefined"))).toBe(PRODUCT_PHOTO_UPLOAD_FAILED);
    expect(PRODUCT_PHOTO_UPLOAD_FAILED).toBe("제품 사진을 올리지 못했습니다. 다시 시도해 주세요.");
  });
});

describe("생성 요청의 제품 칸 — 여러 제품·여러 각도(설계 §6.1)", () => {
  const 사진칸 = (base64: string, original?: string) => ({
    base64,
    mimeType: "image/jpeg",
    previewUrl: "",
    fileName: `${base64}.jpg`,
    ...(original ? { original: { base64: original, mimeType: "image/png" } } : {}),
  });
  const 기록 = () => {
    const seen: Array<{ base64: string; mimeType: string }> = [];
    return {
      seen,
      uploader: { urlFor: async (source: { base64: string; mimeType: string }) => { seen.push(source); return `https://v3.fal.media/files/${source.base64}`; } },
    };
  };
  const 판독 = (productId: "p1" | "p2", category: string) => ({
    productId, category, visibleFacts: [`${category} 병`], labelText: [], distinctiveTraits: [], unknowns: [],
  });

  it("글 경로는 지금처럼 대표 이미지를 싣는다", async () => {
    const { uploader, seen } = 기록();
    expect(await productRequestFields({ startMode: "text", products: [], fallbackBase64: "KEYVISUAL", uploader }))
      .toEqual({ originalImageBase64: "KEYVISUAL" });
    expect(seen).toEqual([]);
  });

  it("제품 하나·사진 하나면 2단계 몸통과 같다 — 원본 주소 하나뿐, products 칸이 없다", async () => {
    const { uploader } = 기록();
    const products = [{ id: "p1" as const, name: "레몬맛", photos: [사진칸("SMALL", "BIG")] }];
    const fields = await productRequestFields({
      startMode: "image", products, analyzedProductsKey: productsKey(products), fallbackBase64: "SMALL", uploader,
    });
    expect(fields).toEqual({ productImageUrl: "https://v3.fal.media/files/BIG" });
  });

  it("제품 둘이면 사진마다 주소·제품마다 사실이 붙고, 대표 주소는 제품 1 첫 사진이다", async () => {
    const { uploader, seen } = 기록();
    const products = [
      { id: "p1" as const, name: " 레몬맛 ", photos: [사진칸("L1", "L1BIG"), 사진칸("L2", "L2BIG")] },
      { id: "p2" as const, name: "", photos: [사진칸("G1")] },
    ];
    const readings = [판독("p1", "레몬 음료"), 판독("p2", "자몽 음료")];
    const fields = await productRequestFields({
      startMode: "image", products, analyzedProductsKey: productsKey(products), readings, fallbackBase64: "L1", uploader,
    });
    expect(fields).toEqual({
      productImageUrl: "https://v3.fal.media/files/L1BIG",
      products: [
        { id: "p1", name: "레몬맛", imageUrls: ["https://v3.fal.media/files/L1BIG", "https://v3.fal.media/files/L2BIG"], facts: productFactsFrom(readings[0]) },
        { id: "p2", imageUrls: ["https://v3.fal.media/files/G1"], facts: productFactsFrom(readings[1]) },
      ],
    });
    // 원본이 없는 사진은 1024 사본을 그 mime 으로 올린다.
    expect(seen.map((source) => source.base64)).toEqual(["L1BIG", "L2BIG", "G1"]);
  });

  it("분석 뒤 제품이 바뀌었고 사진이 여럿이면 올리지 않고 멈춘다", async () => {
    const { uploader, seen } = 기록();
    const products = [{ id: "p1" as const, name: "", photos: [사진칸("A"), 사진칸("B")] }];
    const pending = productRequestFields({
      startMode: "image", products, analyzedProductsKey: "옛 열쇠", fallbackBase64: "A", uploader,
    });
    await expect(pending).rejects.toThrow(ProductPhotoUploadError);
    await expect(pending).rejects.toThrow(PRODUCTS_CHANGED_MESSAGE);
    expect(PRODUCTS_CHANGED_MESSAGE).toBe("제품 사진이 구성안을 만든 뒤에 바뀌었습니다. 구성안을 다시 만들어 주세요.");
    expect(seen).toEqual([]);
  });

  it("분석 뒤 바뀌었어도 제품 하나·사진 하나면 분석한 1024 사본으로 만든다(R4)", async () => {
    const { uploader, seen } = 기록();
    const products = [{ id: "p1" as const, name: "", photos: [사진칸("NEW", "NEWBIG")] }];
    const fields = await productRequestFields({
      startMode: "image", products, analyzedProductsKey: "옛 열쇠", fallbackBase64: "OLD", uploader,
    });
    expect(fields).toEqual({ productImageUrl: "https://v3.fal.media/files/OLD" });
    expect(seen).toEqual([{ base64: "OLD", mimeType: "image/jpeg" }]);
  });

  it("열쇠가 없는 옛 작업(제품 하나·사진 하나)은 2단계처럼 분석한 사진과 견준다", async () => {
    const { uploader } = 기록();
    const same = [{ id: "p1" as const, name: "", photos: [사진칸("SMALL", "BIG")] }];
    expect(await productRequestFields({ startMode: "image", products: same, fallbackBase64: "data:image/jpeg;base64,SMALL", uploader }))
      .toEqual({ productImageUrl: "https://v3.fal.media/files/BIG" });
    expect(await productRequestFields({ startMode: "image", products: same, fallbackBase64: "OTHER", uploader }))
      .toEqual({ productImageUrl: "https://v3.fal.media/files/OTHER" });
  });

  it("묶음용은 사용자 문구로 바꿔 던진다", async () => {
    const { uploader } = 기록();
    const products = [{ id: "p1" as const, name: "", photos: [사진칸("A"), 사진칸("B")] }];
    await expect(productRequestFieldsOrThrow({ startMode: "image", products, analyzedProductsKey: "옛 열쇠", fallbackBase64: "A", uploader }))
      .rejects.toThrow(PRODUCTS_CHANGED_MESSAGE);
  });
});
