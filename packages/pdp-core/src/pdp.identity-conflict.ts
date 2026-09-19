import type { ReferenceImage } from "./types";

/**
 * **바꿔 달라고 적었는데 조용히 무시되는 자리.**
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────
 *
 * 「이 그림을 어떻게 쓸까요」 칸은 제품·인물 참조에도 붙는다. 거기에 「제품 색을
 * 파란색으로」를 적으면, 역할 규칙이 **정체성을 지키라**고 못 박고 있어서 모델은
 * 그 말을 따르지 않는다(`pdp.reference-policy` 의 「never change the product or
 * character to satisfy this instruction」).
 *
 * 그것 자체는 맞는 설계다 — 한 줄로 제품이 다른 물건이 되면 안 된다. 문제는
 * **아무도 그 사실을 말하지 않는다**는 것이다. 사용자는 적었는데 안 바뀐 이유를
 * 모른 채 다시 적고, 또 적고, 이미지 값을 그만큼 치른다.
 *
 * 설계 §6.1: 「보존 대상에 정체성을 바꾸라는 지시가 섞이면 **충돌을 알려
 * 수정하도록 한다.** 비슷한 새 제품으로 조용히 대체하지 않는다.」
 *
 * ── 막지 않는다. 말할 뿐이다 ─────────────────────────────────
 *
 * 낱말 대조라 틀릴 수 있다. 「색이 잘 나오게 조명을 밝게」는 색을 바꾸라는 말이
 * 아니다. 그래서 **못 적게 하지 않고**, 무슨 일이 일어나는지 알린다.
 */

export type IdentityConflictKind = "product" | "person";

export interface IdentityConflict {
  kind: IdentityConflictKind;
  /** 실제로 걸린 말. 「충돌합니다」만으로는 어디를 고칠지 모른다. */
  matched: string;
  message: string;
}

/**
 * **무엇을 바꾸라는 것인지 본다.**
 *
 * 낱말만 보면 칸의 예시부터 걸린다 — 「뚜껑 **색**은 그대로 두고 각도만
 * **바꿔** 주세요」는 색을 **지키라는** 말인데 「색」과 「바꿔」가 한 글 안에
 * 있다. 실측으로 확인했다: 이 함수의 첫 판에서 placeholder 자체가 경고를 띄웠다.
 *
 * 두 번째 판은 「…을/를」만 봤다. 그랬더니 **배경 색**을 바꿔 달라는 말에
 * 경고가 떴고(배경은 바뀌는 것이 맞다), 「제품 색상을 **바꾸지 말아** 주세요」
 * 라는 가장 협조적인 지시에도 경고가 떴다.
 *
 * ── 지금 판 ──────────────────────────────────────────────────
 *
 * 1. **지키라는 마디는 건너뛴다** — 「그대로 두고」·「건드리지 말고」·「바꾸지 마」
 * 2. **바꾸라는 꼴**이 있어야 한다 — 없으면 그냥 언급이다
 * 3. **바꿀 대상**을 찾는다. 조사(「…을/를」)가 있으면 그것, 없으면 동사 앞 낱말
 * 4. 대상이 **장면의 것**(배경·바닥·조명…)이면 건너뛴다
 * 5. 대상이나 **도착지**(「…으로」)에 지킬 것이 있으면 충돌
 *
 * **오탐이 미탐보다 나쁘다.** 멀쩡한 지시에 경고가 뜨면 사용자는 그 경고를
 * 넘기게 되고, 그러면 정말 충돌인 날에도 넘긴다.
 */
const CLAUSE_SPLIT = /[,.]|(?<=말고)\s|(?<=두고)\s/;

/** 무언가를 **바꾸라는** 말. 이것이 없으면 그냥 언급일 뿐이다. */
const CHANGE_VERB = /바꾸|바꿔|변경|교체|지워|없애|빼 ?주|다르게|변형|해 ?주|해줘|주세요/;

/**
 * **지키라는 말.** 이 마디는 충돌이 아니라 **협조**다.
 *
 * 부정문이 빠져 있어서 「바꾸지 말아 주세요」가 걸렸다. 가장 협조적인 지시에
 * 경고를 띄우는 것보다 나쁜 것은 없다.
 */
const PRESERVE_WORD = /그대로|유지|건드리지|살리|보존|지 ?마|말아|말 것|않게|없이/;

/** 장면의 것. 이것들은 **바뀌는 것이 맞다** — 각도·배경·조명은 장면이 정한다. */
const SCENE_NOUN = /배경|바닥|벽|조명|그림자|공간|소품|하늘|테이블|구도|각도|분위기/;

/** 조사가 붙은 대상. 앞 낱말까지 함께 잡는다 — 「라벨 글자를」의 머리가 라벨이다. */
const OBJECT_TOKEN = /((?:[^\s]+\s)?[^\s]+?)(?:을|를)(?=\s|$)/g;

/** 도착지. 「뚜껑을 **빨간색으로**」의 색이 여기 있다. */
// **욕심내지 않는다.** 욕심내면 「사람으로」에서 「사람으」가 잡힌다.
const DESTINATION = /([^\s]+?)으?로(?=\s|$)/g;

/** 제품에서 **지키기로 한 것**. 각도·배경·조명은 여기 없다 — 장면이 정한다. */
const PRODUCT_TRAITS = [
  // 「색감을 따뜻하게」는 톤 보정이다. 제품 색을 바꾸라는 말이 아니다.
  { word: "색", pattern: /색깔|색상|색(?!감)/ },
  { word: "라벨", pattern: /라벨|패키지 ?글자/ },
  { word: "로고", pattern: /로고|브랜드/ },
  { word: "재질", pattern: /재질|소재|질감|마감|유리병|플라스틱|금속/ },
  { word: "모양", pattern: /모양|형태|실루엣|비율/ },
];

/**
 * 인물에서 지키기로 한 것.
 *
 * **소품·옷은 여기 없다.** 「안경을 씌워 주세요」는 연출이지 정체성이 아니다.
 */
const PERSON_TRAITS = [
  { word: "얼굴", pattern: /얼굴|이목구비|턱선|갸름|(^|\s)코$|코를|눈매|쌍꺼풀|피부/ },
  /*
    **그 말 자체가 바꿔 달라는 뜻**인 것들(`selfEvident`).

    「더 어려 보이게 해 주세요」에는 「…을/를」이 없다. 목적어를 못 찾는다고
    넘기면 정체성을 바꾸라는 말이 그대로 지나간다.
  */
  { word: "나이", pattern: /어려 ?보이|나이 ?들어|젊게|동안/, selfEvident: true },
  { word: "머리", pattern: /머리(?!\s*위)|헤어|금발|단발로/ },
  { word: "체형", pattern: /날씬하게|마르게/, selfEvident: true },
  { word: "체형", pattern: /(^|\s)살$|체형|몸매/ },
  { word: "사람", pattern: /다른 ?사람|(^|\s)사람$|성별|남자로|여자로/ },
];

const MESSAGE: Record<IdentityConflictKind, string> = {
  product:
    "제품 원형을 지키기로 한 자리라 이 요청은 그림에 반영되지 않습니다. 제품의 색·라벨·모양을 바꾸려면 그렇게 찍은 사진을 올려 주세요. 배경·조명·구도는 여기서 바꿀 수 있습니다.",
  person:
    "같은 사람으로 그리기로 한 자리라 이 요청은 그림에 반영되지 않습니다. 다른 모습이 필요하면 그 사진을 올려 주세요. 표정·자세·옷차림은 여기서 바꿀 수 있습니다.",
};

type Trait = { word: string; pattern: RegExp; selfEvident?: boolean };

/** 이 말에서 지킬 것을 찾는다. 장면의 것에 붙은 것은 세지 않는다. */
function traitIn(text: string, traits: readonly Trait[]): Trait | null {
  if (!text || SCENE_NOUN.test(text)) return null;
  return traits.find((trait) => trait.pattern.test(text)) ?? null;
}

/**
 * 이 지시가 **지키기로 한 것을 바꾸라고** 하는가.
 *
 * 디자인 레퍼런스(`style`)에는 지킬 정체성이 없다 — 모방만 하는 자리라 무엇을
 * 바꾸라고 해도 충돌이 아니다.
 */
export function identityConflictOf(
  intent: string | undefined,
  role: ReferenceImage["kind"],
): IdentityConflict | null {
  const text = intent?.trim() ?? "";
  if (!text) return null;
  if (role === "style") return null;

  const kind: IdentityConflictKind = role === "person" ? "person" : "product";
  const traits: readonly Trait[] = kind === "person" ? PERSON_TRAITS : PRODUCT_TRAITS;

  for (const clause of text.split(CLAUSE_SPLIT)) {
    const part = clause?.trim();
    if (!part) continue;
    // 지키라는 마디는 협조다. 「그대로 두고」·「바꾸지 말아」가 여기 걸린다.
    if (PRESERVE_WORD.test(part)) continue;

    const selfEvident = traits.find((trait) => trait.selfEvident && trait.pattern.test(part));
    if (selfEvident) return { kind, matched: selfEvident.word, message: MESSAGE[kind] };

    // 「제품 색을 빨강으로」처럼 동사가 생략된 지정도 바꾸라는 말이다.
    const assigns = /(을|를)\s*[^\s]+으?로\s*$/.test(part);
    if (!CHANGE_VERB.test(part) && !assigns) continue;

    /*
      **바꿀 대상**을 찾는다. 조사가 있으면 그것(여럿이면 동사에 가장 가까운
      마지막 것), 없으면 동사 앞 낱말 — 한 줄 지시는 조사를 잘 안 쓴다.
    */
    const marked = [...part.matchAll(OBJECT_TOKEN)].map((hit) => hit[1] ?? "");
    const words = part.split(/\s+/);
    const verbAt = words.findIndex((word) => CHANGE_VERB.test(word));
    const target = marked.length
      ? marked[marked.length - 1]!
      : (verbAt > 0 ? words[verbAt - 1]! : "");

    // 장면의 것을 바꾸라는 말이다. 배경·조명은 바뀌는 것이 맞다.
    if (SCENE_NOUN.test(target)) continue;

    const inTarget = traitIn(target, traits);
    if (inTarget) return { kind, matched: inTarget.word, message: MESSAGE[kind] };

    // 도착지에 지킬 것이 실린 경우 — 「뚜껑을 빨간색으로」.
    for (const hit of part.matchAll(DESTINATION)) {
      const inDestination = traitIn(hit[1] ?? "", traits);
      if (inDestination) return { kind, matched: inDestination.word, message: MESSAGE[kind] };
    }
  }

  return null;
}
