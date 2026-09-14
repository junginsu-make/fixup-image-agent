import { failureReason, isExecutionControl } from "@fixup/shared";
import type { ProjectSource } from "../../app/api/sns/projects/schema";

/**
 * 01 내용을 **실제로 가져온다.**
 *
 * 예전에는 유튜브·웹 주소를 `"가져올 주소: https://..."` 문자열로 LLM 에 넘겼다.
 * LLM 은 그 주소를 열어 볼 수 없으므로 **내용을 지어냈다.** 화면에는 정상으로
 * 보이고 결과만 틀린, 가장 나쁜 종류의 실패였다.
 *
 * **못 가져오면 빈 글을 돌려주고 이유를 남긴다.** 지어낸 글로 카드뉴스를
 * 만들면 안 된다.
 */

export interface SourceCitation {
  title: string;
  url: string;
}

export interface ResolvedSource {
  text: string;
  /** 어디서 가져왔나. 사람이 확인할 수 있어야 한다. */
  origin?: string;
  citations?: SourceCitation[];
  issues: string[];
}

interface SourceDocumentLike {
  segments: Array<{ text: string }>;
}

export interface SourceResolverDependencies {
  ingestYoutube(input: { id: string; url: string }): Promise<SourceDocumentLike>;
  ingestWeb(input: { id: string; url: string }): Promise<SourceDocumentLike>;
  research(question: string): Promise<{ text: string; citations: SourceCitation[] }>;
}

function joined(document: SourceDocumentLike): string {
  return document.segments.map((segment) => segment.text).join("\n\n").trim();
}

export async function resolveSourceText(
  source: ProjectSource,
  dependencies: SourceResolverDependencies,
): Promise<ResolvedSource> {
  if (source.kind === "text") {
    const text = source.text.trim();
    return text
      ? { text, issues: [] }
      : { text: "", issues: ["내용이 비어 있습니다. 무엇으로 만들지 적어 주세요."] };
  }

  try {
    if (source.kind === "youtube") {
      const text = joined(await dependencies.ingestYoutube({ id: "sns", url: source.url }));
      return text
        ? { text, origin: source.url, issues: [] }
        : { text: "", issues: ["이 영상에서 자막을 찾지 못했습니다. 다른 영상을 쓰거나 직접 적어 주세요."] };
    }

    if (source.kind === "web") {
      const text = joined(await dependencies.ingestWeb({ id: "sns", url: source.url }));
      return text
        ? { text, origin: source.url, issues: [] }
        : { text: "", issues: ["이 주소에서 본문을 찾지 못했습니다. 다른 주소를 쓰거나 직접 적어 주세요."] };
    }

    const found = await dependencies.research(source.question);
    const text = found.text.trim();
    return text
      ? { text, citations: found.citations, issues: [] }
      : { text: "", issues: ["질문에 대한 근거를 찾지 못했습니다. 직접 적어 주세요."] };
  } catch (error) {
    if(isExecutionControl(error))throw error;
    // 실패했는데 계속 진행하면 LLM 이 지어낸다.
    return { text: "", issues: [`내용을 가져오지 못했습니다: ${failureReason(error)}`] };
  }
}
