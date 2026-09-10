// MCS 랜딩페이지 카피 사전 — 디자인 프로토타입에서 그대로 추출
// 위치: apps/web/app/_landing/landing-content.ts
//
// - presets[].src 는 public/landing/ 기준 경로입니다 (next/image 로 그대로 사용 가능)
// - 문구는 저장소의 README.md · docs/service-introduction.md · docs/overview/README.md
//   에 기재된 실제 구현 내용에 근거합니다. 사실이 바뀌면 이 파일만 고치면 됩니다.

export type Locale = "ko" | "en";

export interface Preset {
  kind: string;
  title: string;
  prompt: string;
  role: string;
  refNote: string;
  model: string;
  ratio: string;
  src: string;
  chips: string[];
}

export const KO = {
  navGallery: "결과물", navTools: "도구", navHow: "작동 원리", navTry: "직접 해보기", navDiff: "차별점",
  ctaShort: "무료 체험 신청",
  navLogin: "로그인", navSignup: "가입 신청", navStudio: "스튜디오 열기", navLogout: "로그아웃", localBadge: "로컬 확인 모드",
  eyebrow: "승인 회원 전용 AI 제작 도구",
  h1a: "모아 두고, 만들고,", h1b: "다시 재료로 쓴다",
  heroLead: "카드뉴스 · 광고 소재 · 포스터 · 상세페이지 · 캐릭터를 한 곳에서 만듭니다. 등록한 모든 것이 라이브러리에 쌓이고, 어느 도구에서든 그것을 불러 쓰고, 만든 결과물이 다시 다음 작업의 재료가 됩니다.",
  ctaPrimary: "무료 체험 신청", ctaSecondary: "결과물 먼저 보기",
  consoleTitle: "생성 콘솔", consoleModel: "GPT Image 2 · 가중치 4",
  promptLabel: "프롬프트", rendering: "이미지 생성 중",
  qaPass: "원고 대조 검수 통과",
  galleryKicker: "실제 결과물", galleryTitle: "이 시스템이 만든 것들",
  galleryLead: "아래는 후보정 없이 그대로 내려받은 원본입니다. 한국어 카피가 이미지 안에 직접 렌더된 완성형이라, 따로 디자인 툴을 열 필요가 없습니다.",
  galleryNote: "리터칭 없음 · 원본 그대로",
  g1kind: "카드뉴스 · /sns", g1title: "2026 월세 계약 시 주의해야 할 점", g1meta: "수집한 글 → 기획 → 원고 확정 → 1번 카드 · 1:1",
  g2kind: "포스터 · /poster", g2title: "고촌초등학교 가을 운동회", g2meta: "레퍼런스 따라 만들기 → 내용만 교체 · 변형 1 · 2:3",
  g3kind: "이미지 만들기 · /poster", g3title: "2026 윈터 트렌드 리포트", g3meta: "한 줄 입력 → 나머지 칸 AI 초안 → 변형 3 · 9:16",
  g4kind: "모션", g4title: "생성 이미지 기반 모션 소재", g4meta: "만든 이미지를 그대로 다음 작업의 재료로",
  baKicker: "품질 장치 ①", baTitle: "사람이 고친 글자가, 그대로 그림에 들어갑니다",
  baLead: "레퍼런스는 결을 정하고, 원고는 글자를 정합니다. 아래 레퍼런스에서 대각 분할과 초록 강조를 가져오고, 사람이 확정한 아래 원고의 글자가 프롬프트에 그대로 주입됐습니다. 그림을 만든 뒤에 글자를 고치는 것은 다시 만드는 일이고, 그건 돈이 드는 일입니다.",
  baPoints: ["원고 확정 전에는 이미지 호출을 하지 않습니다", "만든 그림은 다른 호출로 검수합니다. 원고에 없는 글자가 들어갔는지, 글자가 바뀌었는지", "검수 결과는 한 줄로 먼저, 자세한 것은 접어서 보여줍니다"],
  baHint: "가운데 손잡이를 좌우로 끌어 레퍼런스와 결과를 비교해 보세요",
  baManuscript: "사람이 확정한 원고",
  baLeftLabel: "첨부한 레퍼런스", baRightLabel: "생성 결과",
  toolsKicker: "도구", toolsTitle: "한 곳에서, 여섯 가지 방식으로",
  toolsLead: "도구마다 진입 방식이 다릅니다. 사진 한 장, 글 한 줄, 기존 페이지, 따라 만들 레퍼런스. 있는 것에서 시작합니다.",
  howKicker: "작동 원리", howTitle: "한 바퀴가 닫혀 있습니다",
  howLead: "이 시스템의 뼈대는 도구의 개수가 아니라 순환입니다. 참고 이미지는 사용자가 첨부한 것, 작업물은 이 시스템이 만든 것. 둘이 같은 라이브러리에서 같은 자격으로 쓰입니다.",
  loopBack: "만든 것이 다시 재료가 됩니다. 작업물이 라이브러리로 돌아와 다음 작업의 레퍼런스가 됩니다",
  tryKicker: "직접 해보기", tryTitle: "생성 과정을 그대로 따라가 보세요",
  tryLead: "레퍼런스 한 장과 한 줄, 또는 URL 하나만 넣으면 나머지는 시스템이 채웁니다. 아래는 실제 파이프라인의 순서를 그대로 재현한 데모이고, 왼쪽 썸네일은 그 결과물을 만들 때 실제로 첨부한 레퍼런스입니다.",
  refLabel: "첨부한 레퍼런스", resultLabel: "결과", qaLine: "원고 대조 검수 통과. 원고에 없는 글자 없음, 변경된 글자 없음",
  demoDisclaimer: "고정 샘플 데모 · AI를 호출하지 않고 이미지 크레딧도 차감하지 않습니다. 실제 서비스에서는 분석은 무료이고 성공한 이미지 장수만 월 한도에서 차감됩니다.",
  runIdle: "만들기", runRunning: "생성 중…", runDone: "다시 만들기",
  diffKicker: "차별점", diffTitle: "이미지를 뽑는 도구가 아니라, 콘텐츠를 끝내는 도구",
  diffLead: "생성 자체는 어디서나 됩니다. 문제는 글자가 맞는지, 다시 만들 때 돈이 얼마나 드는지, 그리고 만든 것을 다음에 다시 쓸 수 있는지입니다.",
  diffColItem: "항목", diffColA: "일반 AI 이미지 도구", diffColB: "템플릿 디자인 도구",
  diffFootnote: "비교 항목은 이 시스템이 실제로 구현한 장치를 기준으로 정리한 것입니다. 이미지 생성은 fal.ai 를 경유하며 모델별 원가 차이(최대 4.6배)를 크레딧 가중치로 반영합니다.",
  ctaTitle: "결과물을 먼저 보고, 그다음에 시작하세요",
  ctaLead: "회원이 따로 AI 서비스에 가입하거나 API 키를 준비할 필요는 없습니다. 가입 신청 후 이메일 인증과 관리자 승인을 거치면 바로 씁니다.",
  footerNote: "Marketing Content Studio · 승인 회원 전용",
  footerRight: "소재 수집부터 완성 이미지까지",
  heroStats: [{ v: "도구 6", k: "카드뉴스 · 이미지 · 상세페이지 · 리디자인 · 캐릭터 · 수집" }, { v: "모델 3종", k: "글자 정확도와 단가를 저울질해 고릅니다" }, { v: "성공만 차감", k: "실패한 이미지는 크레딧으로 정산하지 않습니다" }],
  steps: [
    { label: "소재 불러오기", note: "수집함" },
    { label: "기획", note: "카드 구성" },
    { label: "원고, 사람이 확정", note: "글자 고정" },
    { label: "이미지 생성", note: "fal.ai" },
    { label: "원고 대조 검수", note: "다른 호출" }
  ],
  typed: "2026 월세 계약 시 주의해야 할 점, 3단계 체크리스트 카드뉴스",
  manuscript: [
    { field: "리드", value: "보증금 지키는 첫걸음" },
    { field: "헤드라인", value: "안전한 월세 계약 체크리스트" },
    { field: "본문", value: "계약 전 확인 → 계약서 작성 → 입주 후 절차, 3단계로 완성하는 월세 계약" },
    { field: "출처", value: "2026년 9월 2일 기준 현행 법령·국토교통부·HUG 자료 정리" }
  ],
  tools: [
    { route: "/sns", name: "카드뉴스", desc: "수집한 글이나 직접 쓴 글을 여러 장의 카드로. 원고를 사람이 확인한 뒤 그림을 만들고, 만든 그림은 글자가 원고대로 들어갔는지 검수합니다.", tag: "기획 → 원고 → 그림 → 검수" },
    { route: "/poster", name: "이미지 만들기", desc: "광고 소재 · 포스터 · 일반 이미지 한 장. 따라 만들 이미지를 고르고 한 줄만 적으면 나머지 칸은 AI 가 초안으로 채웁니다.", tag: "레퍼런스 한 장 + 한 줄" },
    { route: "/create", name: "상세페이지 만들기", desc: "상품 사진 한 장 또는 글만으로 상세페이지를 새로. 구성안을 먼저 잡고 문구를 고친 뒤 섹션 이미지를 묶음으로 만듭니다.", tag: "4~7 섹션 · 비율 5종" },
    { route: "/redesign", name: "리디자인", desc: "기존 상세페이지(이미지 · PDF)를 전사해 성분 · 인증 · 시험 수치까지 근거로 삼고, 전환율 중심으로 다시 설계합니다.", tag: "전사 → 사실추출 → 재설계" },
    { route: "/characters", name: "캐릭터", desc: "인물을 정면 · 좌 · 우 · 후면으로 고정해 두고 재사용합니다. 여러 장에 같은 사람이 일관되게 나옵니다.", tag: "4면 고정 · 재사용" },
    { route: "/inbox · /sources", name: "수집함 · 수집 리스트", desc: "유튜브 · RSS · 네이버 뉴스 · 커뮤니티에서 소재를 자동으로 모읍니다. 워커가 5분마다 돌 차례가 된 소스를 긁습니다.", tag: "자동 수집 · 5분 주기" }
  ],
  loop: [
    { n: "01", name: "수집", desc: "유튜브 · RSS · 뉴스 · 커뮤니티를 등록해 두면 소재가 알아서 쌓입니다." },
    { n: "02", name: "라이브러리", desc: "만든 작업물, 각도를 고정해 둔 캐릭터, 올린 참고 이미지와 묶음 세트가 한자리에. 로그인하면 여기가 먼저 열립니다." },
    { n: "03", name: "만들기", desc: "어느 도구에서든 라이브러리를 불러 씁니다. 레퍼런스는 역할을 말로 정해서 넘깁니다." },
    { n: "04", name: "작업물", desc: "만든 결과가 소유자별 비공개 버킷에 저장되고 라이브러리에 등록됩니다." }
  ],
  guards: [
    { kicker: "품질 장치 ②", title: "심사는 만든 호출과 다른 호출이 합니다", desc: "같은 호출 안에서 매기는 점수는 방금 쓴 글을 스스로 칭찬하는 것에 가깝습니다. 심사자에게는 구성안과 판매 원칙만 주고 브리프 원문은 주지 않습니다. 사는 사람은 브리프를 못 보기 때문입니다." },
    { kicker: "심사 항목", title: "대상 · 문제 · 차별점 · 반론 · 흐름 · 행동 유도", desc: "여섯 항목 중 fail 이 하나라도 있으면 지적사항을 담아 다시 만듭니다(최대 2회). 끝까지 남은 지적은 숨기지 않고 화면에 띄웁니다." },
    { kicker: "레퍼런스", title: "참고 이미지를 어떻게 쓸지 말로 못박습니다", desc: "따라 만들기 / 제품 그대로 지키기 / 인물 그대로 지키기 / 원본 그대로 넣기. 네 가지 역할로 통일했습니다. 상세페이지 스타일 레퍼런스는 통일이 깨지지 않게 페이지당 한 장만 씁니다." },
    { kicker: "모델 선택", title: "글자 정확도와 단가를 저울질합니다", desc: "GPT Image 2(가중치 4, 글자가 가장 정확 · 명조 계열도 표현), Nano Banana Pro(3, 빠름 · 고딕 계열), Nano Banana(1, 글자가 적은 장면에). 원가가 4.6배까지 벌어져 크레딧에 가중치를 둡니다." },
    { kicker: "동시성", title: "만드는 도중에 화면을 옮겨도 됩니다", desc: "생성 목록을 셸(사이드바)이 들고 있어 화면을 옮겨도 받아 오는 일이 멈추지 않습니다. 무엇이 돌고 있고 얼마나 됐는지 보이고 중지할 수 있습니다. 다만 중지는 되돌리기가 아니라는 것도 그 자리에 적어 뒀습니다." },
    { kicker: "보관", title: "파일은 비공개 버킷에만 둡니다", desc: "짧은 수명의 서명 URL 로만 열립니다. 경로 첫 칸이 소유자이고, 버킷 정책이 그 칸으로 남의 것을 막습니다. 회원은 AI 키를 브라우저에 입력하지 않습니다." }
  ],
  presets: [
    { kind: "카드뉴스 · /sns", title: "월세 계약 체크리스트", prompt: "이 기사로 3단계 체크리스트 카드뉴스 만들어 줘", role: "따라 만들기", refNote: "레퍼런스 1장 + 기사 URL 1개. 카드 구성 · 원고 · 색 배분은 시스템이 채웠습니다.", model: "GPT Image 2 · 가중치 4", ratio: "1 / 1", src: "/landing/result-cardnews-lease.png", chips: ["소재: URL 1개", "프롬프트: 한 줄", "원고 확정 후 생성"] },
    { kind: "포스터 · /poster", title: "가을 운동회 포스터", prompt: "고촌초등학교 가을 운동회 포스터", role: "따라 만들기", refNote: "레퍼런스 1장 + 한 줄. 레이아웃 문법과 색 대비를 가져오고 소재만 운동회로 바꿨습니다.", model: "GPT Image 2 · 가중치 4", ratio: "2 / 3", src: "/landing/result-poster-sports.png", chips: ["프롬프트: 한 줄", "나머지 칸은 AI 초안", "변형 3장"] },
    { kind: "이미지 · /poster", title: "윈터 트렌드 리포트", prompt: "2026 윈터 트렌드 리포트 커버", role: "따라 만들기", refNote: "레퍼런스 1장 + 한 줄. 세로 세리프 타이포와 여백 문법을 유지하고 시즌만 겨울로 옮겼습니다.", model: "Nano Banana Pro · 가중치 3", ratio: "1232 / 2192", src: "/landing/result-winter-trend.png", chips: ["프롬프트: 한 줄", "9:16", "변형 3장"] }
  ],
  logs: [
    "레퍼런스 해석. 레이아웃 · 서체 · 색을 읽어 옵니다",
    "원고 생성. 사람이 확인하고 고치는 단계",
    "프롬프트 조립. 확정된 원고를 그대로 주입",
    "이미지 생성. fal.ai 경유, 묶음으로 한 번에",
    "원고 대조 검수. 다른 호출로 글자를 대조"
  ],
  diffRows: [
    { item: "한국어 글자", a: "자주 깨지고, 없는 글자가 생깁니다", b: "정확하지만 사람이 다 입력해야 합니다", c: "원고를 먼저 확정해 그대로 주입하고, 다른 호출이 대조 검수합니다" },
    { item: "글자 수정", a: "이미지를 다시 생성, 그때마다 비용", b: "즉시 수정", c: "그림 전 단계에서 확정하므로 재생성 비용이 발생하지 않습니다" },
    { item: "품질 심사", a: "없음", b: "사람이 판단", c: "만든 호출과 다른 호출이 6항목을 심사, fail 이면 최대 2회 재작성" },
    { item: "레퍼런스 사용", a: "스타일만 흐릿하게 반영", b: "템플릿에 고정", c: "역할을 네 가지 어휘로 명시. 따라 만들기 / 제품 · 인물 지키기 / 원본 그대로" },
    { item: "인물 일관성", a: "장마다 다른 사람이 나옵니다", b: "쓰던 사진을 계속 씁니다", c: "인물·캐릭터를 정면·좌·우·후면으로 고정해 두고 불러 씁니다. 여러 장에 같은 사람이 나옵니다" },
    { item: "광고 규격", a: "규격마다 다시 만들거나 직접 자릅니다", b: "규격마다 템플릿을 다시 맞춥니다", c: "만든 그림 하나에서 네이버 · 구글 · 카카오 규격을 뽑습니다. 새로 만들지 않으므로 크레딧이 안 듭니다" },
    { item: "결과물 재사용", a: "내려받고 끝", b: "파일로 관리", c: "라이브러리로 돌아와 다음 작업의 레퍼런스가 됩니다" },
    { item: "비용", a: "실패한 결과도 과금", b: "정액", c: "분석은 무료, 성공한 이미지만 차감. 모델별 가중치 4 / 3 / 1" }
  ],
  ctaFacts: [
    { n: "01", title: "AI 키를 준비하지 않습니다", desc: "운영자 서버 키로 생성합니다. 브라우저에 키를 입력할 일이 없습니다." },
    { n: "02", title: "분석은 무료", desc: "구성 분석에는 이미지 크레딧이 차감되지 않습니다. 남용 방지용 시간당 제한만 적용됩니다." },
    { n: "03", title: "성공한 것만 차감", desc: "실패한 이미지는 크레딧으로 정산하지 않습니다." },
    { n: "04", title: "가입 절차", desc: "가입 신청 → 이메일 인증 → 관리자 승인 → 이용." }
  ]
};

/** KO 를 단일 출처로 삼는다 — EN 에 빠진 키가 있으면 타입 검사에서 잡힌다. */
export type LandingCopy = typeof KO;

export const EN: LandingCopy = {
  navGallery: "Output", navTools: "Tools", navHow: "How it works", navTry: "Try it", navDiff: "Difference",
  ctaShort: "Request access",
  navLogin: "Sign in", navSignup: "Request access", navStudio: "Open studio", navLogout: "Sign out", localBadge: "Local preview mode",
  eyebrow: "AI production tools for approved members",
  h1a: "Collect it, make it,", h1b: "then use it again",
  heroLead: "Card news, ad creative, posters, product detail pages and characters in one place. Everything you register lands in the library, every tool can pull from it, and every output goes back in as material for the next job.",
  ctaPrimary: "Request free access", ctaSecondary: "See the output first",
  consoleTitle: "Generation console", consoleModel: "GPT Image 2 · weight 4",
  promptLabel: "Prompt", rendering: "Generating image",
  qaPass: "Copy-match QA passed",
  galleryKicker: "Real output", galleryTitle: "Made by this system",
  galleryLead: "Downloaded as-is, with no retouching. Korean copy is rendered directly inside the image as a finished section, so there is no design tool to open afterwards.",
  galleryNote: "No retouching · originals",
  g1kind: "Card news · /sns", g1title: "What to check before a 2026 lease", g1meta: "Collected article → plan → approved copy → card 1 · 1:1",
  g2kind: "Poster · /poster", g2title: "Gochon Elementary autumn sports day", g2meta: "Follow the reference → swap content only · variant 1 · 2:3",
  g3kind: "Image · /poster", g3title: "2026 winter trend report", g3meta: "One line in → AI drafts the rest → variant 3 · 9:16",
  g4kind: "Motion", g4title: "Motion built from generated stills", g4meta: "Output feeding straight back in as material",
  baKicker: "Quality gate ①", baTitle: "The words a human approved are the words in the image",
  baLead: "The reference sets the feel; the copy sets the words. The diagonal split and green accent come from the reference below, and the wording a human approved was injected into the prompt verbatim. Fixing text after the image exists means generating again, and that costs money.",
  baPoints: ["No image call happens before the copy is approved", "The finished image is reviewed by a separate call. Did text appear that was not in the copy, did any text change", "The review result shows as one line first, with the detail folded away"],
  baHint: "Drag the handle to compare the reference with the result",
  baManuscript: "Copy approved by a human",
  baLeftLabel: "Attached reference", baRightLabel: "Generated result",
  toolsKicker: "Tools", toolsTitle: "One place, six ways in",
  toolsLead: "Each tool takes a different entry point. One product photo, one line of text, an existing page, a reference to follow. You start from whatever you have.",
  howKicker: "How it works", howTitle: "The loop is closed",
  howLead: "The backbone is not the number of tools, it is the circulation. A reference image is something the user attached; a work item is something the system made, and both are used from the same library on equal terms.",
  loopBack: "What you made becomes material. Work items return to the library as references for the next job",
  tryKicker: "Try it", tryTitle: "Walk the generation flow yourself",
  tryLead: "One reference and one line, or a single URL, is enough; the system fills in the rest. The demo below reproduces the real pipeline order, and the thumbnail on the left is the reference actually attached when that output was made.",
  refLabel: "Attached reference", resultLabel: "Result", qaLine: "Copy-match QA passed. No text outside the copy, no altered text",
  demoDisclaimer: "Fixed-sample demo · no AI call, no image credit spent. In the live service analysis is free and only successful images count against the monthly quota.",
  runIdle: "Generate", runRunning: "Generating…", runDone: "Generate again",
  diffKicker: "Difference", diffTitle: "Not a tool that outputs images, but one that finishes content",
  diffLead: "Generation happens anywhere. The questions are whether the text is right, what a re-run costs, and whether you can reuse what you made.",
  diffColItem: "Item", diffColA: "Generic AI image tools", diffColB: "Template design tools",
  diffFootnote: "Comparison items are drawn from gates this system actually implements. Generation routes through fal.ai, and per-model cost differences (up to 4.6×) are reflected as credit weights.",
  ctaTitle: "See the output first, then start",
  ctaLead: "Members do not sign up for a separate AI service or bring an API key. Request access, confirm your email, get admin approval, and you are in.",
  footerNote: "Marketing Content Studio · approved members only",
  footerRight: "From collecting material to finished images",
  heroStats: [{ v: "6 tools", k: "Card news · images · detail pages · redesign · characters · collection" }, { v: "3 models", k: "Chosen by weighing text accuracy against unit cost" }, { v: "Success only", k: "Failed images are never billed as credits" }],
  steps: [
    { label: "Pull material", note: "Inbox" },
    { label: "Plan", note: "Card structure" },
    { label: "Copy, human approves", note: "Text locked" },
    { label: "Image generation", note: "fal.ai" },
    { label: "Copy-match review", note: "Separate call" }
  ],
  typed: "Card news: what to check before signing a 2026 lease, a 3-step checklist",
  manuscript: [
    { field: "Lead", value: "The first step to protecting your deposit" },
    { field: "Headline", value: "Safe monthly lease checklist" },
    { field: "Body", value: "Check before signing → draft the contract → post-move-in steps: a lease in three stages" },
    { field: "Source", value: "Current statutes, MOLIT and HUG materials as of 2 Sep 2026" }
  ],
  tools: [
    { route: "/sns", name: "Card news", desc: "Turn collected or hand-written text into a multi-card set. A human approves the copy before images are made, and the result is reviewed for text fidelity.", tag: "Plan → copy → image → review" },
    { route: "/poster", name: "Image maker", desc: "One ad creative, poster or general image. Pick a reference to follow, write one line, and AI drafts the remaining fields.", tag: "One reference + one line" },
    { route: "/create", name: "Detail page maker", desc: "A whole product detail page from one photo or from text alone. The structure comes first, you edit the copy, then sections generate as a batch.", tag: "4 to 7 sections · 5 ratios" },
    { route: "/redesign", name: "Redesign", desc: "Transcribes an existing detail page (image or PDF) down to ingredients, certifications and test figures, then rebuilds it around conversion.", tag: "Transcribe → extract → rebuild" },
    { route: "/characters", name: "Characters", desc: "Lock a person from the front, left, right and back, then reuse them. The same person appears consistently across images.", tag: "4 angles · reusable" },
    { route: "/inbox · /sources", name: "Inbox · sources", desc: "Collects material automatically from YouTube, RSS, news and communities. A worker sweeps due sources every five minutes.", tag: "Automatic · 5-minute cycle" }
  ],
  loop: [
    { n: "01", name: "Collect", desc: "Register YouTube, RSS, news and community sources once and material accumulates on its own." },
    { n: "02", name: "Library", desc: "Collected text, user-uploaded references, bundle sets and finished work in one place. Signing in opens here first." },
    { n: "03", name: "Make", desc: "Any tool can pull from the library. References are handed over with their role stated in words." },
    { n: "04", name: "Work items", desc: "Results are stored in a per-owner private bucket and registered back into the library." }
  ],
  guards: [
    { kicker: "Quality gate ②", title: "Judging is done by a different call than making", desc: "A score given inside the same call is close to praising your own writing. The judge receives only the structure and the selling principles, never the original brief, because the buyer never sees the brief either." },
    { kicker: "Judging criteria", title: "Audience · problem · differentiation · objection · flow · call to action", desc: "If any of the six fails, the structure is rebuilt with the criticism attached, up to twice. Criticism that survives to the end is shown on screen rather than hidden." },
    { kicker: "References", title: "How a reference gets used is stated in words", desc: "Follow it / keep the product as-is / keep the person as-is / place the original untouched. Four roles, one vocabulary. A detail page uses a single style reference per page so consistency does not break." },
    { kicker: "Model choice", title: "Text accuracy weighed against unit cost", desc: "GPT Image 2 (weight 4, most accurate text, handles serif Korean), Nano Banana Pro (3, fast, gothic text), Nano Banana (1, for scenes with little text). Costs differ by up to 4.6×, so credits are weighted." },
    { kicker: "Concurrency", title: "You can move around while it generates", desc: "The running-job list is held by the shell, so navigating away never stops collection. You can see what is running and how far along it is, and stop it, with a note that stopping is not undoing." },
    { kicker: "Storage", title: "Files live only in a private bucket", desc: "They open only through short-lived signed URLs. The first path segment is the owner, and bucket policy blocks anyone else. Members never type an AI key into the browser." }
  ],
  presets: [
    { kind: "Card news · /sns", title: "Lease checklist", prompt: "Make a 3-step checklist card set from this article", role: "Follow it", refNote: "One reference + one article URL. Card structure, copy and colour balance were filled in by the system.", model: "GPT Image 2 · weight 4", ratio: "1 / 1", src: "/landing/result-cardnews-lease.png", chips: ["Material: one URL", "Prompt: one line", "Generated after copy approval"] },
    { kind: "Poster · /poster", title: "Autumn sports day poster", prompt: "Autumn sports day poster for Gochon Elementary", role: "Follow it", refNote: "One reference + one line. The layout grammar and colour contrast carry over; only the subject changes.", model: "GPT Image 2 · weight 4", ratio: "2 / 3", src: "/landing/result-poster-sports.png", chips: ["Prompt: one line", "AI drafts the rest", "3 variants"] },
    { kind: "Image · /poster", title: "Winter trend report", prompt: "2026 winter trend report cover", role: "Follow it", refNote: "One reference + one line. The vertical serif lockup and negative-space grammar stay; the season moves to winter.", model: "Nano Banana Pro · weight 3", ratio: "1232 / 2192", src: "/landing/result-winter-trend.png", chips: ["Prompt: one line", "9:16", "3 variants"] }
  ],
  logs: [
    "Reading the reference. Layout, type and colour",
    "Drafting copy. The stage a human checks and edits",
    "Assembling the prompt. Approved copy injected verbatim",
    "Generating the image. Via fal.ai, as one batch",
    "Copy-match review. A separate call compares the text"
  ],
  diffRows: [
    { item: "Korean text", a: "Often breaks; invents characters", b: "Accurate, but you type everything", c: "Copy is approved first and injected verbatim, then a separate call verifies it" },
    { item: "Editing text", a: "Regenerate the image, cost each time", b: "Instant", c: "Locked before the image exists, so there is no regeneration cost" },
    { item: "Quality judging", a: "None", b: "Human judgement", c: "A different call scores six criteria; a fail triggers up to two rebuilds" },
    { item: "Using references", a: "Style vaguely echoed", b: "Fixed to a template", c: "Role stated in four words. Follow it / keep product · person / place original" },
    { item: "Character consistency", a: "A different person every time", b: "You reuse the same stock photo", c: "Lock a person or character in front, left, right and back views, then reuse it — the same face across every image" },
    { item: "Ad sizes", a: "Regenerate or crop for every size", b: "Re-fit a template for every size", c: "Pull Naver, Google and Kakao sizes from one image you already made — nothing is regenerated, so no credits" },
    { item: "Reusing output", a: "Download and done", b: "Managed as files", c: "Returns to the library as the reference for the next job" },
    { item: "Cost", a: "Failures billed too", b: "Flat fee", c: "Analysis free, only successful images counted. Model weights 4 / 3 / 1" }
  ],
  ctaFacts: [
    { n: "01", title: "No AI key needed", desc: "Generation runs on the operator's server key. You never enter a key in the browser." },
    { n: "02", title: "Analysis is free", desc: "Structure analysis spends no image credits. Only an hourly limit applies, to prevent abuse." },
    { n: "03", title: "Success only", desc: "Failed images are never settled as credits." },
    { n: "04", title: "How to join", desc: "Request access → confirm email → admin approval → start." }
  ]
};

export const CONTENT: Record<Locale, LandingCopy> = { ko: KO, en: EN };

/** 데모 프리셋별 레퍼런스 썸네일 (public/landing/) — presets 순서와 동일 */
export const REFERENCE_THUMBS = [
  "/landing/ref-lease.png",   // 프리셋 1 · 월세 계약 체크리스트
  "/landing/ref-sports.png",  // 프리셋 2 · 가을 운동회 포스터
  "/landing/ref-winter.png",  // 프리셋 3 · 윈터 트렌드 리포트
] as const;

/** 히어로 타임라인 상수 (프로토타입과 동일하게 유지) */
export const HERO_TIMING = {
  tickMs: 90,      // 리렌더 주기
  typeMs: 55,      // 프롬프트 1글자당
  stepMs: 620,     // 파이프라인 단계당 (5단계)
  holdMs: 3800,    // 완성 상태 유지 후 루프 리셋
  revealAtStep: 4, // 결과 이미지가 나타나는 단계
  badgeAtStep: 5,  // 검수 통과 배지가 나타나는 단계
} as const;

/** 데모 로그 진행 간격 */
export const DEMO_STEP_MS = 760;
