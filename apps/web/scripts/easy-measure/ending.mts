import { readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_TEXT_MODEL } from "@fixup/shared";
import { createEasyChatProvider } from "../../lib/easy/chat-provider";
import { readLlmMeter, withLlmMeter } from "../../lib/llm/meter";
import { endingPrompt, fallbackEnding, readEnding, type EndingProject } from "../../app/easy/cardnews-ending";

/**
 * **마지막 장 정리 문장 실측**(2026-09-30 사용자 결정 B).
 *
 * 실제로 만든 카드뉴스 원고(로컬 저장소)를 그대로 넣고 몇 번 써 본다. 원고에 없는
 * 사실이 들어가는지, 길이가 카드 한 장에 맞는지 사람이 본다.
 *
 *   STORE=<store.json> PROJECT=<id> RUNS=3 npx tsx scripts/easy-measure/ending.mts
 */

const 모델 = process.env.TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
const RUNS = Number(process.env.RUNS ?? "3");
const store = JSON.parse(readFileSync(process.env.STORE!, "utf8")) as { snsProjects: Array<EndingProject & { id: string }> };
const project = store.snsProjects.find((one) => one.id === process.env.PROJECT)!;
const provider = createEasyChatProvider(process.env, 모델);
const prompt = endingPrompt(project);

const 줄: string[] = [`# 마지막 장 정리 문장 실측 — ${new Date().toISOString()}`, "", `글 모델 \`${모델}\` · ${RUNS}번`, "", "## 부탁", "", "```", prompt, "```", ""];
for (let run = 1; run <= RUNS; run += 1) {
  const 결과 = await withLlmMeter(async () => {
    const 시작 = Date.now();
    const raw = await provider.writeEnding(prompt);
    return { raw, ms: Date.now() - 시작, meter: readLlmMeter() };
  });
  const got = readEnding(결과.raw);
  줄.push(`## ${run}번 (${결과.ms}ms · $${결과.meter.usd.toFixed(4)})`, "", got ? `**${got.headline}**` : "(받지 못함)", "", got?.body ?? "", "");
}
const 대신 = fallbackEnding(project);
줄.push("## AI 가 못 쓸 때", "", `**${대신.headline}**`, "", 대신.body, "");
writeFileSync(new URL(process.env.OUT ?? "../../../../docs/easy-measure/2026-09-30-ending.md", import.meta.url), `${줄.join("\n")}\n`);
console.log("done");
