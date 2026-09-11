/** V2 application / database contract; legacy RPC names remain unchanged. */
export const GENERATION_OPERATIONS = [
  "pdp_analyze", "pdp_image", "redesign_generate", "redesign_edit", "poster_image", "sns_image",
  "redesign_transcribe", "sns_plan", "sns_caption", "layout_analyze", "poster_review", "poster_plan"
] as const;
export type GenerationOperationV2 = typeof GENERATION_OPERATIONS[number];
