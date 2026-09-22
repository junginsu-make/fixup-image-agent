import sharp from "sharp";

/**
 * **진짜 PNG 바이트.**
 *
 * 리디자인 생성 라우트에 문지기가 생긴 뒤로(F-7-1) 바이트를 본다. 전에는
 * `new File(["image"], "p.png", …)` 처럼 글자를 넣어도 통과했는데, 그때는
 * **딱지만 보고 있었기 때문**이다.
 *
 * 세 시험이 각자 만들고 있었다. 한 벌로 모은다 — 상한을 조이는 날 한 곳만
 * 고치면 된다(`oversized-png.ts` 가 이미 그 자리다).
 */
export async function referencePng(width = 8, height = 8): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 40 } },
  }).png().toBuffer();
}

/** 업로드 폼에 넣을 파일 한 장. */
export async function referencePngFile(name = "p.png"): Promise<File> {
  const bytes = await referencePng();
  return new File([Uint8Array.from(bytes)], name, { type: "image/png" });
}
