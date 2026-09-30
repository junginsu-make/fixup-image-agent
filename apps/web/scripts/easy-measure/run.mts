import { mkdirSync, writeFileSync } from "node:fs";
import { DEFAULT_TEXT_MODEL } from "@fixup/shared";
import { createEasyChatProvider } from "../../lib/easy/chat-provider";
import { readLlmMeter, withLlmMeter } from "../../lib/llm/meter";
import { easyChatPrompt, readEasyDecision } from "../../app/easy/chat";
import { easyRolePrompt, readRoleJudgment, type RoleJudgment } from "../../app/easy/photo-roles";
import { B1_CASES, B2_CASES, type B2Case } from "./cases.mts";

/**
 * §2-11 실측 — 두 판단(ⓑ1 · ⓑ2)을 실제 모델로 문장마다 여러 번 돌린다.
 *
 *   pnpm exec tsx --env-file=<.env.local> apps/web/scripts/easy-measure/run.mts
 *
 * 환경변수: RUNS(기본 3), TEXT_MODEL(기본 DEFAULT_TEXT_MODEL).
 * 치명이나 어긋남이 하나라도 있으면 끝 코드 1 이다.
 */

const RUNS = Number(process.env.RUNS ?? "3");
const 모델 = process.env.TEXT_MODEL ?? DEFAULT_TEXT_MODEL;
const 지킬것 = new Set(["preserve_product", "preserve_person", "preserve_person_restyled"]);
const 카드만 = new Set(["place_as_is", "ending"]);
/** 원고가 있는 대화 — 실제로 화면이 판단에 넘기는 모양 그대로(카드뉴스 원고 줄은 image 줄이다). */
const 원고있는대화 = [
  { id: "u1", role: "user" as const, body: "건강기능식품 고르는 법 카드뉴스 만들어줘" },
  { id: "i1", role: "image" as const, body: "" },
];

async function 잰다<T>(call: () => Promise<T>) {
  return withLlmMeter(async () => {
    const 시작 = Date.now();
    const value = await call();
    return { value, ms: Date.now() - 시작, usd: readLlmMeter().usd };
  });
}

/** 한 번 돌린 결과의 문제들. 「치명:」으로 시작하는 것이 §2-11 의 통과 기준이다. */
function b2문제(one: B2Case, got: RoleJudgment): string[] {
  const 문제: string[] = [];
  one.expect.forEach((want, i) => {
    const have = got.photos[i]!;
    if (one.previous) {
      // 이어 만들기는 **최종 역할**로 잰다 — said 면 판단한 역할, 아니면 지난 역할(mergeRoles 와 같은 차례).
      const 최종 = have.said && have.role !== "unclear" ? have.role : one.previous[i]!;
      if (지킬것.has(want) && 최종 === "style") 문제.push(`치명: ${i + 1}번 지킬 것이 분위기로 감`);
      if (최종 !== want) 문제.push(`${i + 1}번 최종 ${최종} ≠ ${want}`);
      return;
    }
    if (!카드만.has(want) && 카드만.has(have.role)) 문제.push(`치명: ${i + 1}번 말하지 않은 원본 넣기`);
    if ((지킬것.has(want) || want === "unclear") && have.role === "style") {
      문제.push(`치명: ${i + 1}번을 분위기로 보냄`);
    }
    if (one.said[i] && want !== "unclear" && have.role === "unclear") {
      문제.push(`치명: ${i + 1}번 말에 있는데 되물음`);
    }
    if (have.role !== want) 문제.push(`${i + 1}번 역할 ${have.role} ≠ ${want}`);
    if (have.said !== one.said[i]) 문제.push(`${i + 1}번 said ${have.said} ≠ ${one.said[i]}`);
  });
  if (one.conflicting && !got.conflicting) 문제.push("치명: 정정을 엇갈림으로 못 알아봄");
  if (!one.conflicting && got.conflicting) 문제.push("엇갈림이 아닌데 엇갈림");
  return 문제;
}

async function main() {
  const provider = createEasyChatProvider(process.env, 모델);
  const 줄: string[] = [
    `# 「쉽게」 판단 실측 — ${new Date().toISOString()}`,
    "",
    `글 모델 \`${모델}\` · 문장마다 ${RUNS}번 · 설계 §2-11`,
    "",
  ];
  let 치명 = 0;
  let 어긋남 = 0;
  let 합계 = 0;
  const 걸린시간: number[] = [];

  줄.push("## ⓑ1 말인가 주문인가", "", "| 문장 | 사진 | 기대 | 결과 | ms | $ |", "|---|---|---|---|---|---|");
  for (const one of B1_CASES) {
    for (let run = 0; run < RUNS; run += 1) {
      const r = await 잰다(() => provider.decide(easyChatPrompt(one.hasDraft ? 원고있는대화 : [], one.prompt, one.attachments, Boolean(one.hasDraft))));
      let got: string;
      try { got = readEasyDecision(r.value, { canRevise: Boolean(one.hasDraft) }).wants; } catch { got = "오류"; }
      const 기대 = [one.expect].flat() as string[];
      // 한 장 ↔ 여러 장이 뒤바뀌면 치명이다(2단계 §12) — 틀리면 값이 나가거나 엉뚱한 것이 나온다.
      if ((got === "image" || got === "cardnews") && !기대.includes(got) && (기대.includes("image") || 기대.includes("cardnews") || 기대.includes("either"))) 치명 += 1;
      합계 += r.usd;
      if (!기대.includes(got)) 어긋남 += 1;
      줄.push(`| ${one.prompt}${one.hasDraft ? " (원고 있음)" : ""} | ${one.attachments} | ${기대.join("/")} | ${기대.includes(got) ? got : `**${got}**`} | ${r.ms} | ${r.usd.toFixed(4)} |`);
    }
  }

  줄.push("", "## ⓑ2 사진 역할", "", "| 이름 | 말 | 결과(역할/said) | 엇갈림 | 문제 | ms | $ |", "|---|---|---|---|---|---|---|");
  for (const one of B2_CASES) {
    for (let run = 0; run < RUNS; run += 1) {
      const prompt = easyRolePrompt({
        words: one.words,
        photos: one.photos.map((description) => ({ description })),
        followUp: Boolean(one.previous),
        cardnews: one.cardnews,
      });
      const r = await 잰다(() => provider.decideRoles(prompt));
      const got = readRoleJudgment(r.value, one.photos.length, { cardnews: one.cardnews });
      const 문제 = b2문제(one, got);
      합계 += r.usd;
      걸린시간.push(r.ms);
      치명 += 문제.filter((m) => m.startsWith("치명")).length;
      어긋남 += 문제.filter((m) => !m.startsWith("치명")).length;
      const 결과 = got.photos.map((p, i) => `${i + 1}:${p.role}/${p.said ? "말" : "-"}`).join(" ");
      줄.push(`| ${one.name} | ${one.words} | ${결과} | ${got.conflicting} | ${문제.join("; ") || "—"} | ${r.ms} | ${r.usd.toFixed(4)} |`);
    }
  }

  const 가운데 = [...걸린시간].sort((a, b) => a - b)[Math.floor(걸린시간.length / 2)] ?? 0;
  줄.push(
    "",
    "## 요약",
    "",
    `- 치명 ${치명}건 · 어긋남 ${어긋남}건`,
    `- ⓑ2 한 번 걸린 시간(가운데값) ${가운데}ms`,
    `- 모두 합친 값 $${합계.toFixed(4)}`,
    `- 통과: ${치명 === 0 && 어긋남 === 0 ? "예" : "아니오"}`,
  );

  const 폴더 = new URL("../../../../docs/easy-measure/", import.meta.url);
  mkdirSync(폴더, { recursive: true });
  writeFileSync(new URL(process.env.OUT ?? "2026-09-30-roles.md", 폴더), `${줄.join("\n")}\n`);
  console.log(줄.slice(-6).join("\n"));
  process.exitCode = 치명 || 어긋남 ? 1 : 0;
}

void main();
