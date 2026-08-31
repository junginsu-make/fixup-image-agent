import { applyUserEdit, spliceBullet } from "@fixup/pdp-core";
import type { LandingPageBlueprint } from "@fixup/pdp-core";

export function updateScenarioBullets(
  blueprint: LandingPageBlueprint,
  sectionIndex: number,
  bullets: string[],
): LandingPageBlueprint {
  const current = blueprint.sections[sectionIndex];
  if (!current) return blueprint;
  if (bullets.length !== current.bullets.length) {
    const changed = current.bullets.findIndex((value, index) => value !== bullets[index]);
    const bulletIndex = changed < 0 ? Math.min(bullets.length, current.bullets.length) : changed;
    return {
      ...blueprint,
      sections: blueprint.sections.map((section, index) => index !== sectionIndex
        ? section
        : spliceBullet(section, bulletIndex, bullets.length > current.bullets.length ? "" : undefined)),
    };
  }
  const changed = bullets.findIndex((value, index) => value !== current.bullets[index]);
  return changed < 0
    ? blueprint
    : applyUserEdit(blueprint, current.section_id, { slot: "bullet", index: changed }, bullets[changed]);
}
