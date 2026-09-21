import { deflateSync } from "node:zlib";

/**
 * **머리말에만 큰 크기를 적은 PNG.** 알맹이는 없다.
 *
 * 화소 상한을 실제로 밟으려면 상한을 넘는 입력이 필요한데, 40MP 짜리 그림을
 * 진짜로 만들면 raw 로 120MB 를 쓰고 몇 초가 걸린다. **sharp 는 머리말만 보고
 * 크기를 정하므로 68바이트면 충분하다**(2026-09-20 실측: `metadata()` 가
 * 8000×5001 짜리 머리말에 0ms 로 답한다).
 *
 * 소스에 상수가 적혀 있는지 문자열로 대조하는 대신 **동작을 밟는다** — 이
 * 저장소는 문자열 대조 시험이 무력화 변경을 못 잡는 함정에 이미 한 번 빠졌다.
 *
 * 쓰는 곳이 둘이라 여기로 모았다(`ad-export.test.ts`, `style-references-gate.test.ts`).
 * 두 벌로 두면 한쪽만 고쳐지고, 그때 어느 쪽이 맞는지 알 수 없다.
 */
export function oversizedPng(width: number, height: number): Buffer {
  const table = [...Array(256)].map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let crc = 0xffffffff;
    for (const b of body) crc = table[(crc ^ b) & 0xff]! ^ (crc >>> 8);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.alloc(16))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
