import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider, Toaster } from "@fixup/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PDP STUDIO",
    template: "%s — PDP STUDIO",
  },
  description:
    "상품 사진으로 상세페이지를 새로 만들거나, 기존 상세페이지를 리디자인하는 AI 통합 스튜디오",
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
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
