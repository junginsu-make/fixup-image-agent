import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { DEFAULT_TEXT_MODEL } from "@fixup/shared";
import { createPosterFalClients } from "../../lib/poster/providers";
import { createEasyChatProvider } from "../../lib/easy/chat-provider";
import { readEasyPhotos } from "../../lib/easy/read-photos";
import { readLlmMeter, withLlmMeter } from "../../lib/llm/meter";
import { easyRolePrompt, readRoleJudgment } from "../../app/easy/photo-roles";

/**
 * 실제 사진을 **실제 읽기로** 읽어, 그 설명으로 역할이 갈리는지 본다.
 *
 *   pnpm exec tsx --env-file=<.env.local> apps/web/scripts/easy-measure/read-check.mts <사진폴더>
 *
 * 읽기는 주소가 있어야 한다 — fal 에 올려 주소를 받는다(이미지 만들기가 쓰는 그 업로더).
 */

const 형식: Record<string, string> = { ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };

async function main() {
  const 폴더 = process.argv[2];
  if (!폴더) throw new Error("사진 폴더 경로를 주세요.");
  const 파일들 = readdirSync(폴더).filter((file) => 형식[extname(file).toLowerCase()]).sort();
  const fal = createPosterFalClients();
  const photos: Array<{ id: string; title: string; url: string }> = [];
  for (const file of 파일들) {
    const url = await fal.uploader.uploadReference(readFileSync(join(폴더, file)), 형식[extname(file).toLowerCase()]!);
    photos.push({ id: file, title: file, url });
  }

  const 줄: string[] = [`# 실제 사진 읽기 확인 — ${new Date().toISOString()}`, ""];
  for (const 장수 of [...new Set([1, 3, photos.length])].filter((n) => n <= photos.length)) {
    const r = await withLlmMeter(async () => {
      const 시작 = Date.now();
      await readEasyPhotos(photos.slice(0, 장수));
      return { ms: Date.now() - 시작, usd: readLlmMeter().usd };
    });
    줄.push(`- ${장수}장 읽기: ${r.ms}ms · $${r.usd.toFixed(4)}`);
  }

  const 설명 = await readEasyPhotos(photos);
  줄.push("", "## 읽은 설명", "");
  photos.forEach((photo, i) => 줄.push(`${i + 1}. \`${photo.id}\` — ${설명[photo.id]?.description ?? "(못 읽음)"}`));

  const provider = createEasyChatProvider(process.env, DEFAULT_TEXT_MODEL);
  for (const words of ["카페 포스터 만들어줘", "이걸로 만들어줘"]) {
    const raw = await provider.decideRoles(easyRolePrompt({ words, photos: photos.map((p) => ({ description: 설명[p.id]?.description })) }));
    const got = readRoleJudgment(raw, photos.length);
    줄.push("", `## 「${words}」`, "", ...got.photos.map((p, i) => `- ${i + 1}. \`${photos[i]!.id}\` → ${p.role}${p.said ? " (말)" : ""}`));
  }

  const 결과 = new URL("../../../../docs/easy-measure/", import.meta.url);
  mkdirSync(결과, { recursive: true });
  writeFileSync(new URL("2026-09-30-read-check.md", 결과), `${줄.join("\n")}\n`);
  console.log(줄.join("\n"));
}

void main();
