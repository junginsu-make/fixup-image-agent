import type { PdpAnalyzeRequest, PdpGenerateImageRequest } from "./types";
import { PdpService, PdpServiceError, toPdpErrorResponse } from "./pdp.service";
import type { PdpLlm } from "./pdp.llm";

export class PdpController {
  constructor(private readonly pdpService = new PdpService()) {}

  async analyze(
    body: PdpAnalyzeRequest,
    llm?: PdpLlm,
    options?: { skipFirstImage?: boolean }
  ) {
    try {
      const result = await this.pdpService.analyzeProduct(body, llm, options);
      return {
        ok: true as const,
        result
      };
    } catch (error) {
      return toPdpErrorResponse(error);
    }
  }

  async generateImage(body: PdpGenerateImageRequest, llm?: PdpLlm) {
    try {
      const result = await this.pdpService.generateSectionImage(body, llm);
      return {
        ok: true as const,
        ...result
      };
    } catch (error) {
      return toPdpErrorResponse(
        error instanceof PdpServiceError
          ? error
          : new PdpServiceError(
              "PDP_IMAGE_GENERATION_FAILED",
              "이미지 생성 중 오류가 발생했습니다.",
              error instanceof Error ? `${error.name}: ${error.message}` : String(error)
            )
      );
    }
  }
}
