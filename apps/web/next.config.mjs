import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.dirname(fileURLToPath(import.meta.url));
const buildStandalone = process.env.NEXT_STANDALONE === "1";

// dev 서버가 떠 있는데 build 를 돌리면 프로덕션 빌드가 .next 를 덮어써
// dev 청크가 사라진다(정적 파일 404). 빌드는 다른 폴더에 쌓는다.
const distDir = process.env.NEXT_DIST_DIR;

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(distDir ? { distDir } : {}),
  ...(buildStandalone
    ? {
        output: "standalone",
        // 범위가 apps/web에 갇히면 workspace 패키지가 빠진다.
        outputFileTracingRoot: path.join(webRoot, "../.."),
      }
    : {}),
  // 예전에는 최상단(/)이 정적 랜딩(public/landing.html)으로 넘어갔다. 뺐다 —
  // 문이 둘이면 하나는 반드시 낡는다. 실제로 그 랜딩은 상세페이지 두 가지만
  // 소개하고 카드뉴스·포스터·수집을 한 번도 말하지 않았다.
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
