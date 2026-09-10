import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider, Toaster } from "@fixup/ui";
import { ImageViewerHost } from "./_components/image-viewer";
/*
  글꼴을 여기서 부른다.

  `packages/ui` 의 `--font-sans` 는 `"Pretendard"` 를 맨 앞에 적어 두고도
  그것을 **불러오지 않았다** — 깔려 있는 사람만 보고 나머지는 맑은 고딕으로
  떨어졌다. 자세한 사정은 `pretendard.css` 머리말에 적었다.

  `globals.css` 보다 먼저 부른다. 뒤에 부르면 Tailwind 의 preflight 가 뒤에
  와서 순서가 헷갈린다 — @font-face 는 선언 순서와 무관하지만, 읽는 사람에게
  「글꼴을 먼저 정하고 그 위에 스타일」로 보이는 편이 낫다.
*/
import "./pretendard.css";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://54.180.68.212";
const DESCRIPTION = "레퍼런스 한 장이면 같은 결의 이미지가 나옵니다. 카드뉴스·광고 소재·포스터·상세페이지·캐릭터를 한 곳에서.";

export const metadata: Metadata = {
  /*
    **주소를 못 박아 둔다.** 없으면 아래 이미지 경로가 상대 주소로 나가고,
    카카오톡·슬랙 같은 곳은 그것을 못 읽는다.
  */
  metadataBase: new URL(SITE_URL),
  title: {
    default: "MCS",
    template: "%s — MCS",
  },
  description: DESCRIPTION,
  applicationName: "MCS",
  manifest: "/site.webmanifest",
  appleWebApp: { title: "MCS" },

  /*
    링크를 붙였을 때 뜨는 미리보기.

    **안 정해 두면 긁는 쪽이 아무 그림이나 고른다.** 실제로 카카오톡이 첫 화면
    맨 앞의 「넣은 것」(골프 레퍼런스)을 집어 갔다 — 우리가 만든 결과물이 아니라
    남의 사진을 우리 대문으로 내건 셈이었다.

    1200×630 은 이런 미리보기의 표준 규격이다. 세로로 긴 포스터를 그대로 걸면
    위아래가 잘린다.

    **그림을 바꾸면 파일 이름도 바꾼다.** 긁는 쪽은 페이지 정보와 이미지를
    따로 캐시한다. 같은 주소(`/og.png`)에 내용만 갈아 끼우면, 페이지 캐시를
    지워도 이미지는 저장해 둔 옛 파일이 계속 나온다. 2026-09-10 에 그림을 두 번
    바꿨는데 카카오톡에는 끝까지 첫 번째 것이 떴다. 주소가 달라지면 캐시가
    없으니 새로 받아 간다.
  */
  openGraph: {
    type: "website",
    siteName: "MCS",
    title: "MCS — Marketing Content Studio",
    description: DESCRIPTION,
    url: SITE_URL,
    locale: "ko_KR",
    images: [{ url: "/og-hero.png", width: 1200, height: 630, alt: "MCS 가 만든 결과물" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MCS — Marketing Content Studio",
    description: DESCRIPTION,
    images: ["/og-hero.png"],
  },
};

// 브랜드 규정색. 모바일 브라우저 주소창이 이 색을 쓴다.
// Next 15 는 themeColor 를 metadata 가 아니라 viewport 에서 받는다.
export const viewport: Viewport = {
  themeColor: "#08080A",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          {children}
          {/* 어느 화면에서 눌러도 같은 창이 뜨도록 한 곳에만 둔다. */}
          <ImageViewerHost />
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
