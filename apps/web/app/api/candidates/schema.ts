import { z } from "zod";

export const CandidateStatusSchema = z.enum(["new", "picked", "requested", "archived"]);
export const CandidatePatchSchema = z.object({ status: CandidateStatusSchema }).strict();

export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
export type CandidatePatch = z.infer<typeof CandidatePatchSchema>;

export function candidateActions(status: CandidateStatus): Array<{ status: CandidateStatus; label: string }> {
  if (status === "new") return [
    { status: "picked", label: "제작 후보로" },
    { status: "archived", label: "보관" },
  ];
  if (status === "picked") return [
    { status: "new", label: "후보 해제" },
    { status: "archived", label: "보관" },
  ];
  if (status === "archived") return [{ status: "new", label: "다시 꺼내기" }];
  return [];
}

export function candidateToDraft(candidate: {
  id: string;
  title: string;
  body: string | null;
  summary: string | null;
  url: string | null;
}) {
  return {
    title: candidate.title,
    source: {
      kind: "collected" as const,
      title: candidate.title,
      text: candidate.body?.trim() || candidate.summary?.trim() || "",
      url: candidate.url,
    },
  };
}
