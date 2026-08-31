import { z } from "zod";

export const ReferencePurposeSchema = z.enum(["cardnews", "poster", "both"]);
export const ReferenceRoleSchema = z.enum(["cover", "body", "ending"]);

export const SetItemInputSchema = z.object({
  referenceImageId: z.string().trim().min(1),
  role: ReferenceRoleSchema,
  position: z.number().int().min(0),
}).strict();

export const SetInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  purpose: ReferencePurposeSchema,
  items: z.array(SetItemInputSchema),
}).strict().superRefine((value, context) => {
  for (const role of ["cover", "ending"] as const) {
    if (value.items.filter((item) => item.role === role).length > 1) {
      context.addIssue({
        code: "custom",
        path: ["items"],
        message: role === "cover" ? "표지는 한 장만 고를 수 있습니다." : "엔딩은 한 장만 고를 수 있습니다.",
      });
    }
  }
});

export type ReferencePurpose = z.infer<typeof ReferencePurposeSchema>;
export type ReferenceRole = z.infer<typeof ReferenceRoleSchema>;
export type SetItemInput = z.infer<typeof SetItemInputSchema>;
export type SetInput = z.infer<typeof SetInputSchema>;

export interface ReferenceSetItemRecord extends SetItemInput {
  id: string;
}

export interface ReferenceSetRecord {
  id: string;
  name: string;
  purpose: ReferencePurpose;
  items: ReferenceSetItemRecord[];
  createdAt: string;
  updatedAt: string;
}

export function groupByRole(items: SetItemInput[]) {
  const sorted = [...items].sort((a, b) => a.position - b.position);
  return {
    cover: sorted.find((item) => item.role === "cover"),
    body: sorted.filter((item) => item.role === "body"),
    ending: sorted.find((item) => item.role === "ending"),
  };
}
