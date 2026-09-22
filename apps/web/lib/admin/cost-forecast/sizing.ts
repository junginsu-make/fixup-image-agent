import type { PriceCatalog } from "./catalog";
import type { AwsConfig, CapacityConfig } from "./schema";

export interface Recommendation {
  status: "assumption-based" | "measurement-based" | "insufficient-profile";
  ec2Type: string | null; peakJobs: number | null; requiredRamGiB: number | null;
  hourlyUsd: number | null; currentDeltaUsd: number | null; cpuValidated: boolean; dbValidated: boolean;
  warnings: string[];
}
export function recommendCapacity(c: CapacityConfig, active: number, images: number, aws: AwsConfig, prices: PriceCatalog): Recommendation {
  const peak = c.peakJobs ?? (images > 0 ? Math.ceil(active * c.peakPct / 100) : 0);
  const ram = c.baseRamGiB === null || c.jobRamGiB === null ? null : (c.baseRamGiB + peak * c.jobRamGiB) / (c.maxRamPct / 100);
  const cpu = c.cpuSecondsPerJob === null || c.peakJobsPerSecond === null ? null : c.cpuSecondsPerJob * c.peakJobsPerSecond / (c.maxCpuPct / 100);
  const candidate = ram === null ? undefined : prices.ec2.filter(x => x.ram >= ram && (cpu === null || x.cpu >= cpu)).sort((a, b) => a.hourly - b.hourly)[0];
  const measured = c.mode === "measured" && c.measuredOn !== null && c.measuredMaxJobs !== null && c.measuredMaxJobs >= peak && c.measuredType === candidate?.id && c.profileId !== null;
  const current = prices.ec2.find(x => x.id === aws.currentType);
  const warnings = ["CPU·외부 공급자 한도·쿼리 지연은 RAM 추천과 별도입니다."];
  if (!measured) warnings.push("메모리·동시 작업 입력에 따른 가정 기반 후보입니다. 실제 처리 능력을 보장하지 않습니다.");
  if (!candidate) warnings.push("입력 부하가 후보 범위를 넘거나 RAM 정보가 없습니다.");
  if (aws.region !== "ap-northeast-2") warnings.push("자동 후보 가격은 서울 Linux 기준입니다. 다른 리전은 직접 요금을 입력하세요.");
  return { status: !candidate ? "insufficient-profile" : measured ? "measurement-based" : "assumption-based", ec2Type: candidate?.id ?? null, peakJobs: peak, requiredRamGiB: ram,
    hourlyUsd: aws.region === "ap-northeast-2" ? candidate?.hourly ?? null : null,
    currentDeltaUsd: current && candidate && aws.region === "ap-northeast-2" ? (candidate.hourly - current.hourly) * 730 : null,
    cpuValidated: measured && cpu !== null, dbValidated: measured && c.dbValidated, warnings };
}
