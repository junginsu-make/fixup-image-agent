import { priceCoverage, unitPrice, type ImageModel } from "@fixup/sns-core";
import { estimatePosterCost } from "@fixup/poster-core";
import { imageCredits, type CreditPolicyId } from "@fixup/shared";
import type { PriceCatalog } from "./catalog";
import type { WorkProfile } from "./schema";

export interface WorkEstimate {
  id: string; label: string; weight: number;
  steps: Array<{ reserved: number; charged: number }>;
  charged: number; required: number; imageUsd: number; textUsd: number; apiUsd: number;
  providerOutputs: number; images: number; savedImages: number;
  savedMB: number | null; uploadMB: number | null; responseMB: number | null; originalMB: number | null; previewMB: number | null;
  warnings: string[];
}
export const units = (usd: number, catalog: PriceCatalog) => usd <= 0 ? 0 : Math.ceil(usd / catalog.creditUsd);

/** Read historical price snapshots through the SAME price-selection algorithm as the service. */
function price(p: WorkProfile, c: PriceCatalog, square = false, slot = false): number {
  if (p.unitOverrideUsd !== null) return p.unitOverrideUsd;
  if (c.flat[p.model] !== undefined) return c.flat[p.model]!;
  const model = c.models.find(x => x.id === p.model);
  if (!model) throw new Error(`${p.label}: 모르는 모델입니다 (${p.model}).`);
  const scale = slot ? Math.sqrt(p.slotScale) : 1;
  const size = square ? { width: 1024, height: 1024 } : { width: Math.round(p.width * scale), height: Math.round(p.height * scale) };
  return square ? unitPrice(model, "i2i", size) : priceCoverage(model, p.mode, size).usd;
}

export function estimateWork(p: WorkProfile, c: PriceCatalog, policy: CreditPolicyId = "cost-v1"): WorkEstimate {
  const steps: WorkEstimate["steps"] = [];
  const warnings: string[] = [];
  let imageUsd = 0, providerOutputs = 0, images = 0, savedImages = 0;
  const text = p.textOverrideUsd ?? Number((p.plans * c.planUsd + Math.max(1, p.plans) * p.visionReads * c.visionUsd).toFixed(6));
  let textUsd = text;
  const add = (reserved: number, charged = reserved) => steps.push({ reserved, charged: Math.min(reserved, charged) });
  const make = (count: number, usd: number, save = count) => { imageUsd += count * usd; providerOutputs += count; savedImages += save; };
  const regular = price(p, c);
  if (p.kind === "sns" && p.placedCards > p.images) throw new Error("그대로 넣는 카드는 전체 카드 수를 넘을 수 없습니다.");
  const requested = p.kind === "character" ? p.candidates + p.angles + Number(p.sheet) : p.images;
  const success = p.successCount ?? requested;
  if (success > requested) throw new Error("성공 장수는 요청 장수를 넘을 수 없습니다.");
  if (p.successCount !== null) warnings.push("부분 성공은 앞 단계/배치부터 성공하는 가정입니다. 0장 실패는 최종 실패율로 설정하세요.");
  if (p.kind === "poster") {
    if (p.images > 3) throw new Error("포스터는 요청당 변형 1~3장입니다.");
    // Validate supported dimensions/model using the public service estimator. The stored snapshot
    // supplies the dollar rate, so a saved forecast does not silently adopt new prices.
    if (c.models.some(x => x.id === p.model)) {
      const pixelModel = c.models.find(x => x.id === p.model)?.pixelSizeLimits;
      const estimate = estimatePosterCost({ modelId: p.model, ratioId: pixelModel ? "match-source" : p.ratio, variants: p.images, hasReferences: p.mode === "i2i", sourceSize: { width: p.width, height: p.height } });
      if (estimate.rejected?.startsWith("모르는 모델")) warnings.push("저장된 옛 모델 가격표로 계산합니다. 현재 생성 경로의 지원 여부는 별도입니다.");
      else if (estimate.rejected) throw new Error(estimate.rejected);
    }
    if (text > 0) for (let i = 0; i < Math.max(1, p.plans); i++) add(units(text / Math.max(1, p.plans), c));
    add(units(regular * p.images, c), units(regular * success, c)); make(success, regular); images = success;
  } else if (p.kind === "sns") {
    const generatedCards = Math.max(0, p.images - p.placedCards);
    const outputs = generatedCards * p.slotsPerCard;
    const slotPrice = price(p, c, false, p.slotsPerCard > 1);
    const successfulOutputs = Math.max(0, success - p.placedCards) * p.slotsPerCard;
    make(successfulOutputs, slotPrice, success); images = success;
    const reserveText = (1 + outputs) * c.planUsd;
    const chargeText = (1 + success) * c.planUsd;
    add(units(outputs * slotPrice + reserveText, c), units((p.billableCount ?? successfulOutputs) * slotPrice + chargeText, c));
    textUsd = p.textOverrideUsd ?? (text + reserveText);
    if (p.slotsPerCard > 1) warnings.push("SNS 슬롯은 입력한 평균 크기 가정입니다. 실제 카드별 레이아웃으로 단가를 확인하세요.");
  } else if (p.kind === "pdp") {
    const batch = c.pdpBatch[p.model];
    if (!batch) throw new Error("현재 상세페이지에서 지원하는 모델을 선택하세요.");
    let successful = success;
    for (let remaining = p.images; remaining > 0; remaining -= batch) { const requestedBatch = Math.min(batch, remaining), made = Math.min(successful, requestedBatch); add(units(price(p, c, true) * requestedBatch, c), units(price(p, c, true) * made, c)); successful -= made; }
    make(success, regular); images = success;
    warnings.push("PDP 차감은 현재 라우트의 정사각 기본값, 공급자 비용은 선택 크기로 추정합니다.");
  } else if (p.kind === "character") {
    const angles = p.angles + Number(p.sheet);
    const madeCandidates = Math.min(success, p.candidates), madeAngles = Math.max(0, success - p.candidates);
    add(units(price(p, c, true) * p.candidates, c), madeCandidates);
    if (angles) add(units(price(p, c, true) * (1 + angles), c), madeAngles);
    make(success, regular, 1 + madeAngles); images = success;
    warnings.push("캐릭터 후보는 성공 장수로 차감하며 선택한 후보 1장과 추가 각도만 보관하는 가정입니다.");
  } else if (p.kind === "redesign-edit") {
    add(units(regular, c), 1); make(1, regular); images = 1;
  } else {
    add(units(price(p, c, p.kind === "character-angle") * p.images, c), units(price(p, c, p.kind === "character-angle") * success, c));
    make(success, regular); images = success;
  }
  if (p.billableCount !== null) { imageUsd = p.billableCount * (p.kind === "sns" ? price(p, c, false, p.slotsPerCard > 1) : regular); providerOutputs = p.billableCount; }
  // A user retry is a billable new image, not a service retry multiplier.
  for (let i = 0; i < p.regenerations; i++) {
    if (p.kind === "sns") {
      const cost = price(p, c, false, p.slotsPerCard > 1) * p.slotsPerCard;
      add(units(cost + c.planUsd * p.slotsPerCard, c), units(cost + c.planUsd * 2, c));
      imageUsd += cost; textUsd += c.planUsd * p.slotsPerCard; providerOutputs += p.slotsPerCard;
    } else {
      const reserve = units(price(p, c, ["pdp", "character-angle"].includes(p.kind)), c);
      add(reserve, p.kind === "redesign-edit" ? 1 : reserve);
      imageUsd += regular; providerOutputs++;
    }
    images++;
    if (p.kind !== "sns" && p.storageMode !== "overwrite") savedImages++;
  }
  if (policy === "image-v2") {
    const each = imageCredits({ width: p.width, height: p.height });
    steps.splice(0, steps.length);
    if (p.kind === "character") {
      const madeCandidates = Math.min(success, p.candidates), angles = p.angles + Number(p.sheet);
      add(p.candidates * each, madeCandidates * each);
      if (angles) add(angles * each, Math.max(0, success - p.candidates) * each);
    } else if (p.kind === "pdp") {
      const batch = c.pdpBatch[p.model] ?? 3; let made = success;
      for (let left = p.images; left > 0; left -= batch) { const count = Math.min(batch, left); add(count * each, Math.min(made, count) * each); made -= Math.min(made, count); }
    } else add((p.kind === "redesign-edit" ? 1 : p.images) * each, (p.kind === "redesign-edit" ? 1 : success) * each);
    for (let i = 0; i < p.regenerations; i++) add(each);
    warnings.push("새 정책: 최종 이미지 기준. 기획·내부 슬롯·서비스 재시도 원가는 별도 집계하며 회원에게 추가 차감하지 않습니다.");
  } else if (p.proposedCharge !== null) {
    steps.splice(0, steps.length, { charged: p.proposedCharge, reserved: Math.max(p.proposedRequired ?? p.proposedCharge, p.proposedCharge) });
    warnings.push("제안 차감표를 고정해서 예측합니다. 실제 서비스 정책을 변경하지 않습니다.");
  }
  let charged = 0, required = 0;
  for (const step of steps) { required = Math.max(required, charged + step.reserved); charged += step.charged; }
  if (!(charged > 0)) throw new Error("0크레딧 활동은 회원당 무료 분석 횟수로 입력하세요.");
  const failed = p.failurePct / (100 - p.failurePct);
  const apiUsd = imageUsd * (1 + p.serviceRetryPct / 100 + failed * p.failureCostPct / 100) + textUsd * (1 + failed * p.failureCostPct / 100);
  const expectedOutputs = providerOutputs * (1 + p.serviceRetryPct / 100 + failed * p.failedFilePct / 100);
  savedImages += providerOutputs * (p.serviceRetryPct / 100 + failed * p.failedFilePct / 100) * p.extraSavePct / 100;
  const cloud = p.storageMode === "browser-only" ? 0 : p.savePct / 100;
  let savedMB: number | null = p.originalMB === null || p.previewMB === null ? null : savedImages * (p.originalMB + p.previewMB) * cloud;
  const uploads = savedImages + (p.kind === "sns" || p.storageMode === "overwrite" ? p.regenerations : 0);
  const uploadMB = cloud === 0 ? 0 : p.originalMB === null || p.previewMB === null ? null : uploads * (p.originalMB + p.previewMB) * cloud;
  // Poster/SNS status responses contain URLs. PDP/character/redesign return base64 bytes.
  const responseFactor = p.responseFactor ?? (["poster", "sns"].includes(p.kind) ? 0 : 4 / 3);
  const responseMB = responseFactor === 0 ? 0 : p.originalMB === null ? null : images * p.originalMB * responseFactor;
  if (cloud === 0) savedMB = 0;
  if (p.storageMode === "overwrite" && p.kind !== "sns") {
    // A profile describing an existing object replacement: only the byte delta grows the stock.
    savedMB = savedMB === null || p.replacedMB === null ? null : savedMB - p.replacedMB * p.images * cloud;
    if (p.replacedMB === null) warnings.push("교체할 기존 파일 크기가 없어 저장 순증을 확인할 수 없습니다.");
  }
  return { id: p.id, label: p.label, weight: 1, steps, charged, required, imageUsd, textUsd, apiUsd, providerOutputs: expectedOutputs, images,
    savedImages: savedImages * cloud, savedMB, uploadMB, responseMB, originalMB: p.originalMB, previewMB: p.previewMB, warnings };
}

/** For build-time synchronization of the old offline calculators (not copied prices). */
export function legacyModels(c: PriceCatalog) {
  const sizes = [[1024, 768], [1024, 1024], [1024, 1536], [1920, 1080], [2560, 1440], [3840, 2160]];
  const mapping: Record<string, string> = { flare: "gpt-image-2.5-flare", sunburst: "gpt-image-2.5-sunburst", gpt2: "gpt-image-2", pro: "nano-banana-pro", nano2: "nano-banana-2", nano: "nano-banana" };
  const result: Record<string, { label: string; flat?: number; prices?: number[]; edit?: number[] }> = {};
  for (const [key, id] of Object.entries(mapping)) {
    const m = c.models.find(x => x.id === id)! as ImageModel;
    result[key] = m.t2i.flatUsd !== undefined ? { label: m.label, flat: unitPrice(m, "t2i", { width: 1024, height: 1024 }) }
      : { label: m.label, prices: sizes.map(([width, height]) => unitPrice(m, "t2i", { width: width!, height: height! })), edit: sizes.map(([width, height]) => unitPrice(m, "i2i", { width: width!, height: height! })) };
  }
  for (const [key, model] of Object.entries({ seedream: "seedream-5-pro", qwen: "qwen-image-2-pro", ro: "redesign-openai", rg: "redesign-google" })) result[key] = { label: model, flat: c.flat[model] };
  return result;
}
