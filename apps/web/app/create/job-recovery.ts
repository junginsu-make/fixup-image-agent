import type { SectionBlueprint } from "@fixup/pdp-core";

/**
 * 돌아온 사용자가 무엇을 되찾는가.
 *
 * ── 화면 밖에 두는 이유 ────────────────────────────────────────
 *
 * 「무엇을 덮고 무엇을 두는가」는 실제 판단이다. `.tsx` 안에 있으면 시험이
 * 값으로 못 재고, 한 줄을 지워도 전부 통과한다. 이 저장소가 이미 그렇게 겪었다
 * (`page-wire.ts`·`generation-run.ts` 머리말).
 *
 * ── 가장 조심할 것 ────────────────────────────────────────────
 *
 * **이미 있는 그림을 덮지 않는다.** 되찾기가 사용자가 그 뒤에 한 작업을
 * 지우면, 고치려던 손실을 다른 모양으로 다시 내는 셈이다.
 */

export interface RecoverableJobItem {
  sectionId: string;
  /** 저장된 그림의 주소. 못 올렸으면 `null` 이다. */
  url: string | null;
  errorCode?: string | null;
}

export interface RecoverableJob {
  id: string;
  outcome: string;
  items: RecoverableJobItem[];
}

export interface RecoveredImage {
  sectionId: string;
  url: string;
}

/**
 * 서버에 적힌 작업에서 **아직 화면에 없는 그림만** 고른다.
 *
 * 건너뛰는 것 셋:
 *   - 이미 그림이 있는 섹션 (그 뒤 편집이 날아간다)
 *   - 저장에 실패해 주소가 없는 섹션 (가리킬 자리가 없다)
 *   - 지금 구성안에 없는 섹션 (그 사이 구성을 바꿨을 수 있다)
 */
export function recoverableSections(
  job: RecoverableJob,
  sections: SectionBlueprint[],
): RecoveredImage[] {
  const 비어있는섹션 = new Set(
    sections.filter((section) => !section.generatedImage).map((section) => section.section_id),
  );

  return job.items
    .filter((item) => item.url && 비어있는섹션.has(item.sectionId))
    .map((item) => ({ sectionId: item.sectionId, url: item.url! }));
}

/**
 * 생성 요청에 실을 문서 표시.
 *
 * **아직 저장 안 한 작업은 아무것도 안 싣는다.** 서버가 예약 식별자로 대신하며,
 * 그때는 그 요청 한 건만 묶인다. 없는 id 를 지어내면 다음에 저장했을 때
 * 두 개로 갈린다.
 */
export function jobRequestFields(
  draftId: string | null,
  revision: number,
): { documentId?: string; revision?: number } {
  if (!draftId) return {};
  return { documentId: draftId, revision };
}

/**
 * 이 초안에 **되찾기를 물어볼 값어치가 있는가**(K-04).
 *
 * 되찾기는 화면이 먼저 서버에 물어봐야 일어난다. 그런데 초안을 열 때마다
 * 질의를 하나씩 더 보내는 일이라, 물어볼 까닭이 있을 때만 묻는다.
 *
 * 까닭은 하나다 — **그림이 빠진 섹션이 있을 때.** 다 채워져 있으면 되찾아
 * 올 것이 없고(`recoverableSections` 가 어차피 빈 목록을 준다), 질의만 는다.
 *
 * **저장 안 한 작업은 못 묻는다.** 서버는 그때 예약 식별자로 작업을 묶었고
 * 화면은 그 값을 모른다 — `jobRequestFields` 가 아무것도 안 싣는 것과 같은
 * 까닭이다.
 */
export function shouldAskForRecovery(
  draftId: string | null,
  sections: readonly SectionBlueprint[],
): boolean {
  if (!draftId) return false;
  return sections.some((section) => !section.generatedImage);
}

/**
 * 되찾은 그림을 **그 자리에서 구워 들인다**(K-04 리뷰 HIGH).
 *
 * ── 왜 주소를 그대로 두면 안 되나 ──────────────────────────
 *
 * 서버가 주는 것은 **한 시간짜리 서명 주소**다(`lib/pdp/jobs/artifact-urls.ts`
 * 의 `TTL_SECONDS = 3600`). 그것을 `generatedImage` 에 그대로 넣으면 자동
 * 저장이 그 주소를 초안에 적고, **한 시간 뒤 그 초안은 깨진 그림으로 열린다.**
 *
 * 그때는 되찾을 수도 없다 — 칸이 차 있으니 `shouldAskForRecovery` 가 묻지
 * 않고, 물어도 「이미 있는 것은 안 덮는다」에 걸린다. 값을 치른 그림을 잃는
 * 것을 한 시간 뒤로 미룬 셈이 된다.
 *
 * 그래서 **생성 경로와 같은 모양**(`data:...;base64,...`)으로 맞춘다. 이
 * 저장소의 다른 모든 자리가 그 모양을 가정한다 — 초안 자산 갈무리
 * (`document-store.ts`), 라이브러리 저장(`PdpEditor`), 내보내기 형식 판정
 * (`export-fidelity.ts`) 셋이 전부 data URL 이 아니면 조용히 다르게 군다.
 *
 * **못 받은 장은 안 준다.** 부르는 쪽이 그것을 세지도 넣지도 않게 한다.
 */
export async function bakeRecoveredImages(
  images: readonly RecoveredImage[],
  fetchImpl: typeof fetch,
): Promise<RecoveredImage[]> {
  const baked = await Promise.all(
    images.map(async (image) => {
      try {
        const response = await fetchImpl(image.url);
        if (!response.ok) return null;
        const blob = await response.blob();
        const base64 = bytesToBase64(new Uint8Array(await blob.arrayBuffer()));
        if (!base64) return null;
        // 서버가 형식을 안 알려 주면 png 로 둔다. 확장자 없는 것보다 낫다.
        return { sectionId: image.sectionId, url: `data:${blob.type || "image/png"};base64,${base64}` };
      } catch {
        // 한 장을 못 받았다고 나머지를 버리지 않는다.
        return null;
      }
    }),
  );
  return baked.filter((image): image is RecoveredImage => Boolean(image));
}

/**
 * 바이트를 base64 로.
 *
 * **조각으로 나눈다.** `String.fromCharCode(...bytes)` 에 수 MB 를 한 번에
 * 넘기면 인자 수 한도에 걸려 터진다 — 그림은 늘 그 크기다.
 */
function bytesToBase64(bytes: Uint8Array): string {
  if (!bytes.length) return "";
  const 조각 = 0x8000;
  let 글자 = "";
  for (let i = 0; i < bytes.length; i += 조각) {
    글자 += String.fromCharCode(...bytes.subarray(i, i + 조각));
  }
  // 브라우저에는 `btoa`, 시험(node)에는 `Buffer` 가 있다.
  return typeof btoa === "function" ? btoa(글자) : Buffer.from(글자, "binary").toString("base64");
}
