import { runLlmOperation } from "../../../../../lib/generation/llm-operation";
import { generationFailureResponse, inputHash } from "../../../../../lib/generation/run-store";
import { snsModelSnapshot } from "../../../../../lib/sns/providers";
import { z } from "zod";
import { normalizeAnalysis } from "@fixup/layout-core";
import { withIssueFallback } from "@fixup/shared";
import { authenticateApiMember } from "../../../../../lib/membership/api";
import {
  LayoutAnalysisConfigurationError,
  createLayoutAnalysisProviders,
} from "../../../../../lib/layout/analyze-provider";
import { referenceImageBytes, toDataUrl } from "../../../../../lib/layout/library-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const InputSchema = z.object({ referenceImageId: z.string().trim().min(1).max(200) });

/**
 * 「이 레퍼런스처럼 칸을 잡아 줘」.
 *
 * 돌려주는 것은 **초안**이다. 그대로 쓰지 않는다 — 화면에서 드래그로 고친 뒤
 * 「이대로 쓰기」를 누르는 것이 이 기능의 전부다. 그래서 실패해도 오류가
 * 아니라 「직접 만드세요」라는 안내로 끝난다.
 */
export async function POST(request: Request) {
  const auth = await authenticateApiMember();
  if (!auth.ok) return auth.response;

  const parsed = InputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, message: "레퍼런스를 골라 주세요." }, { status: 400 });
  }

  const image = await referenceImageBytes(auth.member.userId, parsed.data.referenceImageId);
  if (!image) {
    return Response.json({ ok: false, message: "레퍼런스 그림을 찾지 못했습니다." }, { status: 404 });
  }

  let providers: ReturnType<typeof createLayoutAnalysisProviders>;
  try {
    providers = createLayoutAnalysisProviders();
  } catch (error) {
    if (error instanceof LayoutAnalysisConfigurationError) {
      return Response.json({ ok: false, message: error.message }, { status: error.status });
    }
    throw error;
  }

  try {
  const url = toDataUrl(image);
  const result = await runLlmOperation(request, auth.member.userId, {operation:"layout_analyze",identity:{referenceImageId:parsed.data.referenceImageId,digest:inputHash(url)},models:Object.values(snsModelSnapshot()),maxCalls:2,isSuccess:value=>value.value!==undefined}, () => withIssueFallback(
    () => providers.primary.analyze(url),
    providers.backup ? () => providers.backup!.analyze(url) : undefined,
    {
      primaryFailure: "주 모델 칸 읽기 실패",
      backupMissing: "예비 제공자가 없어 한 번만 시도했습니다.",
      backupFailure: "OpenAI 예비로도 칸을 읽지 못했습니다",
      backupSuccess: "주 모델이 실패해 OpenAI 예비로 칸을 읽었습니다",
    },
  ));

  if (result.value === undefined) {
    return Response.json({
      ok: true,
      slots: [],
      issues: [...result.issues, "레퍼런스에서 칸을 읽어내지 못했습니다. 직접 만들어 주세요."],
    });
  }

  const analyzed = normalizeAnalysis(result.value);
  return Response.json({ ok: true, slots: analyzed.slots, issues: [...result.issues, ...analyzed.issues] });
  } catch(error) {
    return generationFailureResponse(error)??Response.json({ok:false,message:"분석 결과를 처리하지 못했습니다."},{status:503});
  }
}
