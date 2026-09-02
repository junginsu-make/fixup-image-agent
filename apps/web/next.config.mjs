import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const buildStandalone = process.env.NEXT_STANDALONE === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(buildStandalone
    ? {
        output: "standalone",
        // 범위가 apps/web에 갇히면 workspace 패키지가 빠진다.
        outputFileTracingRoot: path.join(webRoot, "../.."),
      }
    : {}),
  // 최상단(/) 은 이전 정적 랜딩(public/landing.html, 플럼 + 레퍼런스 샘플)을 보여준다.
  // beforeFiles 라 app/page.tsx 보다 먼저 적용된다. 회원 셸/데모/인증은 그대로 둔다.
  async rewrites() {
    return {
      beforeFiles: [{ source: "/", destination: "/landing.html" }],
    };
  },
  // 워크스페이스 패키지(보존된 백엔드 + 공통 UI)를 Next가 트랜스파일하도록 지정
  transpilePackages: [
    "@fixup/pdp-core",
    "@fixup/redesign-core",
    "@fixup/shared",
    "@fixup/ui",
  ],
  // 수집 어댑터 중 커뮤니티 크롤러가 playwright 를 쓴다. 번들에 넣으려 하면
  // chromium-bidi 를 못 찾아 빌드가 깨진다. 서버에서 그대로 require 하게 둔다.
  serverExternalPackages: ["playwright", "playwright-core"],
  webpack: (config) => {
    // 이식한 코어가 ESM 관례대로 상대 import에 .js 확장자를 쓴다(소스는 .ts).
    // webpack이 .js 지정자를 .ts로도 해석하도록 매핑한다(typecheck는 bundler 해석으로 이미 통과).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
