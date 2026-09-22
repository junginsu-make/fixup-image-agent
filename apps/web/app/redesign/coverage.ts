/**
 * **얼마나 잘렸는지 말한다**(F-7-0).
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────
 *
 * 리디자인은 올린 자료를 여러 곳에서 자른다. 그리고 **전부 조용하다.**
 *
 *   `normalizeFilesForUpload`  올린 자료 중 앞 4개만 그림 참조로 쓴다
 *   `renderPdfToImages`        PDF 는 앞 4쪽만 그림 참조로 만든다
 *   `splitFilesToStrips`       전사는 스트립 40장까지
 *   `splitPdf`                 전사는 PDF 20쪽까지
 *
 * 20쪽짜리 PDF 를 올린 사람은 **4쪽만 보고 만든 페이지**를 받으면서 그 사실을
 * 어디서도 못 듣는다. 값은 똑같이 낸다.
 *
 * 설계 T-LIMIT: 「chunked body 초과, 긴 이미지/PDF, **페이지 절단 고지**,
 * pagination…」.
 *
 * ── 왜 한 문장인가 ──────────────────────────────────────────
 *
 * 자르는 자리가 여럿이라 각자 알리면 토스트가 서로를 덮는다. 사용자는 마지막
 * 것만 보고, 그것이 전부인 줄 안다. **한 번에 모아서 말한다.**
 */

export type CoverageCutKind =
  /** PDF 를 그림 참조로 만들 때 쓴 쪽수. */
  | "pdf-reference-pages"
  /** 그림 참조로 실제로 실은 자료 수. */
  | "reference-files"
  /** 글자를 읽을 때(전사) 본 PDF 쪽수. */
  | "transcribe-pdf-pages"
  /** 글자를 읽을 때 잘라 본 조각 수. */
  | "transcribe-strips";

export type CoverageCut = {
  what: CoverageCutKind;
  /** 실제로 쓴 수. */
  used: number;
  /**
   * 원래 있던 수.
   *
   * **모를 수 있다.** 조각내기는 상한에 닿으면 거기서 멈추므로, 원본이 몇
   * 조각짜리였는지는 세지 않았다. 그때는 비워 두고 숫자 없이 말한다 —
   * 모르는 수를 지어내면 고지가 목적인 기능이 사실이 아닌 문장을 낸다.
   */
  total?: number;
  /** 어느 자료인지. 여러 개를 올렸을 때 구분한다. */
  label?: string;
};

/**
 * 종류마다 사람이 읽을 말. `%used%`·`%total%`·`%label%` 을 채운다.
 *
 * `known` 은 전체 수를 아는 경우, `unknown` 은 모르는 경우다.
 *
 * **「올린 자료 N개」라고 하지 않는다.** 긴 이미지 한 장이 참조 넉 장으로
 * 쪼개지므로, 그 수는 사용자가 올린 개수가 아니다(2026-09-21 리뷰).
 */
const PHRASE: Record<CoverageCutKind, { known: string; unknown: string }> = {
  "pdf-reference-pages": {
    known: "%label% %total%쪽 중 %used%쪽만 그림 참조로 썼습니다",
    unknown: "%label% 의 일부만 그림 참조로 썼습니다",
  },
  "reference-files": {
    known: "만든 참조 이미지 %total%장 중 앞 %used%장만 썼습니다",
    unknown: "만든 참조 이미지 중 앞 %used%장만 썼습니다",
  },
  "transcribe-pdf-pages": {
    known: "%label% %total%쪽 중 %used%쪽만 글자를 읽었습니다",
    unknown: "%label% 의 일부만 글자를 읽었습니다",
  },
  "transcribe-strips": {
    known: "원본이 길어 %total%조각 중 앞 %used%조각만 글자를 읽었습니다",
    unknown: "원본이 길어 앞 %used%조각까지만 글자를 읽었습니다",
  },
};

/** 「그래서 어떻게 하면 되나」. 이것이 없으면 사용자는 그대로 값을 낸다. */
const ADVICE = "중요한 쪽을 따로 올리거나 자료를 나눠 올리면 전부 반영됩니다.";

/**
 * 잘린 것이 있으면 한 문장으로 알린다. 없으면 빈 글자다.
 *
 * **쓴 것이 전체보다 많으면 자른 것이 아니다.** 숫자가 뒤집혀 와도 거짓말을
 * 하지 않는다.
 */
export function coverageNotice(cuts: readonly CoverageCut[]): string {
  const 잘린것 = (cuts ?? [])
    .filter((cut) => {
      if (!PHRASE[cut.what] || !Number.isFinite(cut.used)) return false;
      // 전체 수를 알면 「덜 썼을 때」만, 모르면 「잘렸다고 표시된 것」만 말한다.
      return Number.isFinite(cut.total) ? Number(cut.total) > cut.used : cut.used >= 0;
    })
    .map((cut) => {
      const 아는가 = Number.isFinite(cut.total);
      return PHRASE[cut.what][아는가 ? "known" : "unknown"]
        .replace("%used%", String(Math.max(0, Math.floor(cut.used))))
        .replace("%total%", String(Math.floor(Number(cut.total))))
        .replace("%label%", cut.label?.trim() || "올린 자료")
        .replace(/\s+/g, " ")
        .trim();
    });

  if (잘린것.length === 0) return "";
  return `${잘린것.join(", ")}. ${ADVICE}`;
}

/**
 * **참조로 실제로 실린 것을 센다.**
 *
 * 상한은 **누적**인데 처음 판은 고지를 파일마다 쌓았다. PDF 두 개(20쪽·12쪽)를
 * 올리면 실제로는 첫 PDF 의 4쪽만 쓰는데 「20쪽 중 4쪽, 12쪽 중 4쪽」이라고
 * 말했다. 둘째는 한 쪽도 안 썼다(2026-09-21 리뷰).
 *
 * 이 계산이 브라우저 코드 안에 있으면 돌려 볼 수 없다. 여기로 꺼낸다.
 */
export function referenceCuts(input: {
  /** 만들어진 참조 이미지들. `origin` 은 어느 원본에서 나왔는가. */
  produced: ReadonlyArray<{ origin: string }>;
  /** 상한에 맞춰 실제로 실린 것들. `produced` 의 앞부분이다. */
  kept: ReadonlyArray<{ origin: string }>;
  /** PDF 원본의 이름과 원래 쪽수. */
  pdfPages: ReadonlyMap<string, number>;
}): CoverageCut[] {
  const cuts: CoverageCut[] = [];

  for (const [name, totalPages] of input.pdfPages) {
    const used = input.kept.filter((entry) => entry.origin === name).length;
    if (used < totalPages) {
      cuts.push({ what: "pdf-reference-pages", used, total: totalPages, label: name });
    }
  }
  if (input.produced.length > input.kept.length) {
    cuts.push({ what: "reference-files", used: input.kept.length, total: input.produced.length });
  }
  return cuts;
}

/**
 * **글자 읽기 조각이 얼마나 잘렸나.**
 *
 * 긴 이미지 한 장이 40조각에서 잘리는 것이 T-LIMIT 의 대표 사례인데, 처음
 * 판은 이 종류를 한 번도 만들지 않았다(2026-09-21 리뷰).
 *
 * 통째로 건너뛴 파일이 있으면 **몇 조각짜리였는지 모른다** — 열어 보지
 * 않았기 때문이다. 그때는 숫자 없이 말한다.
 */
export function stripCuts(input: {
  /** 실제로 만든 조각 수. */
  used: number;
  /** 자르려던 조각 수. 처리한 파일에 대해서만 안다. */
  wanted: number;
  /** 상한에 닿아 아예 안 연 파일 수. */
  skippedFiles: number;
}): CoverageCut[] {
  if (input.used < input.wanted) {
    return [{ what: "transcribe-strips", used: input.used, total: input.wanted }];
  }
  if (input.skippedFiles > 0) {
    return [{ what: "transcribe-strips", used: input.used }];
  }
  return [];
}
