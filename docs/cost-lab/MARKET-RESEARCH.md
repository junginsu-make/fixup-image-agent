# 시장 요금·사용량 조사 기록

확인일: 2026-09-11
범위: 이미지 플랫폼 5곳, LLM/멀티모델 서비스 5곳, 개인용 웹 요금 중심.

## 결과 보는 곳

`dist/index.html`의 시장 요금·사용량 비교 탭에서 무료/유료 조건과 36개 플랜을 확인합니다. 구조화 데이터는 `research-market.json`에 있습니다.

## 조사 기준

- 검색 미리보기보다 직접 열린 공식 문서의 최신 본문을 우선했습니다.
- 이미지 장수가 명시되지 않은 토큰/크레딧/시간/사용량을 장수로 추정하지 않았습니다.
- 미국 USD 정상 월 요금을 우선하며 연간 선결제 할인과 기간 프로모션은 구별합니다.
- 원화는 참고 환산일 뿐 한국 결제 가격이 아닙니다.
- Discord 회원, 등록 사용자, 생성 에셋은 서로 다른 지표이며 과거 실적은 발표 시점을 표시했습니다.
- 로그인·결제·실제 이미지 한도 소진 실험은 하지 않았습니다.
- 이 자료는 정적 조사 결과이며 자동 갱신되지 않습니다.

## 데이터 변경을 판단한 주요 근거

- ChatGPT Images: 2026-09-08 발표를 이전 이미지 도움말보다 우선.
- ChatGPT Pro: 2026-09-10 $200 신규/업그레이드 중단 공지 반영.
- Gemini: 최신 영어 한도 문서의 공통 사용량 안내를 오래된 언어별 일일 이미지 표보다 우선.
- Grok: 2026-06 주간 공통 사용량 변경을 과거 일일 한도보다 우선.
- Recraft: 무료 제공량은 공식 앱 문서의 30/일 사용. 유료 가격은 공식 문서 기준이며 결제 화면 대조 필요로 표시.
- Ideogram: 2026-08-21 문서가 실시간 요금표 우선임을 명시해 과거 고정 무료 숫자를 사용하지 않음.

## 공식 출처

- mj-price: [Midjourney 공식 플랜 비교](https://docs.midjourney.com/hc/en-us/articles/27870484040333-Comparing-Midjourney-Plans)

- mj-free: [Midjourney 무료 체험 정책](https://docs.midjourney.com/hc/en-us/articles/27870399340173-Free-Trials)

- mj-speed: [Midjourney GPU 시간과 속도](https://docs.midjourney.com/hc/en-us/articles/32016412137741-GPU-Speed-Fast-Relax-Turbo)

- mj-size: [Midjourney 공식 Discord 커뮤니티](https://discord.com/servers/662267976984297473)

- adobe-price: [Adobe Firefly 공식 요금표](https://www.adobe.com/products/firefly/plans.html)

- adobe-promo: [Firefly 무제한 특별 혜택 조건](https://helpx.adobe.com/firefly/web/get-started/learn-the-basics/current-firefly-promotions.html)

- adobe-size: [Adobe 공식 발표 · 2025-06-17](https://news.adobe.com/news/2025/06/adobe-firefly-revolutionizes-creative-ideation-new-mobile-app)

- leo-price: [Leonardo 공식 요금·토큰·모델 표](https://www.leonardo.ai/pricing)

- leo-size: [Canva의 Leonardo 인수 공식 발표 · 2024](https://www.canva.com/newsroom/news/leonardo-ai/)

- ideo-price: [Ideogram 공식 실시간 요금표](https://ideogram.ai/pricing/)

- ideo-doc: [Ideogram 플랜 문서 · 2026-08-21 확인 표시](https://docs.ideogram.ai/plans-and-pricing/available-plans)

- ideo-size: [Ideogram 베타 이용 실적 · 2023-09](https://ideogram.ai/publicly-available)

- recraft-price: [Recraft 공식 유료 플랜 문서](https://www.recraft.ai/docs/plans-and-billing/paid-plans)

- recraft-live: [Recraft 공식 요금 페이지](https://www.recraft.ai/pricing)

- recraft-free: [Recraft 공식 앱·모델·무료 크레딧 안내](https://www.recraft.ai/docs/mobile-apps)

- recraft-size: [Recraft 공식 성장 발표 · 2025](https://www.recraft.ai/blog/recrafts-next-chapter-creativity-without-compromise)

- gpt-price: [ChatGPT 공식 요금·이미지 제공 범위](https://chatgpt.com/pricing/)

- gpt-plus: [ChatGPT Plus 공식 가격 안내](https://help.openai.com/en/articles/6950777-what-is-chatgpt-plus)

- gpt-pro: [ChatGPT Pro 티어·$200 신규 가입 중단 안내](https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro)

- gpt-image: [ChatGPT Images 2.5 공식 발표 · 2026-09-08](https://openai.com/index/introducing-chatgpt-images-2-5/)

- gemini-price: [Google AI 미국 공식 요금표](https://gemini.google/us/subscriptions/?hl=en)

- gemini-limits: [Gemini 최신 사용량 한도 · 2026-05-17 변경 안내](https://support.google.com/gemini/answer/16275805?hl=en)

- gemini-image: [Gemini 이미지 모델·무료 1K·유료 2K 안내](https://support.google.com/gemini/answer/14286560?hl=en)

- claude-price: [Claude 공식 플랜 선택 안내 · 2026-05-19](https://support.claude.com/en/articles/11049762-choose-a-claude-plan)

- claude-image: [Claude 사진·일러스트 생성 여부 · 2026-03-16](https://support.claude.com/en/articles/9002504-can-claude-produce-images)

- grok-price: [Grok 공식 가격표](https://x.ai/pricing)

- grok-limits: [Grok 공식 FAQ · 2026-06 주간 통합 사용량 변경](https://docs.x.ai/grok/faq)

- genspark-price: [Genspark 공식 가격 설명 · 2026-07-06](https://www.genspark.ai/ja/blog/pricing)

- genspark-plans: [Genspark 공식 회원 혜택·무제한 조건](https://www.genspark.ai/helpcenter/membership-plans)

- genspark-credits: [Genspark 공식 크레딧 가이드](https://www.genspark.ai/helpcenter/credits-guide)

- recraft-free-conflict: [Recraft 마케팅 페이지의 무료 50/일 안내](https://www.recraft.ai/ai-image-combiner) — 공식 앱 문서의 30/일과 상충하므로 실제 계정 확인 필요.

## ChatGPT Plus 이미지 장수 추가 조사

2026-09-11에 Plus 공식 도움말, Images 도움말, 요금표를 재확인했습니다. 고정 월/일/시간창 이미지 장수는 확인되지 않았습니다. 비공식 웹 자료의 3시간 40~50장 등은 구형 모델 정보와 혼재하고 출처가 불명확해 현재 보장 한도로 채택하지 않았습니다. Images 도움말은 2.5와 Plus의 thinking 접근을 확인합니다. 실제 사용량별 $20/N 표는 제공 한도가 아닌 가정별 산술 비교입니다.

- [Images 공식 도움말](https://help.openai.com/en/articles/11084440-chatgpt-images)

## 비공식 수치 보완 (사용자 요청)

공식 보장 한도가 없는 ChatGPT Plus에 40~50회/3시간을 비공식 보고 집계의 참고 범위로 추가했습니다. GeniGPT(2026-07-02)와 AI Career Lab(2026년 9월판)이 같은 범위를 기재하지만 독립 원시 로그·표본수·모델 버전이 없어 신뢰 낮음으로 표시했습니다. Plus 개인 사용자의 3장 후 제한 사례를 반례로 함께 수록했습니다. 월 800~1000회는 1일 한 구간×20일이라는 계산 예시이며 실측 월간량이 아닙니다.

- https://genigpt.net/guides/chatgpt-image-limits/
- https://theaicareerlab.com/blog/ai-usage-limits-compared-2026
- https://www.reddit.com/user/PlasticIcy5213/comments/1up1x4p/chatgpt_plus_image_generation_limit_triggered/

## 전체 플랫폼 생성량 참고 수치 보완

각 플랫폼의 quantityEvidence에 입력 수치, 기간, 계산 조건, 신뢰도, 출처를 구분했습니다. Midjourney는 공식 GPU 시간, Adobe와 Recraft는 공식 모델별 차감표에서 계산했습니다. Leonardo는 2025년 4장/46토큰 관측을 조건부 예시로 사용했습니다. Ideogram은 외부 모델별 단가표, Gemini는 계정 게이지 변화, Grok는 편집 게이지와 Heavy→일반 티어 외삽의 한계를 표시했습니다. Genspark 113장은 단일 프로젝트 제작량이며 최대치로 사용하지 않았습니다. 모든 긴 상세 설명은 기본 접힘 상태입니다.

### 추가 조사 출처

- [Adobe 공식 외부 모델별 크레딧 차감표](https://helpx.adobe.com/creative-cloud/apps/generative-ai/non-adobe-models-in-adobe-products.html) · official

- [Recraft 공식 Studio 모델별 크레딧 표](https://www.recraft.ai/docs/plans-and-billing/credits) · official

- [비공식 · Lucid Origin 4장에 46토큰 커뮤니티 보고 · 2025-08](https://www.reddit.com/r/leonardoai/comments/1mi92fy/new_preset/) · firsthand

- [비공식 · MobileAppDaily Ideogram 모델별 차감표](https://www.mobileappdaily.com/product-review/ideogram) · secondary

- [개인 테스트 · Gemini 무료 이미지 1회에 한도 5%p 증가](https://www.reddit.com/r/GeminiAI/comments/1tiklmr/i_tested_the_new_gemini_usage_limits_on_a_free/) · firsthand

- [개인 보고 · Gemini Pro 이미지 1장에 5시간 한도 1%](https://www.reddit.com/r/GeminiAI/comments/1trv3t7/how_many_images_can_you_generate_in_google_flow/) · firsthand

- [개인 테스트 · SuperGrok 이미지 편집 6회에 주간 한도 1%](https://www.reddit.com/r/grok/comments/1vl0yvw/how_many_image_edits_can_you_do_in_supergrok_a_day/) · firsthand

- [비공식 · Heavy 실측에서 일반 SuperGrok 1,000장/주 추정](https://www.reddit.com/r/grok/comments/1v9o4t9/how_many_grokimages_can_i_generate_dailymonth/) · firsthand

- [개인 제작 기록 · Genspark 이미지 113장 프로젝트 · 2026-03-05](https://note.com/nice_wolf2883/n/nde1eef6a267b?hl=en) · firsthand
