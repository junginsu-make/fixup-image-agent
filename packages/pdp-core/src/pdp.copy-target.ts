import type { CopyTarget, SectionBlueprint } from "./types";

export function targetKey(target: CopyTarget): string {
  return target.slot === "bullet" ? `bullet:${target.index}` : target.slot;
}

export function sameTarget(a: CopyTarget, b: CopyTarget): boolean {
  return targetKey(a) === targetKey(b);
}

export function readCopyTarget(
  section: SectionBlueprint,
  target: CopyTarget,
): string | undefined {
  if (target.slot === "bullet") {
    return section.bullets[target.index];
  }
  return section[target.slot];
}

export function writeCopyTarget(
  section: SectionBlueprint,
  target: CopyTarget,
  value: string,
): SectionBlueprint {
  if (target.slot === "bullet") {
    if (target.index < 0 || target.index >= section.bullets.length) return section;
    return {
      ...section,
      bullets: section.bullets.map((bullet, index) => (index === target.index ? value : bullet)),
    };
  }
  return { ...section, [target.slot]: value };
}

export function spliceBullet(
  section: SectionBlueprint,
  index: number,
  insert?: string,
): SectionBlueprint {
  const isInsertion = insert !== undefined;
  if (index < 0 || index > section.bullets.length || (!isInsertion && index === section.bullets.length)) {
    return section;
  }

  const bullets = [...section.bullets];
  const bulletsEn = [...section.bullets_en];
  if (isInsertion) {
    bullets.splice(index, 0, insert);
    if (bulletsEn.length > 0) bulletsEn.splice(index, 0, insert);
  } else {
    bullets.splice(index, 1);
    if (index < bulletsEn.length) bulletsEn.splice(index, 1);
  }

  const evidence = section.evidence
    ?.filter((entry) => isInsertion || entry.target.slot !== "bullet" || entry.target.index !== index)
    .map((entry) => {
      if (entry.target.slot !== "bullet") return entry;
      const shouldShift = isInsertion ? entry.target.index >= index : entry.target.index > index;
      if (!shouldShift) return entry;
      return {
        ...entry,
        target: {
          slot: "bullet" as const,
          index: entry.target.index + (isInsertion ? 1 : -1),
        },
      };
    });

  return { ...section, bullets, bullets_en: bulletsEn, ...(evidence ? { evidence } : {}) };
}
