# FormWith 개발 일지

8월 31일 첫 저장부터 10월 7일까지 **38일**, 작업 묶음(PR) **258개**, 저장 기록(커밋, 합치기 제외) **894개**, 배포 꾸러미(릴리스) **203개**.

한 주씩 쉬운 말 요약을 먼저 적고, 그 주의 작업 묶음은 접어 두었습니다. 분야로 거르거나 찾아보려면 이 폴더의 `index.html` 을 내려받아 브라우저로 여세요.

| 주 | 한 줄 | 작업 묶음 | 저장 기록 | 배포 꾸러미 |
|---|---|---:|---:|---:|
| [8/31](#w-2026-08-31) | 씨앗을 심고 도구들의 뼈대를 세운 주 | 21 | 213 | 0 |
| [9/7](#w-2026-09-07) | 광고·팀·크레딧이 붙고 배포 방식이 자리 잡은 주 | 80 | 144 | 40 |
| [9/14](#w-2026-09-14) | 만든 과정을 다시 열고, 쉽게 모드가 태어난 주 | 48 | 162 | 47 |
| [9/21](#w-2026-09-21) | 이름을 FormWith 로 바꾸고 크레딧·구독 체계를 세운 주 | 39 | 78 | 38 |
| [9/28](#w-2026-09-28) | 출시를 앞두고 도우미·약관·보안·서버를 다진 주 | 60 | 238 | 67 |
| [10/5](#w-2026-10-05) | 운영을 들여다보는 눈을 단 주 | 10 | 59 | 11 |

<a id="w-2026-08-31"></a>

## 8월 31일 ~ 9월 6일 · 씨앗을 심고 도구들의 뼈대를 세운 주

기존 상세페이지 제작 도구를 씨앗 삼아 새 저장소를 열고, 나흘 만에 카드뉴스·이미지 만들기·캐릭터·라이브러리의 기본 흐름을 세웠습니다.

- 8월 31일, 기존 「detail-page-studio」를 씨앗으로 저장소를 시작했습니다.
- 카드뉴스는 「몇 장인지 자리 계산, 기획, 원고, 그림, 사람이 검수」 순서로 처음부터 만들었습니다.
- 포스터(뒤에 「이미지 만들기」로 넓힘)와 캐릭터, 참고 이미지를 모아 두는 라이브러리를 붙였습니다.
- 9월 3일부터 작업을 「작업 묶음」 단위로 검토하고 합치기 시작했습니다.
- 9월 4일 첫 화면을 공개용으로 개편하고, 틀이 고정된 카드뉴스를 더했습니다.
- 목록이 원본 대신 작은 미리보기를 받아 빨라졌습니다. 원본 화질은 그대로 둡니다.
- 주말에는 포털 광고 소재 규격 작업을 시작했습니다.

<details><summary>이 주의 작업 묶음 21개</summary>


**9/3**

- [#1](https://github.com/junginsu-make/fixup-image-agent/pull/1) docs: README 를 MCS 현재 모습으로 다시 쓴다 <sub>기타 · +159 / −96</sub>

**9/4**

- [#2](https://github.com/junginsu-make/fixup-image-agent/pull/2) 레이아웃 고정 카드뉴스 + 공개 랜딩페이지 개편 <sub>카드뉴스 · +9,006 / −564</sub>
- [#3](https://github.com/junginsu-make/fixup-image-agent/pull/3) feat: 첫 화면 갤러리·공용 참고 이미지·관리자 작업물·프롬프트 우선순위 <sub>관리자 · 첫 화면 · 라이브러리 · +4,382 / −464</sub>
- [#4](https://github.com/junginsu-make/fixup-image-agent/pull/4) fix: 관리자가 열자마자 전체 회원의 작업물을 본다 <sub>회원·로그인 · 관리자 · 라이브러리 · +42 / −13</sub>
- [#5](https://github.com/junginsu-make/fixup-image-agent/pull/5) feat: 최고 관리자가 남이 만든 것도 지운다 <sub>관리자 · +168 / −44</sub>
- [#6](https://github.com/junginsu-make/fixup-image-agent/pull/6) fix: 각도를 못 만들던 사용량 오류를 고치고, 2단계를 창으로 올린다 <sub>캐릭터 · +388 / −89</sub>
- [#7](https://github.com/junginsu-make/fixup-image-agent/pull/7) fix: 작업물 카드에서 바로 지운다 <sub>라이브러리 · +23 / −2</sub>
- [#8](https://github.com/junginsu-make/fixup-image-agent/pull/8) refactor: 지우기 단추 생김새를 한 곳에서 가져다 쓴다 <sub>작업 화면 · +15 / −2</sub>
- [#9](https://github.com/junginsu-make/fixup-image-agent/pull/9) fix: 좌우 각도 버그 + 만들기를 오른쪽 패널로 + 배포 시간 절반 <sub>캐릭터 · 배포·서버 · 작업 화면 · +485 / −258</sub>
- [#10](https://github.com/junginsu-make/fixup-image-agent/pull/10) fix: 닫은 패널로 돌아갈 손잡이 + 머리말 한 줄로 <sub>작업 화면 · +105 / −27</sub>
- [#11](https://github.com/junginsu-make/fixup-image-agent/pull/11) feat: 밀려 나오는 패널 둘이 같은 규칙을 쓴다 <sub>작업 화면 · +105 / −31</sub>
- [#12](https://github.com/junginsu-make/fixup-image-agent/pull/12) fix: 재생성 멈춤 해결 + 다섯 도구에 그리는 사람·보존·자리 규칙 <sub>기타 · +313 / −51</sub>

**9/5**

- [#13](https://github.com/junginsu-make/fixup-image-agent/pull/13) feat(library): 그림을 반으로 줄여 담되 화질은 한 톨도 내주지 않는다 <sub>라이브러리 · +1,372 / −51</sub>
- [#14](https://github.com/junginsu-make/fixup-image-agent/pull/14) feat: 목록·결과판이 원본 대신 미리보기를 받는다 (2단계) <sub>라이브러리 · +2,645 / −93</sub>
- [#15](https://github.com/junginsu-make/fixup-image-agent/pull/15) fix: 목록 세 곳이 만들어 둔 미리보기를 실제로 쓰게 한다 <sub>라이브러리 · +106 / −11</sub>

**9/6**

- [#16](https://github.com/junginsu-make/fixup-image-agent/pull/16) perf: 목록의 그림을 화면에 보일 때만 받아 온다 <sub>배포·서버 · +9 / −7</sub>
- [#17](https://github.com/junginsu-make/fixup-image-agent/pull/17) perf: 목록 그림이 툭 튀어나오지 않고 스며들게 한다 <sub>배포·서버 · +66 / −17</sub>
- [#18](https://github.com/junginsu-make/fixup-image-agent/pull/18) feat(library): 참고 이미지와 캐릭터 목록도 미리보기를 받는다 <sub>캐릭터 · 라이브러리 · +586 / −29</sub>
- [#19](https://github.com/junginsu-make/fixup-image-agent/pull/19) fix: 백필이 요즘 폰 사진을 통째로 놓치던 것을 고친다 <sub>라이브러리 · +204 / −23</sub>
- [#20](https://github.com/junginsu-make/fixup-image-agent/pull/20) fix: 백필이 회원의 최근 편집을 덮지 않게 하고, 시험의 구멍 셋을 막는다 <sub>회원·로그인 · 라이브러리 · +424 / −31</sub>
- [#21](https://github.com/junginsu-make/fixup-image-agent/pull/21) feat(ad): 포털 광고 소재 규격 — 0·1단계 (격리 자물쇠 + 규격·파생·검증) <sub>광고 규격 · +2,184 / −0</sub>

**작업 묶음 방식 이전의 저장 기록 (큰 줄기만)**

- 8/31 chore: detail-page-studio 를 씨앗으로 Fixup Image Agent 를 시작한다
- 8/31 feat(inbox): 수집함 화면을 만든다
- 8/31 feat(library): 참고 이미지와 묶음 세트를 라이브러리에 넣는다
- 9/1 feat(sns): 자리 계산 — AI 에게 장수를 묻지 않는다
- 9/1 feat(sns): 카드 생성 파이프라인
- 9/1 feat(poster): LLM 이 슬롯을 채우는 기획
- 9/1 feat(poster): 검수와 변형 선택·수정 루프
- 9/2 feat: 라이브러리 하나로 모으고 세 도구가 다 끌어다 쓴다
- 9/2 feat(studio): 대화로 무엇을 만들지 정하는 뼈대
- 9/3 feat(ui): 포스터 만들기를 이미지 만들기로 넓힌다
- 9/3 feat(watermark): 만든 그림에 "AI 이미지" 를 옅게 새긴다
- 9/3 feat(character): 사람만 만들던 것을 동물·캐릭터·사물까지 넓힌다
- 9/4 feat(guide): 앱 안에 사용 설명서를 붙인다

</details>

<a id="w-2026-09-07"></a>

## 9월 7일 ~ 9월 13일 · 광고·팀·크레딧이 붙고 배포 방식이 자리 잡은 주

만든 그림을 포털 광고 규격으로 뽑는 기능이 완성되고, 사용량을 실제 돈과 묶는 장부가 들어왔습니다.

- 광고 규격 자동 생성을 4단계에 걸쳐 완성해, 필수 광고 소재 9개를 한 번에 만듭니다.
- 팀 작업 공간을 만들었습니다. (9월 22일에 화면에서는 숨김)
- 이미지 만들기에 첨부 그림 번호와 「사람은 그대로, 그림 느낌만」 같은 역할을 붙였습니다.
- 다섯 도구 모두 사용량을 실제 비용에 맞춰 장부에 적기 시작했습니다.
- 9월 9일 상세페이지를 크게 손보고, Next.js 의 원격 실행 보안 구멍 둘을 막았습니다.
- 9월 10일 배포 꾸러미를 GitHub 릴리스로 내보내는 지금의 배포 방식이 시작됐고, 첫 화면을 움직이는 그림 캐러셀로 바꿨습니다.
- 기본 그림 모델을 gpt-image-2.5 로 옮기고, 관리자용 비용 전략실을 들였습니다.

<details><summary>이 주의 작업 묶음 80개</summary>


**9/7**

- [#22](https://github.com/junginsu-make/fixup-image-agent/pull/22) feat(ad): 광고 규격 내보내기 API — 2단계-A (서버) <sub>광고 규격 · +861 / −9</sub>
- [#23](https://github.com/junginsu-make/fixup-image-agent/pull/23) fix: 캐릭터 한 장에 자세 다섯이 나오던 것 + 내려받기 없던 것 <sub>캐릭터 · +912 / −5</sub>
- [#24](https://github.com/junginsu-make/fixup-image-agent/pull/24) fix(ad): 광고 규격 화면 리뷰 반영 — 조용히 실패하던 자리들 <sub>광고 규격 · +398 / −65</sub>
- [#25](https://github.com/junginsu-make/fixup-image-agent/pull/25) refactor(access): 권한 판단을 한 곳으로 + 팀 표 셋 (1·2단계) <sub>회원·로그인 · 팀 · +847 / −59</sub>
- [#26](https://github.com/junginsu-make/fixup-image-agent/pull/26) feat(teams): 작업물에 팀 자리를 내고, 팀이 서로의 것을 읽게 한다 (4단계) <sub>라이브러리 · 팀 · +434 / −0</sub>
- [#27](https://github.com/junginsu-make/fixup-image-agent/pull/27) feat(teams): 팀 워크스페이스 — 편성 · 시야 · 프로젝트 · 크레딧 <sub>크레딧·비용 · 팀 · +4,521 / −96</sub>
- [#28](https://github.com/junginsu-make/fixup-image-agent/pull/28) feat(ad): 광고 규격 자동 생성 3단계 — 만들기 화면의 광고 모드 <sub>광고 규격 · +3,609 / −176</sub>
- [#29](https://github.com/junginsu-make/fixup-image-agent/pull/29) style(team): 팀 화면을 기존 화면들과 같은 모양으로 맞춘다 <sub>팀 · +561 / −34</sub>
- [#30](https://github.com/junginsu-make/fixup-image-agent/pull/30) feat(admin): 회원 명단 한 줄에서 팀까지 다루고, 다섯 줄을 한 줄로 줄인다 <sub>광고 규격 · 회원·로그인 · 관리자 · 팀 · +324 / −95</sub>
- [#32](https://github.com/junginsu-make/fixup-image-agent/pull/32) feat(poster): 첨부 그림에 번호를 붙이고, 어떻게 쓸지 사용자가 말하게 한다 <sub>이미지 만들기 · +1,145 / −37</sub>

**9/8**

- [#31](https://github.com/junginsu-make/fixup-image-agent/pull/31) feat(ad): 4단계 — 조립 엔진으로 필수 광고 소재 9개를 전부 만든다 <sub>광고 규격 · +2,200 / −61</sub>
- [#33](https://github.com/junginsu-make/fixup-image-agent/pull/33) test(poster): 첨부 이미지 기능 독립 검증 — 안 잠긴 자리 다섯을 잠그고, 내가 적은 말을 03·04 에서 보여준다 <sub>이미지 만들기 · +668 / −98</sub>
- [#34](https://github.com/junginsu-make/fixup-image-agent/pull/34) fix(poster): 돌고 있는 것을 보이게 하고, 안 시킨 글자를 막고, 설계 4-1 을 닫는다 <sub>이미지 만들기 · +452 / −19</sub>
- [#35](https://github.com/junginsu-make/fixup-image-agent/pull/35) feat(poster): 01의 말을 03에 미리 채우고, 04 기획을 오른쪽 패널로 옮긴다 <sub>이미지 만들기 · 작업 화면 · +430 / −93</sub>
- [#36](https://github.com/junginsu-make/fixup-image-agent/pull/36) feat(poster): 「사람은 그대로, 그림 느낌만」 역할을 만든다 (설계 4-3) <sub>이미지 만들기 · +388 / −23</sub>
- [#37](https://github.com/junginsu-make/fixup-image-agent/pull/37) feat(ad): 광고는 골라서 들어간다 — 결과에서 진입, 포털부터 선택, 사이드바 <sub>광고 규격 · 작업 화면 · +823 / −22</sub>
- [#38](https://github.com/junginsu-make/fixup-image-agent/pull/38) feat(poster): 기획이 사람을 한 명씩 보게 한다 <sub>이미지 만들기 · +396 / −6</sub>
- [#39](https://github.com/junginsu-make/fixup-image-agent/pull/39) fix(poster): 안 고르면 한 장으로 시작한다 <sub>이미지 만들기 · +52 / −3</sub>
- [#40](https://github.com/junginsu-make/fixup-image-agent/pull/40) feat(credit): 장을 실제 돈에 붙이고, 이미지 만들기를 장부에 들인다 <sub>이미지 만들기 · 크레딧·비용 · +414 / −10</sub>
- [#41](https://github.com/junginsu-make/fixup-image-agent/pull/41) feat(sns): 카드뉴스 첨부를 이미지 만들기와 같게 맞추고, 사용량 장부에 들인다 <sub>카드뉴스 · 이미지 만들기 · 크레딧·비용 · +1,022 / −45</sub>
- [#42](https://github.com/junginsu-make/fixup-image-agent/pull/42) feat(credit): 다섯 도구 모두 장을 실제 돈에서 뽑는다 <sub>크레딧·비용 · +243 / −37</sub>
- [#43](https://github.com/junginsu-make/fixup-image-agent/pull/43) fix(character): 「그리는 방식」을 뽑아내기에서 뗀다 <sub>캐릭터 · +77 / −4</sub>

**9/9**

- [#44](https://github.com/junginsu-make/fixup-image-agent/pull/44) 상세페이지 개선: 조립 통합 · 타입 경계 · Gemini 제거 · 자리별 지시 · 기획이 레퍼런스를 봄 · 코어 순수화 <sub>상세페이지 · 라이브러리 · +3,844 / −1,029</sub>
- [#45](https://github.com/junginsu-make/fixup-image-agent/pull/45) 보안: Next.js 원격 코드 실행 취약점 둘을 막는다 <sub>보안 · +268 / −194</sub>
- [#46](https://github.com/junginsu-make/fixup-image-agent/pull/46) 상세페이지: 참조 이미지 안내 문구를 뺀다 <sub>상세페이지 · +0 / −22</sub>
- [#47](https://github.com/junginsu-make/fixup-image-agent/pull/47) 상세페이지: 「안내 사항」 구획을 뺀다 <sub>상세페이지 · +0 / −24</sub>
- [#48](https://github.com/junginsu-make/fixup-image-agent/pull/48) 인프라: CI 를 되살리고, 수집 워커가 한 소스에서 굳지 않게 한다 <sub>배포·서버 · +233 / −29</sub>
- [#49](https://github.com/junginsu-make/fixup-image-agent/pull/49) 크레딧: 예약을 되살리고, 확정을 서버 값으로 되돌린다 <sub>크레딧·비용 · +473 / −16</sub>
- [#50](https://github.com/junginsu-make/fixup-image-agent/pull/50) 상세페이지: 장부를 못 닫았다고 사용자가 만든 것을 잃지 않는다 <sub>상세페이지 · 크레딧·비용 · +234 / −13</sub>
- [#51](https://github.com/junginsu-make/fixup-image-agent/pull/51) 결과물이 조용히 망가지는 자리를 고친다 <sub>기타 · +636 / −92</sub>
- [#52](https://github.com/junginsu-make/fixup-image-agent/pull/52) 팀: 남의 데이터에 닿는 자리를 막고, 배정이 팀을 굳히지 못하게 한다 <sub>보안 · 팀 · +609 / −62</sub>
- [#53](https://github.com/junginsu-make/fixup-image-agent/pull/53) 크레딧: 장부 밖에서 나가던 fal 비용을 잡는다 <sub>크레딧·비용 · 배포·서버 · +346 / −65</sub>
- [#54](https://github.com/junginsu-make/fixup-image-agent/pull/54) 상세페이지: 라이브러리를 모달로 열고, 저장한 그림을 지울 수 있게 한다 <sub>상세페이지 · 라이브러리 · +223 / −56</sub>
- [#55](https://github.com/junginsu-make/fixup-image-agent/pull/55) 상세페이지: 화면에서 고른 인물 조건이 엔진에 안 가고 있었다 <sub>상세페이지 · +206 / −5</sub>
- [#56](https://github.com/junginsu-make/fixup-image-agent/pull/56) fix(sns): 「이미 생성 중」을 화면이 듣게 한다 (409 반복) <sub>카드뉴스 · +147 / −2</sub>
- [#57](https://github.com/junginsu-make/fixup-image-agent/pull/57) 상세페이지: 세로로 긴 레퍼런스를 조각으로 나눠 기획에 보낸다 <sub>상세페이지 · 라이브러리 · +283 / −18</sub>
- [#58](https://github.com/junginsu-make/fixup-image-agent/pull/58) 상세페이지: 1단계에서 적은 것이 기획과 그림까지 이어지게 한다 <sub>상세페이지 · +197 / −11</sub>
- [#59](https://github.com/junginsu-make/fixup-image-agent/pull/59) 상세페이지: 기획이 섹션마다 적어 둔 것을 그림이 읽게 한다 <sub>상세페이지 · +126 / −0</sub>
- [#60](https://github.com/junginsu-make/fixup-image-agent/pull/60) 상세페이지: 긴 레퍼런스 조각을 섹션마다 전부 보낸다 (C안) <sub>상세페이지 · 라이브러리 · +329 / −28</sub>
- [#61](https://github.com/junginsu-make/fixup-image-agent/pull/61) 상세페이지: 오른쪽 설정·첨부가 그림까지 이어지게, 단계 막대·라이브러리 UI 정리 <sub>이미지 만들기 · 상세페이지 · 라이브러리 · 작업 화면 · +1,972 / −218</sub>

**9/10**

- [#62](https://github.com/junginsu-make/fixup-image-agent/pull/62) ci: 배포 꾸러미를 릴리스 자산으로 내보낸다 <sub>배포·서버 · +21 / −3</sub>
- [#63](https://github.com/junginsu-make/fixup-image-agent/pull/63) fix(sns): 결과판을 한눈에 보이게 하고, 낱장에 고칠 말을 적게 한다 <sub>카드뉴스 · +537 / −12</sub>
- [#64](https://github.com/junginsu-make/fixup-image-agent/pull/64) docs: 배포 절차를 실제로 되는 방법으로 고치고 규칙으로 남긴다 <sub>배포·서버 · +92 / −13</sub>
- [#65](https://github.com/junginsu-make/fixup-image-agent/pull/65) 이미지 기본 모델을 gpt-image-2.5 flare/max 로 옮긴다 <sub>기타 · +1,042 / −58</sub>
- [#66](https://github.com/junginsu-make/fixup-image-agent/pull/66) 첫 화면을 WebGL 캐러셀로: 옛 랜딩 정리 · 로고 · 법률 문서 <sub>첫 화면 · +3,086 / −666</sub>
- [#67](https://github.com/junginsu-make/fixup-image-agent/pull/67) fix: 첫 화면과 슬로건 사이 구분선 제거 <sub>첫 화면 · +11 / −0</sub>
- [#68](https://github.com/junginsu-make/fixup-image-agent/pull/68) fix: 히어로 아래 가로줄 제거 · 슬로건 번호 가시성 <sub>첫 화면 · +19 / −35</sub>
- [#69](https://github.com/junginsu-make/fixup-image-agent/pull/69) feat: 공유 미리보기 이미지 · 휠 5바퀴 제한 · 맨 위로 · 인물 일관성 항목 <sub>첫 화면 · 라이브러리 · +294 / −13</sub>
- [#70](https://github.com/junginsu-make/fixup-image-agent/pull/70) fix: 휠을 바퀴가 아니라 넘어간 장으로 센다 <sub>첫 화면 · +62 / −71</sub>
- [#71](https://github.com/junginsu-make/fixup-image-agent/pull/71) 수집 화면을 당분간 끄고, 스튜디오·가입 로고를 첫 화면과 맞춘다 <sub>회원·로그인 · 첫 화면 · +423 / −91</sub>
- [#72](https://github.com/junginsu-make/fixup-image-agent/pull/72) fix: 첫 화면 고정 — 내려가는 길은 손잡이 하나, 위로 아이콘도 ∧ 로 <sub>첫 화면 · +22 / −101</sub>
- [#73](https://github.com/junginsu-make/fixup-image-agent/pull/73) chore(landing): 법률 문서의 빈칸을 채우고 공유 카드를 바꾼다 <sub>첫 화면 · +39 / −2</sub>
- [#74](https://github.com/junginsu-make/fixup-image-agent/pull/74) fix(deploy): 잠근 워커는 건너뛴다 <sub>배포·서버 · +10 / −1</sub>
- [#75](https://github.com/junginsu-make/fixup-image-agent/pull/75) chore(landing): 공유 카드를 히어로 화면으로 바꾼다 <sub>첫 화면 · +0 / −0</sub>
- [#76](https://github.com/junginsu-make/fixup-image-agent/pull/76) fix(landing): 공유 그림의 주소를 바꾼다 — 같은 이름으로는 캐시를 못 이긴다 <sub>첫 화면 · +50 / −2</sub>
- [#77](https://github.com/junginsu-make/fixup-image-agent/pull/77) feat(membership): 가입 기본 한도를 5 → 30 장으로 올린다 <sub>크레딧·비용 · 회원·로그인 · +63 / −0</sub>
- [#78](https://github.com/junginsu-make/fixup-image-agent/pull/78) MCS 란 화면을 더하고, 언어 전환과 만들기 버튼을 손본다 <sub>첫 화면 · +2,534 / −55</sub>
- [#79](https://github.com/junginsu-make/fixup-image-agent/pull/79) fix(home): 휠 한 칸이 가는 거리를 두 배로 <sub>첫 화면 · +39 / −4</sub>
- [#80](https://github.com/junginsu-make/fixup-image-agent/pull/80) fix(home): 휠 한 칸이 그림 2.6장에서 3.5장으로 <sub>첫 화면 · +50 / −34</sub>
- [#81](https://github.com/junginsu-make/fixup-image-agent/pull/81) fix(home): 휠 한 칸을 그림 3.5장에서 4장으로 <sub>첫 화면 · +4 / −1</sub>
- [#82](https://github.com/junginsu-make/fixup-image-agent/pull/82) feat(landing): 회원 화면에서 모델을 성질로 부른다 <sub>회원·로그인 · 첫 화면 · +376 / −56</sub>
- [#83](https://github.com/junginsu-make/fixup-image-agent/pull/83) 글꼴 파일이 로그인으로 튕기고 있었다 <sub>회원·로그인 · 첫 화면 · +335 / −31</sub>
- [#84](https://github.com/junginsu-make/fixup-image-agent/pull/84) fix(landing): 공개 홈에 남아 있던 모델 이름을 걷어낸다 <sub>첫 화면 · +71 / −33</sub>
- [#85](https://github.com/junginsu-make/fixup-image-agent/pull/85) 휠 한 칸을 화면의 15% 로 — 「평균보다 살짝 더」 <sub>첫 화면 · +21 / −8</sub>
- [#86](https://github.com/junginsu-make/fixup-image-agent/pull/86) 휠 한 칸을 화면의 3분의 1로, 지워진 글자는 옛 글꼴로 <sub>첫 화면 · +143 / −52</sub>
- [#87](https://github.com/junginsu-make/fixup-image-agent/pull/87) feat(cost): 장부가 실제 지출을 담게 한다 <sub>크레딧·비용 · +620 / −12</sub>
- [#88](https://github.com/junginsu-make/fixup-image-agent/pull/88) 푸터에 사업자 정보를 고정으로 건다 <sub>첫 화면 · +283 / −5</sub>
- [#89](https://github.com/junginsu-make/fixup-image-agent/pull/89) feat(membership): 가입 기본 한도를 30 → 100 장으로 <sub>크레딧·비용 · 회원·로그인 · +69 / −12</sub>
- [#90](https://github.com/junginsu-make/fixup-image-agent/pull/90) 휴대폰에서 지워진 글자가 뭉개던 것 — 획 바닥값이 원인 <sub>첫 화면 · +35 / −1</sub>

**9/11**

- [#91](https://github.com/junginsu-make/fixup-image-agent/pull/91) fix(redesign): 조용히 사라지던 것 셋과, 브라우저에만 남던 결과물 <sub>리디자인 · +412 / −25</sub>
- [#92](https://github.com/junginsu-make/fixup-image-agent/pull/92) 광고 내보내기: 그림 고르기를 공용 창으로, 단계를 나눈다 <sub>광고 규격 · +649 / −235</sub>
- [#93](https://github.com/junginsu-make/fixup-image-agent/pull/93) fix(redesign): 고품질 값을 받고 저품질을 만들어 주고 있었다 <sub>리디자인 · +187 / −15</sub>
- [#94](https://github.com/junginsu-make/fixup-image-agent/pull/94) refactor(redesign): 화면 한 파일 2,589줄을 여덟으로 나눈다 <sub>리디자인 · +1,938 / −1,689</sub>
- [#95](https://github.com/junginsu-make/fixup-image-agent/pull/95) refactor(redesign): 멱등 키를 떼어 내 시험하고, 남은 import 를 걷어낸다 <sub>리디자인 · +203 / −105</sub>
- [#96](https://github.com/junginsu-make/fixup-image-agent/pull/96) feat(redesign): 그림 품질을 low → high 로 올린다 <sub>리디자인 · +140 / −27</sub>
- [#97](https://github.com/junginsu-make/fixup-image-agent/pull/97) feat(redesign): gpt-image-2.5 로 옮긴다 — 더 좋은데 더 싸다 <sub>리디자인 · +351 / −24</sub>
- [#98](https://github.com/junginsu-make/fixup-image-agent/pull/98) 비용 전략실을 관리자 전용 화면으로 들인다 <sub>크레딧·비용 · 관리자 · +640 / −0</sub>
- [#99](https://github.com/junginsu-make/fixup-image-agent/pull/99) 비용 전략실을 새 판으로 갈고, 시스템 화면으로 들인다 <sub>크레딧·비용 · +2,303 / −278</sub>
- [#100](https://github.com/junginsu-make/fixup-image-agent/pull/100) 비용 전략실의 겉테두리를 걷어내고 화면을 꽉 채운다 <sub>크레딧·비용 · +95 / −53</sub>
- [#101](https://github.com/junginsu-make/fixup-image-agent/pull/101) feat(characters): 캐릭터 만들기 2단계 개편 · 다각도 한 장 · 큰 보기 넘기기 버그 <sub>캐릭터 · +1,403 / −890</sub>

</details>

<a id="w-2026-09-14"></a>

## 9월 14일 ~ 9월 20일 · 만든 과정을 다시 열고, 쉽게 모드가 태어난 주

라이브러리에서 지난 작업을 단계별로 다시 열 수 있게 되었고, 말로 주문하는 대화형 화면이 처음 나왔습니다.

- 작업 화면 왼쪽 메뉴를 접었다 펼 수 있게 했습니다.
- 저장해 둔 캐릭터에서 원하는 장면을 골라 쓸 수 있습니다.
- 이미지 만들기를 그림 없이 글만으로도 시작할 수 있게 했습니다.
- 라이브러리에서 이미지·카드뉴스·상세페이지·캐릭터 작업을 단계별로 다시 열어 봅니다.
- 지난 단계로 돌아가면 그때 입력한 값이 그대로 들어 있습니다.
- 그림 서비스가 거절한 경우를 우리 고장처럼 말하지 않게 안내를 바로잡았습니다.
- 9월 18일 「쉽게(Easy) 모드」, 말로 만드는 대화 화면을 처음 열었습니다.

<details><summary>이 주의 작업 묶음 48개</summary>


**9/14**

- [#104](https://github.com/junginsu-make/fixup-image-agent/pull/104) feat(shell): 스튜디오 사이드바를 접었다 펼 수 있게 한다 <sub>작업 화면 · +298 / −4</sub>
- [#105](https://github.com/junginsu-make/fixup-image-agent/pull/105) fix(shell): 접기 손잡이를 사이드바 테두리로 옮기고 얇은 띠를 남긴다 <sub>작업 화면 · +143 / −35</sub>
- [#106](https://github.com/junginsu-make/fixup-image-agent/pull/106) fix(access): 인증을 마친 사람을 대기 화면에 세워 두지 않는다 <sub>회원·로그인 · +295 / −11</sub>
- [#107](https://github.com/junginsu-make/fixup-image-agent/pull/107) feat(admin): 로그인한 계정을 보이게 하고 소유자 계정을 보호한다 <sub>광고 규격 · 회원·로그인 · 관리자 · +440 / −37</sub>
- [#108](https://github.com/junginsu-make/fixup-image-agent/pull/108) feat(ad): 광고 규격 내보내기를 사용량 장부에 들인다 <sub>광고 규격 · 크레딧·비용 · +692 / −9</sub>
- [#109](https://github.com/junginsu-make/fixup-image-agent/pull/109) 카드뉴스 틀 고르기를 눈으로 고르게 하고 새던 값을 장부에 올린다 <sub>카드뉴스 · 크레딧·비용 · +654 / −74</sub>
- [#110](https://github.com/junginsu-make/fixup-image-agent/pull/110) feat(landing): 푸터에 만든 사람을 적고 두 줄을 뺀다 <sub>첫 화면 · +180 / −17</sub>
- [#111](https://github.com/junginsu-make/fixup-image-agent/pull/111) docs(guide): 빠진 도구 둘을 채우고 요약을 먼저 보이게 한다 <sub>설명서·도우미 · +895 / −28</sub>
- [#112](https://github.com/junginsu-make/fixup-image-agent/pull/112) feat(guide): 크레딧과 모델을 관리자에게만 보인다 <sub>크레딧·비용 · 관리자 · 설명서·도우미 · +201 / −49</sub>
- [#113](https://github.com/junginsu-make/fixup-image-agent/pull/113) Revert "feat(guide): 크레딧과 모델을 관리자에게만 보인다" <sub>크레딧·비용 · 관리자 · 설명서·도우미 · +49 / −201</sub>
- [#114](https://github.com/junginsu-make/fixup-image-agent/pull/114) fix(sns): 버튼 아래 안내를 한 줄로 편다 <sub>카드뉴스 · +9 / −2</sub>
- [#115](https://github.com/junginsu-make/fixup-image-agent/pull/115) feat(admin): 첫 화면 갤러리를 끌어서 옮기는 판으로 바꾼다 <sub>광고 규격 · 관리자 · 첫 화면 · +551 / −182</sub>

**9/15**

- [#116](https://github.com/junginsu-make/fixup-image-agent/pull/116) feat: 저장해 둔 캐릭터에서 쓸 장면을 골라 쓴다 <sub>캐릭터 · +2,587 / −380</sub>
- [#117](https://github.com/junginsu-make/fixup-image-agent/pull/117) fix: 불러오기 창이 원본 대신 사본을 걸고, 릴리스를 쌓지 않게 한다 <sub>배포·서버 · +648 / −46</sub>
- [#118](https://github.com/junginsu-make/fixup-image-agent/pull/118) fix: 광고 화면의 확대가 사본 대신 원본을 연다 <sub>광고 규격 · +156 / −18</sub>
- [#119](https://github.com/junginsu-make/fixup-image-agent/pull/119) feat: 디자인 레퍼런스도 격자에 사본을 건다 <sub>라이브러리 · +283 / −16</sub>

**9/16**

- [#120](https://github.com/junginsu-make/fixup-image-agent/pull/120) feat: 이미지 만들기를 글만으로도 시작할 수 있게 한다 <sub>이미지 만들기 · +462 / −137</sub>
- [#121](https://github.com/junginsu-make/fixup-image-agent/pull/121) fix: 이미지 만들기 설명서를 바뀐 차례에 맞춘다 <sub>이미지 만들기 · 설명서·도우미 · +124 / −46</sub>
- [#122](https://github.com/junginsu-make/fixup-image-agent/pull/122) feat: 라이브러리에서 작업의 단계별 과정으로 들어간다 <sub>라이브러리 · +2,680 / −34</sub>
- [#123](https://github.com/junginsu-make/fixup-image-agent/pull/123) fix: 제공자가 거절한 것을 우리 고장처럼 말하지 않는다 <sub>기타 · +553 / −6</sub>
- [#124](https://github.com/junginsu-make/fixup-image-agent/pull/124) feat: 관리자 화면에 이미지 모델 대조표를 둔다 <sub>관리자 · +368 / −0</sub>
- [#125](https://github.com/junginsu-make/fixup-image-agent/pull/125) fix: 남의 작업을 볼 때 값이 사라진 것처럼 보이던 두 가지 <sub>라이브러리 · +98 / −8</sub>
- [#126](https://github.com/junginsu-make/fixup-image-agent/pull/126) fix(sns): 남의 카드뉴스도 만들어진 카드가 보이게 한다 <sub>카드뉴스 · +108 / −6</sub>
- [#127](https://github.com/junginsu-make/fixup-image-agent/pull/127) feat(characters): 캐릭터도 무엇으로 만들었는지 열어 본다 <sub>캐릭터 · +740 / −13</sub>
- [#128](https://github.com/junginsu-make/fixup-image-agent/pull/128) fix: 캐릭터 페이지가 생기면서 걸린 링크 두 곳을 고친다 <sub>캐릭터 · +6 / −4</sub>
- [#129](https://github.com/junginsu-make/fixup-image-agent/pull/129) feat: 이미지 만들기 — 완성된 프롬프트를 살리고, 최종 프롬프트를 보이게 한다 <sub>이미지 만들기 · +1,163 / −31</sub>
- [#130](https://github.com/junginsu-make/fixup-image-agent/pull/130) feat(library): 상세페이지 작업도 라이브러리에서 과정을 열어 본다 <sub>상세페이지 · 라이브러리 · +2,576 / −58</sub>
- [#131](https://github.com/junginsu-make/fixup-image-agent/pull/131) fix: 쓴 그대로일 때 글자를 우리가 금지하지 않는다 <sub>기타 · +70 / −2</sub>
- [#132](https://github.com/junginsu-make/fixup-image-agent/pull/132) feat(poster,sns): 지난 단계로 가면 그때 값이 들어 있다 <sub>카드뉴스 · 이미지 만들기 · +1,336 / −25</sub>
- [#133](https://github.com/junginsu-make/fixup-image-agent/pull/133) fix: 01·02 화면을 알아보기 쉽게 하고, 서버가 같은 규칙을 지키게 한다 <sub>쉽게 모드 · +270 / −84</sub>
- [#134](https://github.com/junginsu-make/fixup-image-agent/pull/134) fix: 설명서의 그림체 이름을 코드에서 가져온다 <sub>설명서·도우미 · +39 / −5</sub>
- [#135](https://github.com/junginsu-make/fixup-image-agent/pull/135) docs: 이미지 만들기 프롬프트 작성 주체 설계 <sub>이미지 만들기 · +388 / −0</sub>
- [#136](https://github.com/junginsu-make/fixup-image-agent/pull/136) fix: 그림체 목록을 한 표로 모으고, 상세페이지도 레퍼런스 유무를 본다 <sub>상세페이지 · 라이브러리 · +177 / −19</sub>
- [#137](https://github.com/junginsu-make/fixup-image-agent/pull/137) fix(rerun): 단계로 넘어가도 레퍼런스까지 채우고, 관리자 복사본 범위를 지킨다 <sub>관리자 · 라이브러리 · +2,815 / −175</sub>
- [#138](https://github.com/junginsu-make/fixup-image-agent/pull/138) feat: 설계에 남은 네 가지 (줄표 제거·기획 비용 표시·§7 실측·5번 검증 후 보류) <sub>크레딧·비용 · +961 / −143</sub>

**9/17**

- [#139](https://github.com/junginsu-make/fixup-image-agent/pull/139) fix(studio): 진행 표시·기획 패널·참고 이미지 규칙을 손본다 <sub>라이브러리 · 작업 화면 · +1,579 / −409</sub>
- [#140](https://github.com/junginsu-make/fixup-image-agent/pull/140) fix(library,viewer,hero): 과정 보기 설명·크게 보기 가운데 정렬·히어로 밝기 <sub>첫 화면 · 라이브러리 · +236 / −26</sub>
- [#141](https://github.com/junginsu-make/fixup-image-agent/pull/141) fix(rerun): 결과에서 누른 단계로 바로 연다 <sub>라이브러리 · +164 / −13</sub>
- [#142](https://github.com/junginsu-make/fixup-image-agent/pull/142) feat: 레퍼런스 스타일 확대 · 기획이 지어낸 칸 표시 · 모델별 프롬프트 · 길이 제한 해제 <sub>라이브러리 · +2,386 / −85</sub>
- [#143](https://github.com/junginsu-make/fixup-image-agent/pull/143) fix(layout): 내 카드뉴스 만들기를 한 화면 안에 넣는다 <sub>카드뉴스 · 작업 화면 · +508 / −28</sub>
- [#144](https://github.com/junginsu-make/fixup-image-agent/pull/144) fix(포스터): 첨부한 모자와 포스터 느낌이 결과에서 사라지던 회귀 <sub>이미지 만들기 · +717 / −173</sub>
- [#145](https://github.com/junginsu-make/fixup-image-agent/pull/145) fix(sns-layout): 「칸 읽어내기」에 요청 식별자를 붙인다 <sub>카드뉴스 · 작업 화면 · +158 / −3</sub>
- [#146](https://github.com/junginsu-make/fixup-image-agent/pull/146) fix(rerun): 03 을 누르면 바로 03 으로 연다 <sub>라이브러리 · +157 / −44</sub>

**9/18**

- [#147](https://github.com/junginsu-make/fixup-image-agent/pull/147) feat(포스터): 붙인 그림을 역할과 무관하게 한 번에 읽는다 <sub>이미지 만들기 · +570 / −146</sub>
- [#148](https://github.com/junginsu-make/fixup-image-agent/pull/148) fix(기획): 읽은 연출을 쓸 수 있다고 알려 준다 <sub>이미지 만들기 · +93 / −9</sub>
- [#149](https://github.com/junginsu-make/fixup-image-agent/pull/149) feat(easy): Easy 모드 — 말로 만드는 대화 화면 <sub>쉽게 모드 · +2,894 / −11</sub>
- [#150](https://github.com/junginsu-make/fixup-image-agent/pull/150) fix(easy): 상단바·라이브러리·오른쪽 결과 칸 <sub>쉽게 모드 · 라이브러리 · 작업 화면 · +255 / −86</sub>
- [#151](https://github.com/junginsu-make/fixup-image-agent/pull/151) feat(easy): 끌 수 있는 구분선 · 채팅다운 화면 <sub>쉽게 모드 · +414 / −20</sub>

</details>

<a id="w-2026-09-21"></a>

## 9월 21일 ~ 9월 27일 · 이름을 FormWith 로 바꾸고 크레딧·구독 체계를 세운 주

서비스 이름이 MCS 에서 FormWith 로 바뀌고, 구독·구매·만료가 있는 크레딧 장부가 전 회원에게 적용됐습니다.

- 쉽게 모드를 다른 도구와 같은 화면 틀에 넣고, 대화의 결과를 한 칸에 모았습니다.
- 사용 설명서를 로그인 없이도 볼 수 있게 했습니다.
- 9월 22일 상세페이지·리디자인 통합 개선(설계 122건)을 한 번에 반영했습니다.
- 크레딧 장부에 구독·구매·만료를 넣고, 비용이 새던 자리 넷을 막았습니다.
- 관리자 화면을 회원 관리·시스템 관리·비용 전략 탭으로 정리했습니다.
- 계정 화면에 이름·추천인·사용 기록을 더하고, 회원이 직접 탈퇴할 수 있게 했습니다.
- 로그인 화면이 다른 사람의 세션으로 들여보내던 문제를 고쳤습니다.

<details><summary>이 주의 작업 묶음 39개</summary>


**9/21**

- [#152](https://github.com/junginsu-make/fixup-image-agent/pull/152) fix(easy): 커서·모달·모델 목록을 고치고, 단가표를 공식 문서로 대조한다 <sub>쉽게 모드 · +393 / −112</sub>
- [#153](https://github.com/junginsu-make/fixup-image-agent/pull/153) fix(easy): 다른 도구와 같은 셸 안으로 넣고, 결과 칸을 끝까지 편다 <sub>쉽게 모드 · +270 / −124</sub>
- [#154](https://github.com/junginsu-make/fixup-image-agent/pull/154) fix(easy): 대화 목록을 넓히고, 구분선을 둘로 만들고, 끌 수 있다고 보인다 <sub>쉽게 모드 · +398 / −69</sub>
- [#155](https://github.com/junginsu-make/fixup-image-agent/pull/155) feat(easy): 말도 받는 채팅으로 — 잠기던 버그를 고치고, 구분선을 보이게 한다 <sub>쉽게 모드 · +672 / −57</sub>
- [#156](https://github.com/junginsu-make/fixup-image-agent/pull/156) feat(easy): 기다리는 표시에 움직임을 주고, 사이드바를 갈래로 묶는다 <sub>쉽게 모드 · 작업 화면 · +368 / −63</sub>
- [#157](https://github.com/junginsu-make/fixup-image-agent/pull/157) fix(ui): 아래 메뉴에도 NavLink 를 박는다 — CI 가 잡은 타입 구멍 <sub>작업 화면 · +7 / −3</sub>
- [#158](https://github.com/junginsu-make/fixup-image-agent/pull/158) fix(easy): 이미지 만들기가 운영에서 400 이던 것 — 세 번째 같은 함정 <sub>이미지 만들기 · 쉽게 모드 · +64 / −21</sub>
- [#159](https://github.com/junginsu-make/fixup-image-agent/pull/159) fix(easy): 대신 부르는 단계마다 다른 요청 식별자 — 400 다음의 409 <sub>쉽게 모드 · +171 / −7</sub>
- [#160](https://github.com/junginsu-make/fixup-image-agent/pull/160) feat(easy): 결과 칸이 이 대화의 결과를 다 모은다 <sub>쉽게 모드 · +160 / −79</sub>
- [#161](https://github.com/junginsu-make/fixup-image-agent/pull/161) feat(easy): 결과마다 만든 조건을 적고, 대화 속 이미지를 줄인다 <sub>쉽게 모드 · +329 / −27</sub>
- [#162](https://github.com/junginsu-make/fixup-image-agent/pull/162) feat(easy): 비율과 그림체를 한 번 물어본다 — 막지는 않는다 <sub>쉽게 모드 · +541 / −38</sub>
- [#163](https://github.com/junginsu-make/fixup-image-agent/pull/163) docs(guide): 틀린 안내를 고치고, 부르는 이름을 사이드바와 맞춘다 <sub>설명서·도우미 · 작업 화면 · +364 / −88</sub>
- [#164](https://github.com/junginsu-make/fixup-image-agent/pull/164) feat(guide): 설명서는 로그인 없이도 열린다 <sub>회원·로그인 · 설명서·도우미 · +105 / −7</sub>
- [#165](https://github.com/junginsu-make/fixup-image-agent/pull/165) fix(landing): 공개 홈의 차감 숫자를 실제와 맞춘다 <sub>첫 화면 · +122 / −13</sub>

**9/22**

- [#166](https://github.com/junginsu-make/fixup-image-agent/pull/166) 상세페이지·리디자인 통합 개선 (설계 §14 122건 + 감사 9건) <sub>상세페이지 · 리디자인 · +41,897 / −1,114</sub>
- [#168](https://github.com/junginsu-make/fixup-image-agent/pull/168) 서비스 이름을 MCS 에서 FormWith 로 바꾼다 <sub>기타 · +228 / −60</sub>
- [#169](https://github.com/junginsu-make/fixup-image-agent/pull/169) 크레딧 장부 — 구독·구매·만료, 그리고 새던 자리 넷 <sub>크레딧·비용 · +6,622 / −140</sub>
- [#170](https://github.com/junginsu-make/fixup-image-agent/pull/170) feat(credit): 전 회원 크레딧 장부 적용 + 최고 관리자 무제한 <sub>크레딧·비용 · 회원·로그인 · 관리자 · +693 / −58</sub>
- [#171](https://github.com/junginsu-make/fixup-image-agent/pull/171) feat(cost-lab): 월 구독 플랜 기본값과 와디즈 상품 전략 <sub>크레딧·비용 · +1,004 / −43</sub>
- [#172](https://github.com/junginsu-make/fixup-image-agent/pull/172) fix(easy): 직접 첨부가 올리자마자 거절되던 것을 고친다 <sub>이미지 만들기 · 쉽게 모드 · +78 / −10</sub>
- [#173](https://github.com/junginsu-make/fixup-image-agent/pull/173) feat(admin): 회원 관리·시스템 관리·비용 전략실 탭 <sub>광고 규격 · 크레딧·비용 · 회원·로그인 · 관리자 · +1,672 / −744</sub>
- [#174](https://github.com/junginsu-make/fixup-image-agent/pull/174) fix(team): 혼자인 팀장 빼기 오류 수정 + 팀 기능 숨김 <sub>팀 · +574 / −122</sub>
- [#175](https://github.com/junginsu-make/fixup-image-agent/pull/175) feat(sns): 카드뉴스 01 웹 주소 숨김 + 고르는 칸을 카드로 <sub>카드뉴스 · +250 / −27</sub>
- [#176](https://github.com/junginsu-make/fixup-image-agent/pull/176) fix(pdp): 기획 대기 화면에 실제 단계를 보이고, 3단계 시작 안내와 아이콘 정리 <sub>상세페이지 · +2,243 / −82</sub>
- [#177](https://github.com/junginsu-make/fixup-image-agent/pull/177) feat(account): 이름·추천인 + 계정 화면 개편 + 관리자 비밀번호 관리 <sub>회원·로그인 · 관리자 · +991 / −510</sub>
- [#178](https://github.com/junginsu-make/fixup-image-agent/pull/178) feat(account): 계정 화면 사용 기록 + 빈 여백 정리 <sub>회원·로그인 · +404 / −12</sub>
- [#179](https://github.com/junginsu-make/fixup-image-agent/pull/179) feat(easy): 채팅 글자 키움 · AI 표식 로봇 캐릭터 · 칸 사이 선 옅게 <sub>캐릭터 · 쉽게 모드 · +90 / −30</sub>
- [#180](https://github.com/junginsu-make/fixup-image-agent/pull/180) feat(library): 작업물을 만든 기능으로 거른다 <sub>라이브러리 · +507 / −44</sub>
- [#181](https://github.com/junginsu-make/fixup-image-agent/pull/181) fix: 리디자인 대기 화면의 지어낸 값, 추천코드 표기, 관리자 상세를 그 자리에서 <sub>리디자인 · 관리자 · +1,345 / −93</sub>

**9/23**

- [#182](https://github.com/junginsu-make/fixup-image-agent/pull/182) feat(cost-lab): 크레딧도 고칠 수 있게 하고, 만들 수 있는 양이 따라오게 한다 <sub>크레딧·비용 · +184 / −12</sub>
- [#183](https://github.com/junginsu-make/fixup-image-agent/pull/183) fix(auth): 로그인 화면이 남의 세션으로 조용히 들여보내던 것과 로그인 유지 24시간 <sub>회원·로그인 · +312 / −1</sub>
- [#184](https://github.com/junginsu-make/fixup-image-agent/pull/184) fix(pdp): 편집 화면 겹침·이미지 밑 설명 줄·라이브러리 저장 실패 + 내려받기 정리 <sub>상세페이지 · 라이브러리 · +1,298 / −404</sub>
- [#185](https://github.com/junginsu-make/fixup-image-agent/pull/185) feat(cost-lab): 비용 전략으로 이름 바꾸고, 저장하면 실제 구독 플랜이 되게 한다 <sub>크레딧·비용 · +900 / −53</sub>
- [#186](https://github.com/junginsu-make/fixup-image-agent/pull/186) feat(easy): 라이브러리를 입력창에서도 열고, 첫 메시지 전까지 선택 화면을 남긴다 <sub>쉽게 모드 · 라이브러리 · +156 / −65</sub>
- [#187](https://github.com/junginsu-make/fixup-image-agent/pull/187) fix(redesign): 크레딧 전환 회원 차단·첨부·결과 화면 검수 <sub>이미지 만들기 · 리디자인 · 크레딧·비용 · 회원·로그인 · +664 / −78</sub>
- [#188](https://github.com/junginsu-make/fixup-image-agent/pull/188) fix(poster): 광고 규격을 못 덮던 비율 다섯을 키운다 <sub>이미지 만들기 · 광고 규격 · +492 / −19</sub>
- [#189](https://github.com/junginsu-make/fixup-image-agent/pull/189) feat(settings): 회원이 스스로 탈퇴할 수 있게 한다 <sub>회원·로그인 · +2,062 / −2</sub>
- [#190](https://github.com/junginsu-make/fixup-image-agent/pull/190) chore(cost-lab): 비율을 키운 만큼 비용 번들을 다시 굽는다 <sub>크레딧·비용 · +1 / −1</sub>
- [#191](https://github.com/junginsu-make/fixup-image-agent/pull/191) fix(redesign): 「1080×1920」을 정말 1080×1920 으로 <sub>리디자인 · +223 / −5</sub>

</details>

<a id="w-2026-09-28"></a>

## 9월 28일 ~ 10월 4일 · 출시를 앞두고 도우미·약관·보안·서버를 다진 주

사람이 몰려도 버티도록 서버를 다지고, 비용이 새지 않게 AI 사용을 통제하고, 간편가입을 열었습니다.

- 설명서를 근거로 사용법을 답하는 AI 도우미를 붙였습니다.
- 약관과 개인정보 처리방침을 실제 사업자 정보와 위탁 업체로 채웠습니다.
- 만든 그림 파일 안에 「AI 생성」 표시를 적습니다.
- 「100명 대비」 작업으로 메모리 상한, 그림 대기열, 그림 서비스 계정 여러 개 돌려 쓰기, 빠른 로그인 확인을 넣었습니다.
- 크레딧이 없거나 운영자가 멈추면 돈 드는 AI 를 막고, 호출마다 비용을 적어 관리자 화면에서 봅니다.
- Google·카카오 간편가입과 전화번호(선택) 입력을 열었습니다.
- 쉽게 모드의 채팅에서 카드뉴스를 만들고 손볼 수 있게 했습니다.
- 남의 그림 위치를 쓰는 길 같은 보안 구멍과 크레딧 우회 길을 막았습니다.

<details><summary>이 주의 작업 묶음 60개</summary>


**9/28**

- [#192](https://github.com/junginsu-make/fixup-image-agent/pull/192) feat(cs): 사용 방법을 답하는 AI 도우미 — 설명서 근거·내 계정·문의 채널 <sub>설명서·도우미 · +5,040 / −9</sub>
- [#193](https://github.com/junginsu-make/fixup-image-agent/pull/193) fix(cs): 설명서 색인 스크립트가 실제로 돌게 한다 <sub>설명서·도우미 · +83 / −3</sub>
- [#194](https://github.com/junginsu-make/fixup-image-agent/pull/194) fix(credit): 예약 함수 중복 장애 + CS 2단계 문서 셋 <sub>크레딧·비용 · +1,545 / −8</sub>
- [#195](https://github.com/junginsu-make/fixup-image-agent/pull/195) fix(cs): 새 설명서가 봇에 안 들어가던 것과, 묻는 말투 <sub>설명서·도우미 · +145 / −0</sub>
- [#196](https://github.com/junginsu-make/fixup-image-agent/pull/196) feat(cs): 못 답하면 메일 주소까지 정확히 안내한다 <sub>설명서·도우미 · +222 / −16</sub>
- [#197](https://github.com/junginsu-make/fixup-image-agent/pull/197) docs(guide): 환불·해지 기준을 정한 대로 적는다 <sub>설명서·도우미 · +90 / −7</sub>
- [#198](https://github.com/junginsu-make/fixup-image-agent/pull/198) feat(pdp): 상세페이지 결과를 서버가 계정 라이브러리 한 작업에 맞춰 둔다 <sub>상세페이지 · 라이브러리 · +2,550 / −30</sub>
- [#199](https://github.com/junginsu-make/fixup-image-agent/pull/199) docs(legal): 약관을 구독·환불 기준에 맞추고 남아 있던 옛 이름을 고친다 <sub>크레딧·비용 · 약관 · +306 / −10</sub>
- [#200](https://github.com/junginsu-make/fixup-image-agent/pull/200) docs(legal): 원본 폴더를 게시본과 맞춘다 <sub>약관 · +10 / −9</sub>
- [#201](https://github.com/junginsu-make/fixup-image-agent/pull/201) docs(legal): 사업자 정보를 실제 값으로 채운다 <sub>약관 · +61 / −18</sub>
- [#202](https://github.com/junginsu-make/fixup-image-agent/pull/202) docs(legal): 처리방침의 위탁·국외이전을 실제 업체로 채운다 <sub>약관 · +238 / −1</sub>
- [#203](https://github.com/junginsu-make/fixup-image-agent/pull/203) feat(cs): 화면을 옮겨도 대화가 남고, 입력칸이 줄을 늘린다 <sub>설명서·도우미 · +635 / −17</sub>

**9/29**

- [#204](https://github.com/junginsu-make/fixup-image-agent/pull/204) fix(reference): 참고 이미지는 올린 사람만 본다 <sub>보안 · 라이브러리 · +696 / −209</sub>
- [#205](https://github.com/junginsu-make/fixup-image-agent/pull/205) fix(auth): guide existing members and correct signup failure messages <sub>회원·로그인 · 설명서·도우미 · +150 / −42</sub>
- [#206](https://github.com/junginsu-make/fixup-image-agent/pull/206) fix(auth): remove unused demo link from auth screens <sub>회원·로그인 · +0 / −4</sub>
- [#207](https://github.com/junginsu-make/fixup-image-agent/pull/207) fix(landing): restore native wheel scrolling below hero <sub>첫 화면 · +0 / −4</sub>
- [#208](https://github.com/junginsu-make/fixup-image-agent/pull/208) fix(landing): keep legal modal wheel input inside overlay <sub>첫 화면 · 약관 · +2 / −0</sub>
- [#209](https://github.com/junginsu-make/fixup-image-agent/pull/209) fix(legal): 게시 문서의 빈칸·초안 표시 제거, 가입 동의·탈퇴 안내·문의 주소 정리 <sub>회원·로그인 · 약관 · +646 / −13</sub>
- [#210](https://github.com/junginsu-make/fixup-image-agent/pull/210) fix(admin): restore credit grants and subscription actions on HTTP <sub>광고 규격 · 크레딧·비용 · 관리자 · +178 / −43</sub>
- [#211](https://github.com/junginsu-make/fixup-image-agent/pull/211) feat: AI 생성 표시를 파일 안에 적는다 (EXIF) <sub>약관 · +1,871 / −34</sub>
- [#212](https://github.com/junginsu-make/fixup-image-agent/pull/212) docs(legal): 위탁·국외이전 표에 업체 계약 법인명과 개인정보 연락처 추가 <sub>약관 · +73 / −8</sub>
- [#213](https://github.com/junginsu-make/fixup-image-agent/pull/213) fix(admin): compact credit grant controls into one desktop row <sub>광고 규격 · 크레딧·비용 · 관리자 · +11 / −11</sub>
- [#214](https://github.com/junginsu-make/fixup-image-agent/pull/214) docs(guide): 사용 설명서를 지금 시스템과 맞춘다 <sub>설명서·도우미 · +802 / −380</sub>
- [#215](https://github.com/junginsu-make/fixup-image-agent/pull/215) fix: 탈퇴 뒤 로그아웃, 24시간 재로그인, 「그대로 생성」 만들기 단추, 비율 이름, 약관 기산일 <sub>회원·로그인 · 약관 · +722 / −58</sub>
- [#216](https://github.com/junginsu-make/fixup-image-agent/pull/216) fix(studio): 완료된 작업에서 단계 막대로 04·05 를 오간다 <sub>작업 화면 · +302 / −32</sub>
- [#217](https://github.com/junginsu-make/fixup-image-agent/pull/217) fix(shell): 상단바의 「이용 안내」 단추를 뺀다 <sub>작업 화면 · +25 / −26</sub>
- [#218](https://github.com/junginsu-make/fixup-image-agent/pull/218) fix(poster): 「이 장만 고치기」에 적은 말이 반영되게 하고, 고친 결과를 제자리·제 이름으로 <sub>이미지 만들기 · +1,504 / −50</sub>
- [#219](https://github.com/junginsu-make/fixup-image-agent/pull/219) chore(cost-lab): 포스터 패키지가 늘어 비용 화면 번들을 다시 만든다 <sub>이미지 만들기 · 크레딧·비용 · +19 / −19</sub>
- [#220](https://github.com/junginsu-make/fixup-image-agent/pull/220) fix(poster,ad,admin): 고치기 뒤 남은 여섯 — 광고 소재 그림·회차 이름·고치기 견적·모델·관리자 복사·옛 주소 <sub>이미지 만들기 · 광고 규격 · 관리자 · +907 / −152</sub>
- [#221](https://github.com/junginsu-make/fixup-image-agent/pull/221) feat(deploy): 100명 대비 S0·S1 — 메모리 상한, Caddy 정적 파일, 장애 메일, 안전한 서버 설정 바꾸기 <sub>배포·서버 · +8,584 / −28</sub>
- [#222](https://github.com/junginsu-make/fixup-image-agent/pull/222) fix: 관리자 원가 화면을 실제 모델로 맞추고, 고치기·팀·복사에 남은 구멍을 막는다 <sub>관리자 · 팀 · +785 / −45</sub>

**9/30**

- [#223](https://github.com/junginsu-make/fixup-image-agent/pull/223) feat(credit): 재시작 때 묶인 동기 생성 예약을 정리한다 (100명 대비 S1.5) <sub>크레딧·비용 · 배포·서버 · +574 / −1</sub>
- [#224](https://github.com/junginsu-make/fixup-image-agent/pull/224) fix(deps): 오늘 공개된 high 취약점 둘을 막는다 (undici, nodemailer) <sub>보안 · +18 / −27</sub>
- [#225](https://github.com/junginsu-make/fixup-image-agent/pull/225) feat(credit): 크레딧이 없거나 AI 를 멈추면 비용 드는 AI 를 막는다 (AI 사용 통제 C1·C2) <sub>크레딧·비용 · +4,616 / −83</sub>
- [#226](https://github.com/junginsu-make/fixup-image-agent/pull/226) feat(landing): 비회원은 회원가입 안내로, /demo 삭제, 로그인 뒤 열린 리다이렉트 막기 (AI 사용 통제 C5) <sub>회원·로그인 · 보안 · 첫 화면 · +1,679 / −124</sub>

**10/1**

- [#227](https://github.com/junginsu-make/fixup-image-agent/pull/227) feat(ai-control): AI 비용을 호출마다 기록하고, 관리자 화면에 한국 시각 비용과 전체 멈춤 스위치 (C3·C4) <sub>크레딧·비용 · 관리자 · +6,603 / −56</sub>
- [#228](https://github.com/junginsu-make/fixup-image-agent/pull/228) test(cost-forecast): 날짜에 따라 깨지던 두 시험의 시작 달을 못 박는다 <sub>크레딧·비용 · +3 / −2</sub>
- [#229](https://github.com/junginsu-make/fixup-image-agent/pull/229) feat(legal): 권리침해 신고 창구와 업로드 권리 안내 <sub>약관 · +333 / −10</sub>
- [#230](https://github.com/junginsu-make/fixup-image-agent/pull/230) perf(auth): 로그인 확인을 서버가 직접 — getUser 왕복을 getClaims 로 (100명 대비 S2) <sub>회원·로그인 · 배포·서버 · +3,021 / −98</sub>
- [#231](https://github.com/junginsu-make/fixup-image-agent/pull/231) feat(easy): 쉽게 채팅에서 카드뉴스 만들기·손보기 (2·3단계) <sub>카드뉴스 · 쉽게 모드 · +15,306 / −132</sub>
- [#232](https://github.com/junginsu-make/fixup-image-agent/pull/232) fix(easy): 쉽게 첨부 자리에도 권리 안내 한 줄 <sub>이미지 만들기 · 쉽게 모드 · 약관 · +5 / −8</sub>
- [#233](https://github.com/junginsu-make/fixup-image-agent/pull/233) fix(easy): 카드뉴스 단추가 운영자 멈춤 안내를 그대로 전한다 <sub>카드뉴스 · 쉽게 모드 · +17 / −2</sub>
- [#234](https://github.com/junginsu-make/fixup-image-agent/pull/234) feat(fal): 100명 대비 S3a — 상세페이지·캐릭터·리디자인 그림을 대기열로 <sub>상세페이지 · 리디자인 · 캐릭터 · 배포·서버 · +8,499 / −128</sub>
- [#235](https://github.com/junginsu-make/fixup-image-agent/pull/235) feat(header): 「레퍼런스 찾기」를 「아이디어 발굴」 안내 창으로 바꾼다 <sub>첫 화면 · 라이브러리 · +199 / −37</sub>
- [#236](https://github.com/junginsu-make/fixup-image-agent/pull/236) feat(auth): Google 간편가입과 관리자 수동 크레딧 지급 <sub>크레딧·비용 · 회원·로그인 · 관리자 · +1,431 / −36</sub>
- [#237](https://github.com/junginsu-make/fixup-image-agent/pull/237) feat(fal-pool): 100명 대비 S3b — fal 계정 풀과 관리자 「fal 계정」 <sub>관리자 · 배포·서버 · +6,165 / −118</sub>

**10/2**

- [#238](https://github.com/junginsu-make/fixup-image-agent/pull/238) ci: 검사가 통과해야 릴리스가 나온다 <sub>배포·서버 · +38 / −10</sub>
- [#239](https://github.com/junginsu-make/fixup-image-agent/pull/239) docs(deploy): 검사 뒤 빌드와 master 보호를 적는다 <sub>배포·서버 · +4 / −0</sub>
- [#240](https://github.com/junginsu-make/fixup-image-agent/pull/240) docs(legal): 처리방침의 Supabase 저장 위치를 실제대로 일본(도쿄)로 <sub>약관 · +9 / −10</sub>
- [#241](https://github.com/junginsu-make/fixup-image-agent/pull/241) fix(poster): 기획이 채운 글자를 그림에 싣는다 <sub>이미지 만들기 · +193 / −451</sub>
- [#242](https://github.com/junginsu-make/fixup-image-agent/pull/242) feat(admin): 회원 목록에 가입 방식 표시 <sub>광고 규격 · 회원·로그인 · 관리자 · +112 / −3</sub>
- [#243](https://github.com/junginsu-make/fixup-image-agent/pull/243) feat(auth): 간편가입(Google·카카오) 공개 준비 <sub>회원·로그인 · +75 / −11</sub>
- [#244](https://github.com/junginsu-make/fixup-image-agent/pull/244) feat(member): 휴대폰 또는 전화번호(선택) 추가 <sub>회원·로그인 · +1,076 / −29</sub>
- [#245](https://github.com/junginsu-make/fixup-image-agent/pull/245) fix: fal 요청 복구·배포 롤백·준비 검사 3건 개선 <sub>배포·서버 · +647 / −125</sub>
- [#246](https://github.com/junginsu-make/fixup-image-agent/pull/246) fix: 크레딧 잔액 동기화와 내 구독·구매 문의 연결 <sub>크레딧·비용 · +877 / −73</sub>
- [#247](https://github.com/junginsu-make/fixup-image-agent/pull/247) fix: 빈 회원 삭제 DB 설정 복구 및 삭제 확인 강화 <sub>회원·로그인 · +198 / −15</sub>

**10/3**

- [#248](https://github.com/junginsu-make/fixup-image-agent/pull/248) feat: 상세페이지·캐릭터 과정 보기(서버 저장)와 이미지 생성 400 수정 <sub>상세페이지 · 캐릭터 · 라이브러리 · +13,428 / −122</sub>
- [#249](https://github.com/junginsu-make/fixup-image-agent/pull/249) fix(security): 회원이 그림 저장 위치를 남의 것으로 바꿔 쓰는 길을 막는다 <sub>회원·로그인 · 보안 · +907 / −53</sub>
- [#250](https://github.com/junginsu-make/fixup-image-agent/pull/250) fix(security): 카드뉴스 「그대로 넣기」 원본을 웹 주소가 아니라 저장소 위치로 읽는다 <sub>카드뉴스 · 보안 · +224 / −8</sub>
- [#251](https://github.com/junginsu-make/fixup-image-agent/pull/251) fix(credit): 옛 예약 함수 reserve_generation 은 언제나 거절한다 — 크레딧 우회를 막는다 <sub>크레딧·비용 · 보안 · +166 / −5</sub>

</details>

<a id="w-2026-10-05"></a>

## 10월 5일 ~ 10월 11일 · 운영을 들여다보는 눈을 단 주

누가 어떻게 찾아와 무엇을 쓰는지 보는 방문 분석과, 검색 사이트 등록 준비가 들어왔습니다.

- 조금 작은 옛 그림도 1.2배까지 늘려 광고 규격을 뽑습니다.
- 로그인 뒤 돌아갈 주소를 악용해 바깥 사이트로 보내지 못하게 막았습니다.
- 쉽게 모드에서 만든 이미지를 이어서 고칠 수 있습니다.
- 관리자 「방문 분석」 탭과 쿠키 동의 띠를 열었습니다.
- 캐릭터 묘사를 AI 가 정리하고, 내 캐릭터를 다른 화풍·체형으로 바꿉니다.
- 네이버·구글·다음 검색 등록을 위한 검색 정보(사이트 지도 등)를 넣었습니다. 검색 사이트별 확인 값은 아직 넣기 전입니다.
- 네이버 서치어드바이저 등록을 위한 확인 값을 사이트에 넣었습니다.
- 그림을 다루는 부품에 오늘 알려진 보안 문제가 있어 고친 판으로 바꿨습니다.
- 개발 일지를 저장소에 남기고, 운영에 배포할 때마다 일지에 적는 규칙을 만들었습니다.

**운영 배포 1회**

- 10/7 `20261007T025711Z-f5109ea8` · [#259](https://github.com/junginsu-make/fixup-image-agent/pull/259), [#260](https://github.com/junginsu-make/fixup-image-agent/pull/260), [#261](https://github.com/junginsu-make/fixup-image-agent/pull/261)

<details><summary>이 주의 작업 묶음 10개</summary>


**10/6**

- [#252](https://github.com/junginsu-make/fixup-image-agent/pull/252) fix(ad): 조금 작은 옛 그림도 1.2배까지 늘려 광고 규격을 뽑는다 <sub>광고 규격 · +74 / −24</sub>
- [#253](https://github.com/junginsu-make/fixup-image-agent/pull/253) fix(auth): 돌아갈 주소에 섞인 제어문자·점 경로로 바깥 사이트에 보내지 않는다 <sub>회원·로그인 · 보안 · +111 / −4</sub>
- [#254](https://github.com/junginsu-make/fixup-image-agent/pull/254) feat(easy): 만든 이미지를 이어서 고친다 — 「무엇을 만들어 드릴까요?」 되풀이를 고친다 <sub>쉽게 모드 · +1,078 / −12</sub>
- [#255](https://github.com/junginsu-make/fixup-image-agent/pull/255) feat(analytics): 관리자 「방문 분석」 탭과 쿠키 동의 방식 방문 통계 <sub>방문 분석 · 관리자 · +7,189 / −10</sub>
- [#256](https://github.com/junginsu-make/fixup-image-agent/pull/256) fix(analytics): 동의 띠가 「맨 위로」 단추에 가려 거부를 못 누르던 것 <sub>방문 분석 · +42 / −1</sub>
- [#257](https://github.com/junginsu-make/fixup-image-agent/pull/257) feat(character): 묘사를 LLM 이 정리하고, 내 캐릭터를 레퍼런스 화풍·체형으로 바꾼다 <sub>캐릭터 · 라이브러리 · +2,874 / −58</sub>
- [#258](https://github.com/junginsu-make/fixup-image-agent/pull/258) feat(seo): 검색 서비스 등록용 검색 정보 — robots·사이트 지도·화면별 설명·대표 주소·구조화 데이터 <sub>검색 노출 · +2,012 / −32</sub>

**10/7**

- [#259](https://github.com/junginsu-make/fixup-image-agent/pull/259) docs: 개발 일지와 README 정비, 운영 배포마다 일지에 적는 규칙 <sub>배포·서버 · +1,874 / −62 · 운영 반영 10/7</sub>
- [#260](https://github.com/junginsu-make/fixup-image-agent/pull/260) feat(seo): 네이버 서치어드바이저 소유 확인 값 <sub>검색 노출 · +6 / −1 · 운영 반영 10/7</sub>
- [#261](https://github.com/junginsu-make/fixup-image-agent/pull/261) fix(deps): sharp 를 0.35.5 로 올린다 — 릴리스 감사가 막힌다 <sub>보안 · 배포·서버 · +125 / −125 · 운영 반영 10/7</sub>

</details>

---

자료: GitHub 저장소의 기록을 10월 7일에 모았습니다. 날짜는 한국 시각, 한 주는 월요일부터입니다. 배포 꾸러미는 만들어진 수이며 실제로 운영에 올린 횟수와 다릅니다.

다시 만들기: 저장소 맨 위에서 `python -X utf8 docs/devlog/build.py` (GitHub CLI 로그인 필요). 주 제목·요약은 `weeks.json`, 운영 배포 기록은 `entries/` 에 적습니다.
