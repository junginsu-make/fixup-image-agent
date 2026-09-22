import { IMAGE_MODELS, type ImageModel } from "@fixup/sns-core";
import { CREDIT_UNIT_USD, LLM_PLAN_USD, LLM_VISION_READ_USD } from "@fixup/shared";
import { imageUnitUsd } from "../../credit-cost";
import { IMAGE_MODELS as PDP_MODELS } from "@fixup/pdp-core";

export interface PriceCatalog {
  version: string;
  checkedAt: string;
  models: ImageModel[];
  flat: Record<string, number>;
  pdpBatch: Record<string, number>;
  creditUsd: number;
  planUsd: number;
  visionUsd: number;
  ec2: Array<{ id: string; ram: number; cpu: number; hourly: number }>;
  compute: Record<string, number>;
  supabase: {
    pro: number; computeCredit: number; storageGBHour: number; diskGBHour: number;
    cachedGB: number; uncachedGB: number; mau: number;
    freeStorageGB: number; proStorageGB: number; freeEgressGB: number; proEgressGB: number;
    freeDatabaseGB: number; proDiskGB: number; freeMau: number; proMau: number;
  };
  sources: Array<{ label: string; url: string }>;
}

/** Models come from the same pure functions as generation. Infrastructure is a dated snapshot. */
export const CURRENT_CATALOG: PriceCatalog = {
  version: "2026-09-22.1", checkedAt: "2026-09-22",
  models: structuredClone(IMAGE_MODELS),
  flat: Object.fromEntries(["seedream-5-pro", "qwen-image-2-pro", "redesign-openai", "redesign-google"].map(id => [id, imageUnitUsd(id)])),
  pdpBatch: Object.fromEntries(PDP_MODELS.map(model => [model.id, model.maxBatchSize])),
  creditUsd: CREDIT_UNIT_USD, planUsd: LLM_PLAN_USD, visionUsd: LLM_VISION_READ_USD,
  ec2: [
    { id: "t3.micro", ram: 1, cpu: 2, hourly: .013 },
    { id: "t3.small", ram: 2, cpu: 2, hourly: .026 },
    { id: "t3.medium", ram: 4, cpu: 2, hourly: .052 },
    { id: "t3.large", ram: 8, cpu: 2, hourly: .104 },
  ],
  compute: { micro: .01344, small: .0206, medium: .0822, large: .1517 },
  supabase: {
    pro: 25, computeCredit: 10, storageGBHour: .00002919, diskGBHour: .000171,
    cachedGB: .03, uncachedGB: .09, mau: .00325,
    freeStorageGB: 1, proStorageGB: 100, freeEgressGB: 5, proEgressGB: 250,
    freeDatabaseGB: .5, proDiskGB: 8, freeMau: 50000, proMau: 100000,
  },
  sources: [
    { label: "AWS 서울 Linux 단가", url: "https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/ec2/USD/current/ec2-ondemand-without-sec-sel/Asia%20Pacific%20%28Seoul%29/Linux/index.json" },
    { label: "Supabase 요금", url: "https://supabase.com/pricing" },
    { label: "Storage GB-hours", url: "https://supabase.com/docs/guides/platform/manage-your-usage/storage-size" },
    { label: "DB 디스크", url: "https://supabase.com/docs/guides/platform/manage-your-usage/disk-size" },
    { label: "AWS 무료 혜택", url: "https://aws.amazon.com/free/free-tier-faqs/" },
  ],
};
