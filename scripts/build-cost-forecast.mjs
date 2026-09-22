import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "apps/web/app/admin/cost-lab");
const entry = path.join(root, "apps/web/lib/admin/cost-forecast/browser-entry.ts");
const result = await build({ entryPoints: [entry], bundle: true, write: false, format: "iife", globalName: "FormWithForecast", platform: "browser", target: "es2022", minify: true, legalComments: "none", metafile: true });
if (Object.keys(result.metafile.inputs).some(p => /server-only|supabase\/admin|server-keys|node:/.test(p))) throw new Error("예측 번들에 서버 의존성이 들어왔습니다.");
// Zod's generated validation templates contain whitespace-only lines even after minification.
const engine = result.outputFiles[0].text.replace(/^[\t ]+$/gm, "").replace(/<\/script/gi, "<\\/script");
const sandbox = { structuredClone, TextEncoder, Date, console };
vm.createContext(sandbox); vm.runInContext(engine, sandbox);
const models = sandbox.FormWithForecast.legacyModels(sandbox.FormWithForecast.CURRENT_CATALOG);
const [ui, markup, css, plansUi] = await Promise.all(["forecast-ui.js", "forecast-panel.html", "forecast.css", "plans-ui.js"].map(async file => (await readFile(path.join(dir, "source", file), "utf8")).replace(/\r\n/g, "\n")));
const generated = (name, content) => `<!-- ${name}:start -->\n${content}\n<!-- ${name}:end -->`;
const replaceBlock = (html, name, content) => {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error(`생성 영역이 없습니다: ${name}`);
  return html.slice(0, a) + generated(name, content) + html.slice(b + end.length);
};
let stale = false;
for (const file of ["index.html", "prepaid.html"]) {
  const filename = path.join(dir, "assets", file), old = (await readFile(filename, "utf8")).replace(/\r\n/g, "\n");
  let html = old.replace(/const MODELS=\{[^\r\n]+?\};/g, `const MODELS=${JSON.stringify(models)};`);
  if (file === "index.html") {
    html = replaceBlock(html, "forecast-engine", `<script id="forecast-engine">\n${engine}\n</script>`);
    html = replaceBlock(html, "forecast-ui", `<script id="forecast-ui">\n${ui}\n</script>`);
    html = replaceBlock(html, "forecast-style", `<style id="forecast-style">\n${css}\n</style>`);
    html = replaceBlock(html, "forecast-panel", markup.trim());
    html = replaceBlock(html, "plans-ui", `<script id="plans-ui">
${plansUi}
</script>`);
  }
  if (html !== old) {
    if (process.argv.includes("--check")) { console.error(`재생성 필요: ${path.relative(root, filename)}`); stale = true; }
    else { await writeFile(filename, html, "utf8"); console.log(`생성: ${path.relative(root, filename)}`); }
  }
}
if (stale) process.exitCode = 1;
else console.log(`비용 예측 번들 ${result.outputFiles[0].contents.length} bytes · 단가 ${sandbox.FormWithForecast.CURRENT_CATALOG.version}`);
