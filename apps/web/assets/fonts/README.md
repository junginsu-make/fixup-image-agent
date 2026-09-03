# 동봉 서체

레이아웃 고정 카드뉴스의 글자는 **서버에서 직접 그린다**(`lib/layout/compose.ts`).
운영 서버(Ubuntu)에 깔린 한글 폰트는 fallback 하나뿐이라 서체를 고를 수 없어,
쓸 서체를 릴리스에 함께 담는다.

| 파일 | 서체 | 굵기 | 라이선스 |
|---|---|---|---|
| `Pretendard-Regular.otf` | Pretendard v1.3.9 | 400 | SIL OFL 1.1 (`OFL.txt`) |
| `Pretendard-Bold.otf` | Pretendard v1.3.9 | 700 | SIL OFL 1.1 (`OFL.txt`) |

woff2 가 아니라 **otf** 여야 한다. Pango·fontconfig 는 woff2 를 읽지 못한다.

## 파일 이름 규칙

`lib/layout/fonts.ts` 가 `{family}-{Regular|Bold}.{otf|ttf}` 로 찾는다.
`TextStyle.family` 가 `Pretendard` 면 위 두 파일을 찾는다. 다른 서체를 더하려면
같은 규칙으로 파일을 두고 `family` 를 그 이름으로 쓰면 된다.

## 없으면 어떻게 되나

카드는 나온다. fontconfig 가 고른 기본 서체로 그리고, 화면에
「글꼴 파일을 찾지 못했습니다」를 알린다. 조용히 다른 서체로 바뀌지는 않는다.

## 배포

`scripts/prepare-ec2-release.mjs` 가 `public` 을 복사하듯 이 폴더를 복사한다.
서버 쪽 설정 두 줄은 `deploy/ec2/fixup-image-agent.service` 에 있다 —
`FONTCONFIG_FILE` 과 `XDG_CACHE_HOME`.
