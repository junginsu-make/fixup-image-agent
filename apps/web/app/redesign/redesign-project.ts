/**
 * 작업 하나를 다루는 순수 계산 — 제목 짓기, 합치기, 수정 이력.
 *
 * 화면이 없어도 값으로 잴 수 있는 것만 모았다.
 */

import type { Model, Project, SectionResult, SectionRevision } from "./redesign-model";
export function projectDisplayTitle(project: Partial<Project>) {
  const inferred = inferTitleFromAnalysis(project.analysis);
  if (inferred) return inferred;
  const current = String(project.title || "").trim();
  if (current && !current.includes(new Date().getFullYear().toString())) return current;
  return current || `${project.channel || "스마트스토어"} 상세페이지 리디자인`;
}

export function mergeGeneratedProject(baseProject: Project, generatedProject: Project): Project {
  const sections = [...baseProject.sections];
  for (const generatedSection of generatedProject.sections) {
    const existingIndex = sections.findIndex((section) => section.id === generatedSection.id);
    if (existingIndex >= 0) sections[existingIndex] = generatedSection;
    else sections.push(generatedSection);
  }

  sections.sort((a, b) => sectionSortNumber(a.id) - sectionSortNumber(b.id));

  return {
    ...baseProject,
    title: projectDisplayTitle(baseProject) || projectDisplayTitle(generatedProject),
    status: generatedProject.status,
    count: sections.length,
    sections,
    analysis: generatedProject.analysis || baseProject.analysis,
    createdAt: baseProject.createdAt || generatedProject.createdAt
  };
}

export function sectionSortNumber(sectionId: string) {
  const sectionNumber = Number(sectionId.replace(/\D/g, ""));
  return Number.isFinite(sectionNumber) ? sectionNumber : 999;
}


export function addSectionRevision(section: SectionResult, nextImageUrl: string, nextPrompt: string, request: string, model: Model): SectionResult {
  const history = ensureSectionRevisions(section);
  const nextRevision: SectionRevision = {
    id: `revision-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    imageUrl: nextImageUrl,
    label: `수정 ${history.length}`,
    createdAt: new Date().toISOString(),
    request,
    model
  };

  return {
    ...section,
    imageUrl: nextImageUrl,
    prompt: nextPrompt,
    revisions: [...history, nextRevision]
  };
}

export function ensureSectionRevisions(section: SectionResult): SectionRevision[] {
  const revisions = section.revisions?.length
    ? section.revisions
    : section.imageUrl
      ? [{
          id: `${section.id}-original`,
          imageUrl: section.imageUrl,
          label: "원본",
          createdAt: section.id
        }]
      : [];

  if (section.imageUrl && revisions.every((revision) => revision.imageUrl !== section.imageUrl)) {
    return [
      ...revisions,
      {
        id: `${section.id}-current-${revisions.length}`,
        imageUrl: section.imageUrl,
        label: `수정 ${revisions.length}`,
        createdAt: new Date().toISOString()
      }
    ];
  }

  return revisions;
}

export function inferTitleFromAnalysis(analysis: unknown) {
  if (!analysis || typeof analysis !== "object" || !("product_inferred" in analysis)) return "";
  const product = (analysis as { product_inferred?: Record<string, unknown> }).product_inferred || {};
  const brand = pickAnalysisText(product, ["brand_name", "brand", "manufacturer", "maker"]);
  const productName = pickAnalysisText(product, ["product_name", "name", "product", "title"]);
  const category = pickAnalysisText(product, ["category", "product_category"]);

  if (brand && productName) return productName.includes(brand) ? `${productName} 리디자인` : `${brand} ${productName} 리디자인`;
  if (productName) return `${productName} 리디자인`;
  if (category) return `${category} 상세페이지 리디자인`;
  return "";
}

export function pickAnalysisText(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

