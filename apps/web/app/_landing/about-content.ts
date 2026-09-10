// MCS 브랜드 소개(`/about`) 카피 사전.
//
// `landing-content.ts` 와 같은 규칙을 따른다 — KO 를 단일 출처로 두고 EN 을
// 그 타입에 맞춘다. 키가 하나라도 빠지면 타입 검사에서 잡힌다.
//
// **여기에 결과물 사진을 싣지 않는다.** 첫 화면이 이미 「넣은 것 → 나온 것」을
// 보여 준다. 같은 것을 또 보여 주면 이 화면이 하려던 이야기가 묻힌다.

/** [앞, 굵게, 뒤]. 굵게 할 말이 없으면 가운데를 빈 문자열로 둔다. */
export type Para = readonly [string, string, string];

/** 「지워진 일」 한 줄. */
export interface Lifted {
  gone: string;
  instead: Para;
}

export interface Step {
  n: string;
  title: string;
  desc: string;
  /** 이 걸음을 누가 하는가. 사람이 하는 자리는 하나뿐이다. */
  by: string;
  human?: true;
}

export interface Moment {
  when: string;
  now: string;
  why: string;
}

export interface Vow {
  title: string;
  desc: string;
}

export const ABOUT_KO = {
  metaTitle: "MCS란",
  metaDescription:
    "따라 만들 그림 한 장과 한 줄. 손으로 하는 건 거기까지입니다. 구조를 잡고 글자를 정하고 그림을 만들고 검수하고 매체 규격에 맞추는 일은 MCS 가 이어서 합니다.",

  kicker: "브랜드 소개",
  h1a: "그림 한 장과 한 줄,",
  h1b: "거기서부터는 저희가 합니다",
  lead: "따라 만들고 싶은 그림을 고르고, 무엇을 만들지 한 줄로 적습니다. 주소 하나를 넣어도 됩니다. 손으로 하는 건 여기까지입니다.",
  inputOne: "따라 만들 그림 한 장",
  inputTwo: "한 줄, 또는 주소 하나",
  inputRest: "나머지는 기다리시면 됩니다",

  eveningKicker: "우리가 본 것",
  eveningTitle: "가게 문을 닫고, 노트북을 엽니다",
  /** 각 문단의 [앞, 강조, 뒤]. 강조가 없으면 가운데를 비운다. */
  eveningBody: [
    ["사진은 낮에 찍어 뒀습니다. 문제는 그다음입니다. ", "무슨 말부터 해야 하는지, 어떤 순서로 보여 줘야 하는지.", " 만들기도 전에 정할 것이 너무 많습니다."],
    ["겨우 만들었는데 글자 하나가 틀렸습니다. 고치려면 처음부터 다시입니다. 그래서 ", "다음부터는 시도하는 것도 조심스러워집니다.", ""],
    ["한 장으로 끝나지도 않습니다. 네이버에 걸 것, 카카오에 걸 것, 인스타에 올릴 것. 다 만들고 나면 이미 새벽입니다.", "", ""],
  ] as readonly Para[],
  eveningPullA: "잘 만들고 싶은 마음은 다 같았습니다.",
  eveningPullB: "시간과 사람이 없었을 뿐입니다.",

  offKicker: "덜어 낸 것",
  offTitle: "이 일들을 대신 맡았습니다",
  offLead:
    "기능을 늘리는 것보다, 안 해도 되는 일을 지우는 쪽으로 만들었습니다. 지운 자리에 무엇이 오는지도 함께 적습니다.",
  lifted: [
    { gone: "무슨 말부터 할지 정하기", instead: ["첫 화면에 ", "구성안이 먼저 놓입니다.", " 고치는 것부터 시작하면 됩니다."] },
    { gone: "글자 때문에 다시 만들기", instead: ["글자를 ", "그림보다 먼저", " 확정합니다. 확정 전에는 그림을 만들지 않습니다."] },
    { gone: "잘 나왔는지 혼자 판단하기", instead: ["만든 쪽이 아니라 ", "다른 눈", "이 봅니다. 통과하지 못하면 다시 씁니다."] },
    { gone: "규격마다 자르고 맞추기", instead: ["한 장에서 ", "네이버 · 카카오 · 구글 규격", "을 꺼냅니다. 다시 만들지 않으니 값도 안 듭니다."] },
    { gone: "만든 것 찾아 헤매기", instead: ["결과물이 ", "보관함으로 돌아옵니다.", " 다음 작업의 재료가 됩니다."] },
  ] as readonly Lifted[],

  walkKicker: "다섯 걸음",
  walkTitle: "사람이 손대는 자리는 한 곳입니다",
  walkLead:
    "그림은 세 번째입니다. 앞의 둘을 먼저 지나기 때문에, 나온 그림이 처음 생각에서 크게 벗어나지 않습니다.",
  steps: [
    { n: "01", title: "구조", desc: "무슨 말을 어떤 순서로", by: "시스템" },
    { n: "02", title: "원고", desc: "읽어 보고 고치고 확정", by: "사람", human: true },
    { n: "03", title: "생성", desc: "확정된 글자 그대로", by: "시스템" },
    { n: "04", title: "검수", desc: "다른 눈으로 대조", by: "시스템" },
    { n: "05", title: "규격", desc: "매체에 맞게 꺼내기", by: "시스템" },
  ] as readonly Step[],
  walkNoteStrong: "확정 버튼만 사람 앞에 놓입니다.",
  walkNoteRest: " 대신 만들어 드리지만, 대신 정하지는 않습니다.",

  feelKicker: "쓸 때의 마음",
  feelTitle: "감탄이 아니라, 마음이 놓이길 바랐습니다",
  feelLead:
    "이 화면을 여는 사람은 대개 마감에 쫓기고 있습니다. 그래서 신기함보다 안심을 만들려고 했습니다.",
  moments: [
    { when: "시작할 때", now: "「준비할 게 둘뿐이네」", why: "그림 하나와 한 줄. 빈 화면 앞에서 고민하는 시간이 없어집니다." },
    { when: "만드는 중", now: "「내가 고친 문장 그대로 나왔다」", why: "확정은 사람이 누릅니다. 예상 밖으로 가지 않는다는 감각이 남습니다." },
    { when: "끝난 뒤", now: "「이 한 장이면 다 되네」", why: "매체마다 다시 만들지 않습니다. 오늘 일이 오늘 끝납니다." },
  ] as readonly Moment[],

  keepKicker: "지키려는 것",
  keepTitle: "할 수 있는 것만 말하겠습니다",
  vows: [
    { title: "잘 나온 것만 계산합니다", desc: "구성을 잡아 보는 건 무료입니다. 실패한 그림은 값을 매기지 않습니다." },
    { title: "마지막 결정은 사람이 합니다", desc: "대신 만들어 드리지만 대신 정하지는 않습니다. 확정 버튼은 늘 사람 앞에 놓입니다." },
    { title: "만든 것은 안전하게 둡니다", desc: "작업물은 본인만 열 수 있는 곳에 보관합니다. AI 서비스에 따로 가입하거나 열쇠를 준비할 일은 없습니다." },
    { title: "모르는 건 모른다고 적습니다", desc: "아직 정하지 못한 것은 그럴듯하게 채우지 않고 비워 둡니다. 안 되는 것도 그 자리에 적습니다." },
  ] as readonly Vow[],

  endA: "잘 만들고 싶은 마음이,",
  endB: "시간에 막히지 않도록.",
  endLead: "그 하나를 위해 만들었습니다. 가입 신청 후 이메일 인증과 승인을 거치면 바로 쓰실 수 있습니다.",
  /**
   * **문은 하나만 낸다.** 「결과물 먼저 보기」를 나란히 뒀다가 지웠다 —
   * 여기까지 읽은 사람은 이미 볼 만큼 봤고, 갈림길을 주면 둘 다 안 누른다.
   */
  endPrimary: "가입 신청",
};

export type AboutCopy = typeof ABOUT_KO;

export const ABOUT_EN: AboutCopy = {
  metaTitle: "What is MCS",
  metaDescription:
    "One image to follow and one line. That is where your part ends. MCS takes it from there — structure, copy, image, review, and every channel size.",

  kicker: "About",
  h1a: "One image, one line.",
  h1b: "We take it from there",
  lead: "Pick an image whose feel you want, then write one line about what to make. A URL works too. That is where your part ends.",
  inputOne: "One image to follow",
  inputTwo: "One line, or one URL",
  inputRest: "the rest is ours",

  eveningKicker: "What we saw",
  eveningTitle: "The shop closes, and the laptop opens",
  eveningBody: [
    ["The photos were taken during the day. The trouble starts after. ", "What to say first, in what order.", " There is too much to decide before you can even begin."],
    ["You finally make one, and a single character is wrong. Fixing it means starting over. So ", "the next time, you hesitate to even try.", ""],
    ["And one image is never enough. One for Naver, one for Kakao, one for Instagram. By the time they are all done it is already morning.", "", ""],
  ],
  eveningPullA: "Everyone wanted to make it well.",
  eveningPullB: "There was simply no time, and no one to help.",

  offKicker: "What we took off",
  offTitle: "We took these off your hands",
  offLead:
    "Rather than adding features, we removed work that did not need doing. Here is what replaces each one.",
  lifted: [
    { gone: "Deciding what to say first", instead: ["A ", "draft structure is waiting", " on the first screen. You start by editing it."] },
    { gone: "Remaking it over one wrong character", instead: ["Copy is locked ", "before the image", ", not after. Nothing is generated until you confirm."] },
    { gone: "Judging your own work alone", instead: ["A ", "second pass", " reviews it, not the one that made it. If it fails, it is rewritten."] },
    { gone: "Cropping for every channel", instead: ["One image yields ", "Naver, Kakao and Google sizes", ". Nothing is regenerated, so nothing is charged."] },
    { gone: "Hunting for what you made", instead: ["Output ", "returns to your library.", " It becomes material for the next job."] },
  ],

  walkKicker: "Five steps",
  walkTitle: "You touch exactly one of them",
  walkLead:
    "The image comes third. Because two steps come before it, what comes out stays close to what you had in mind.",
  steps: [
    { n: "01", title: "Structure", desc: "What to say, in what order", by: "System" },
    { n: "02", title: "Copy", desc: "Read, edit, confirm", by: "You", human: true },
    { n: "03", title: "Image", desc: "Exactly the confirmed words", by: "System" },
    { n: "04", title: "Review", desc: "Checked by a second pass", by: "System" },
    { n: "05", title: "Sizes", desc: "Pulled for each channel", by: "System" },
  ],
  walkNoteStrong: "Only the confirm button sits in front of a person.",
  walkNoteRest: " We make it for you. We do not decide for you.",

  feelKicker: "How it should feel",
  feelTitle: "We wanted relief, not applause",
  feelLead:
    "Most people who open this screen are up against a deadline. So we aimed for reassurance rather than novelty.",
  moments: [
    { when: "Starting", now: "“Only two things to prepare”", why: "One image and one line. No more staring at a blank screen." },
    { when: "Midway", now: "“It came out exactly as I wrote it”", why: "You press confirm. Nothing drifts away from what you decided." },
    { when: "Finishing", now: "“This one image covers everything”", why: "No remaking per channel. Today's work ends today." },
  ],

  keepKicker: "What we hold to",
  keepTitle: "We will only claim what we can do",
  vows: [
    { title: "Only successful images are billed", desc: "Drafting the structure is free. Failed images are never charged." },
    { title: "The last decision is yours", desc: "We make it for you, but we do not decide for you. The confirm button is always in front of a person." },
    { title: "Your work stays private", desc: "Output is kept where only you can open it. You never sign up for an AI service or bring your own key." },
    { title: "We write down what we do not know", desc: "What is undecided is left blank rather than plausibly filled in. What does not work is written down where it happens." },
  ],

  endA: "So that wanting to make it well",
  endB: "is not stopped by the clock.",
  endLead: "That is what this was built for. Request access, confirm your email, and you are in.",
  endPrimary: "Request access",
};

export const ABOUT: Record<"ko" | "en", AboutCopy> = { ko: ABOUT_KO, en: ABOUT_EN };
