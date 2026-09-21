/**
 * 생성 요청에 실을 칸들.
 *
 * ── 왜 화면 밖으로 뺐나 ─────────────────────────────────────
 *
 * 「나머지 섹션 생성」이 한 장씩 여러 번 부르면서 **작업 정보**(몇 번째 청크
 * 인가)와 **이미 한 기획**을 함께 보내야 했다(F-7-7). 그런데 그 배선이 화면
 * 안에 있으면 **돌려 볼 방법이 없다** — 마법사는 렌더 시험 틀이 없다.
 *
 * 칸을 채우는 일만 떼어 내면 실제로 채워 보고 확인할 수 있다.
 */

export type GenerateFieldsInput = {
  uploadFiles: File[];
  knowledgeText: string;
  useKnowledge: boolean;
  request: string;
  model: string;
  channel: string;
  ratio: string;
  look: string;
  count: number;
  startSection: number;
  rolloutRequest: string;
  transcript?: string | null;
  characterId?: string;
  characterAngles?: string[];
  /**
   * 논리 작업 안에서 **몇 번째 청크**이고 **모두 몇 장**인가.
   *
   * 값은 서버가 정한다 — 화면은 자리만 말한다. 장수를 보내게 하면 0 을 보내
   * 공짜로 만들 수 있다(`lib/redesign/chunk-billing.ts`).
   */
  jobIndex?: number;
  jobTotal?: number;
  /**
   * **이미 한 기획.** 앞 청크의 응답에 실려 온 것을 도로 보낸다.
   *
   * 안 보내면 청크마다 다시 분석한다 — 글 모델 값이 청크 수만큼 늘고,
   * 무엇보다 **청크마다 다른 계획**이 나온다.
   */
  analysis?: unknown;
  /**
   * **그 기획이 어느 원본에서 나왔는가**(`project.files`).
   *
   * 저장된 작업을 열면 원본 파일은 복원되지 않는다. 그 상태에서 **다른
   * 제품** 이미지를 올리고 「나머지 섹션 생성」을 누르면, 새 제품을 그리면서
   * 옛 제품의 전략과 `verified_facts` 가 프롬프트에 실린다. 조작이 아니라
   * **평범한 오조작**으로 닿는다.
   *
   * 전에는 청크마다 다시 분석했으므로 값은 비쌌어도 내용은 맞았다. 다시 안
   * 하기로 한 이상 여기서 묶는다 — **다르면 안 보낸다.** 안 보내면 코어가
   * 제가 분석한다.
   */
  analysisFiles?: string[];
  /**
   * **페이지가 몇 장짜리인가.** 이 요청이 만드는 장수와 다른 수다.
   *
   * 화면은 장마다 따로 부르므로 `count` 는 늘 1이다. 그것으로 프롬프트의
   * 「N장을 이어 붙였을 때」를 적으면 모든 요청이 「1장」이 된다.
   */
  pageTotal?: number;
};

/** 같은 원본에서 나온 기획인가. 이름과 차례가 모두 같아야 한다. */
function fromSameSource(uploadFiles: File[], analysisFiles?: string[]): boolean {
  if (!Array.isArray(analysisFiles) || analysisFiles.length === 0) return false;
  const 지금 = uploadFiles.map((file) => file.name);
  return 지금.length === analysisFiles.length && 지금.every((name, i) => name === analysisFiles[i]);
}

export function appendGenerateFields(form: FormData, input: GenerateFieldsInput): FormData {
  input.uploadFiles.forEach((file) => form.append("files", file));
  form.append("knowledgeText", input.knowledgeText);
  form.append("useKnowledge", String(input.useKnowledge));
  form.append("request", input.request);
  form.append("model", input.model);
  form.append("channel", input.channel);
  form.append("ratio", input.ratio);
  form.append("look", input.look);
  form.append("count", String(input.count));
  form.append("startSection", String(input.startSection));
  form.append("rolloutRequest", input.rolloutRequest);
  if (input.transcript) form.append("transcript", input.transcript);

  // 각도는 여러 번 넣는다 — 라우트가 `getAll` 로 받는다. 안 넣으면 자동이다.
  if (input.characterId) {
    form.append("characterId", input.characterId);
    for (const angle of input.characterAngles ?? []) form.append("characterAngles", angle);
  }

  // 쪼개 부를 때만 붙는다. 한 번에 부르면 붙일 것이 없다.
  if (input.jobIndex && input.jobTotal && input.jobTotal > 1) {
    form.append("jobIndex", String(input.jobIndex));
    form.append("jobTotal", String(input.jobTotal));
  }
  if (input.pageTotal && input.pageTotal > 1) form.append("pageTotal", String(input.pageTotal));
  if (input.analysis && fromSameSource(input.uploadFiles, input.analysisFiles)) {
    form.append("analysis", JSON.stringify(input.analysis));
  }

  return form;
}
