import type { SourceResolverDependencies } from "./source-resolver";

/**
 * 실제 어댑터를 붙인다.
 *
 * 수집 미디어·수집함이 쓰는 것과 **같은 어댑터**다. 카드뉴스만 따로 만들면
 * 유튜브 자막 우회(직접 → apify) 같은 경험이 한쪽에만 남는다.
 *
 * **부를 때 불러온다.** 어댑터가 jsdom·playwright 같은 무거운 Node 패키지를
 * 끌고 오는데, 모듈 최상단에서 가져오면 Next 가 빌드할 때 페이지 정보를
 * 모으다가 깨진다. 실제로 쓸 때만 필요하다.
 */
export function createSourceAdapters(
  environment: Record<string, string | undefined> = process.env,
): SourceResolverDependencies {
  return {
    async ingestYoutube(input) {
      const { ingestYoutube } = await import("@fixup/ingest-core/src/adapters/youtube");
      return ingestYoutube(input);
    },
    async ingestWeb(input) {
      const { ingestWeb } = await import("@fixup/ingest-core/src/adapters/web");
      return ingestWeb(input);
    },
    async research(question: string) {
      const { createOpenAITopicResearcher, TopicResearchNotConfiguredError } =
        await import("@fixup/ingest-core/src/adapters/topic");
      const key = environment.OPENAI_API_KEY?.trim();
      if (!key) throw new TopicResearchNotConfiguredError();
      const researcher = createOpenAITopicResearcher({
        OPENAI_API_KEY: key,
        OPENAI_DRAFT_MODEL: environment.OPENAI_DRAFT_MODEL,
        OPENAI_RESEARCH_MODEL: environment.OPENAI_RESEARCH_MODEL,
      });
      return researcher(question);
    },
  };
}
