import { defineConfig } from "vitest/config";
// Next preserves JSX for its own compiler. Component contract tests must execute it.
export default defineConfig({ oxc: { jsx: { runtime: "automatic" } } });
