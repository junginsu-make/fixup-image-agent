import { defineConfig } from "vitest/config";

// Next의 jsx:preserve를 시험 러너에서만 변환한다. 화면의 실제 hook 상태 전이를 검사한다.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
});
