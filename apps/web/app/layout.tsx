import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider, Toaster } from "@fixup/ui";
import { ImageViewerHost } from "./_components/image-viewer";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PDP STUDIO",
    template: "%s — PDP STUDIO",
  },
  description:
    "카드뉴스·포스터·상세페이지를 한 곳에서 만드는 AI 콘텐츠 스튜디오",
  applicationName: "PDP STUDIO",
  manifest: "/site.webmanifest",
  appleWebApp: { title: "PDP STUDIO" },
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
