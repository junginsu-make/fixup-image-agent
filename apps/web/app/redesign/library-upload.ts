import type { ProcessSource } from "../api/library/work-process";

/**
 * 리디자인 작업의 **지금 판을** 라이브러리에 새 작업 하나로, 한 장씩 올린다.
 *
 * 섹션은 만들 때마다 이미 한 장씩 자동으로 올라가 있다. 전에는 「라이브러리에
 * 저장」 단추가 전 장을 **같은 작업 뒤에** 다시 붙여 여덟 장이 열여섯 장이
 * 됐다(2026-09-23 점검). 한 요청에 다 담아 앞단 본문 한도(10MB)에도 걸렸다.
 *
 * 「이미 있는 자리는 건너뛴다」로는 못 고친다 — 장수만 보고 내용을 못 가려,
 * 고친 섹션을 버리거나 빠진 장 자리에 다른 장을 붙였다(독립 리뷰). 그래서
 * 부르는 쪽이 **누를 때마다 새 작업 열쇠**를 준다. 첫 장이 작업을 만들고
 * 나머지는 그 뒤에 차례로 붙는다.
 */
export async function uploadRedesignToLibrary(input: {
  title: string;
  /** 이번 저장만의 작업 열쇠(uuid). 같은 열쇠의 장은 한 줄로 모인다. */
  sourceId: string;
  /** 만든 과정. 무엇을 남길지는 서버가 고른다(`api/library/work-process.ts`). */
  process: ProcessSource;
  images: ReadonlyArray<{ base64: string; mimeType: string }>;
}): Promise<{ added: number; failure: string }> {
  let added = 0;
  for (const image of input.images) {
    const response = await fetch("/api/library", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: input.title,
        tool: "redesign",
        sourceId: input.sourceId,
        ...input.process,
        images: [image],
      }),
    });
    // JSON 이 아닌 답(502·로그인 만료 화면)도 실패 길로 보낸다. 던지면 몇 장까지
    // 저장됐는지가 사라지고 알 수 없는 문구만 뜬다(후속 독립 리뷰).
    const body = (await response.json().catch(() => ({ ok: false }))) as { ok?: boolean; message?: string };
    if (!response.ok || !body.ok) {
      const 사유 = body.message ?? "라이브러리에 저장하지 못했습니다.";
      return { added, failure: added > 0 ? `${added}장까지 저장하고 멈췄습니다. ${사유}` : 사유 };
    }
    added += 1;
  }
  return { added, failure: "" };
}
