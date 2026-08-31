// Public surface of @fixup/redesign-core.
// Thin Next.js route adapters import from here, parse the request, call the
// function, then serialize the result (mapping RedesignError.status / 500).

export { RedesignError } from "./errors.js";

// generate route
export {
  generateSections,
  humanizeProviderError,
  type GenerateSectionsInput,
  type GenerateInputFile
} from "./generate.js";

// edit-section route
export { editSection, humanizeEditError, type EditSectionInput } from "./edit-section.js";

// knowledge route (GET / POST / DELETE)
export {
  knowledgeStats,
  indexKnowledge,
  deleteKnowledge,
  type IndexKnowledgeInput,
  type DeleteKnowledgeInput
} from "./knowledge.js";

// config route (GET)
export { getServerConfig } from "./config.js";

// client-log route (POST)
export { logClientEvent, type LogClientEventInput } from "./client-log.js";

// RAG primitives (also re-exported for direct use / advanced adapters)
export {
  isRagConfigured,
  ensureRagSchema,
  indexKnowledgeDocument,
  retrieveKnowledge,
  getKnowledgeStats,
  deleteKnowledgeDocument,
  filterByRelevance,
  normalizeKnowledgeKind,
  DEFAULT_MIN_SIMILARITY,
  type KnowledgeKind,
  type RetrieveKnowledgeOptions,
  type RetrievedKnowledge
} from "./rag.js";

// knowledge access-key gating primitives
export {
  isKnowledgeAccessRequired,
  canUseCommonKnowledge,
  isKnowledgeAdminRequired,
  canManageCommonKnowledge
} from "./knowledge-access.js";

// transcribe route
export {
  transcribeStrips,
  GOOGLE_READING_MODEL,
  type TranscribeStripsInput,
  type TranscribeStripsResult
} from "./transcribe.js";
export {
  planTranscribeBatches,
  stitchTranscripts,
  type RedesignStrip
} from "./transcribe-batching.js";
