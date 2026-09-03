import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const webRoot = path.join(repoRoot, "apps", "web");
/**
 * 빌드 결과가 어디에 떨어졌는지. next.config.mjs 가 보는 값과 같아야 한다.
 *
 * 기본값과 다르게 두는 이유: 개발 서버가 `.next` 를 쓰고 있는 동안 그 위에
 * 빌드하면 개발 서버가 500 을 뱉는다. 배포용 빌드는
 * `NEXT_DIST_DIR=.next-release pnpm build` 로 따로 낸다.
 */
const distDirName = process.env.NEXT_DIST_DIR || ".next";
const buildRoot = path.join(webRoot, distDirName);
const standaloneSource = path.join(buildRoot, "standalone");
const releaseRoot = path.join(repoRoot, "dist", "ec2");

/** 워커를 묶을 때 빼는 것. 이유는 아래 bundleWorker 주석에 적었다. */
const EXTERNAL = ["playwright", "jsdom", "@mozilla/readability"];
/** 뺀 것 중 실제로 필요해서 따로 깔아 주는 것. */
const NEEDS_REAL_FILES = ["jsdom", "@mozilla/readability"];

if (!existsSync(standaloneSource)) {
  throw new Error("standalone build not found. Run `pnpm build` first.");
}

rmSync(releaseRoot, { recursive: true, force: true });
mkdirSync(releaseRoot, { recursive: true });

// verbatimSymlinks 로 링크를 그대로 옮긴 뒤 아래에서 상대 경로로 바꾼다.
// dereference 로 풀어버리면 안 된다 — pnpm 은 링크 구조 자체로 모듈을 해석해서,
// 실제 파일로 바꾸면 next 는 찾아도 그 옆의 styled-jsx 를 못 찾는다(실측).
cpSync(standaloneSource, releaseRoot, { recursive: true, verbatimSymlinks: true });

// 링크가 빌드 머신의 **절대 경로**를 가리키면 다른 기계에서 전부 깨진다.
// 실제로 그랬다 — CI 아티팩트를 EC2 에 배포하니 "Cannot find module 'next'" 로
// 죽고 롤백됐다(2026-07-28). 꾸러미 안을 가리키는 상대 경로로 바꾼다.
relativizeSymlinks(releaseRoot, standaloneSource);

const monorepoRuntimeRoot = path.join(releaseRoot, "apps", "web");
const runtimeRoot = existsSync(path.join(monorepoRuntimeRoot, "server.js"))
  ? monorepoRuntimeRoot
  : releaseRoot;

// A local Next build may have loaded .env.local. Runtime artifacts must never
// carry those files to EC2; server secrets come only from systemd EnvironmentFile.
for (const root of [releaseRoot, runtimeRoot]) {
  for (const envName of [".env", ".env.local", ".env.production", ".env.production.local"]) {
    rmSync(path.join(root, envName), { force: true });
  }
}

cpSync(path.join(webRoot, "public"), path.join(runtimeRoot, "public"), { recursive: true });
// standalone 안의 폴더 이름은 빌드 때 쓴 distDir 그대로다. static 도 같은
// 이름 밑에 둬야 standalone server.js 가 찾는다.
mkdirSync(path.join(runtimeRoot, distDirName), { recursive: true });
cpSync(path.join(buildRoot, "static"), path.join(runtimeRoot, distDirName, "static"), { recursive: true });

await bundleWorker();
placeSharpLibvips(releaseRoot);

// 링크가 하나라도 꾸러미 바깥을 가리키면 다른 기계에서 깨진다. 이 검사가
// 없어서 깨진 아티팩트가 운영 배포까지 갔다. 여기서 멈춘다.
assertSelfContained(releaseRoot);
assertSharpUsable(releaseRoot);

writeFileSync(
  path.join(releaseRoot, "RELEASE_INFO.json"),
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    runtimeEntry: path.relative(releaseRoot, path.join(runtimeRoot, "server.js")).replaceAll("\\", "/"),
  }, null, 2)}\n`,
  "utf8",
);

console.log(`EC2 runtime prepared: ${releaseRoot}`);
console.log(`Entry point: ${path.relative(releaseRoot, path.join(runtimeRoot, "server.js"))}`);

/**
 * 수집 워커를 파일 하나로 묶는다.
 *
 * Next 의 standalone 은 웹 앱만 담는다. 워커는 별도 꾸러미라 그대로면 서버에
 * 없다 — 실제로 `203/EXEC`(실행 파일 없음)로 죽었다. 서버에 pnpm 을 깔고
 * 작업 공간을 통째로 올리는 대신, 의존성까지 한 파일로 묶어 `node` 로 돌린다.
 *
 * **playwright 는 빼고 묶는다.** 브라우저 바이너리가 300MB 가 넘고 1GB 서버에서
 * Chromium 을 띄우면 웹까지 같이 죽는다. 공식 AI 블로그 수집 어댑터 하나만
 * 그걸 쓰는데, 그마저 실제로 긁을 때 동적으로 부른다. 그래서 빼도 나머지
 * 수집(유튜브·RSS·네이버·커뮤니티)은 그대로 돈다. 그 어댑터를 켜면 그
 * 소스만 "모듈 없음"으로 실패하고 다른 소스는 계속 돈다.
 *
 * **jsdom 과 readability 도 뺀다. 다만 이건 빼는 게 아니라 따로 깐다.**
 * 이 둘은 디스크에서 자기 파일을 읽는다(jsdom 은 기본 스타일시트를 연다).
 * 한 파일로 묶으면 그 파일이 옆에 없어 `__dirname` 에서 바로 죽는다.
 * RSS 를 포함해 거의 모든 어댑터가 쓰므로 없으면 수집이 아예 안 된다.
 */
async function bundleWorker() {
  const esbuild = await import("esbuild");
  const workerRoot = path.join(releaseRoot, "worker");
  mkdirSync(workerRoot, { recursive: true });

  await esbuild.build({
    entryPoints: [path.join(repoRoot, "apps", "worker", "src", "index.ts")],
    outfile: path.join(workerRoot, "worker.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: EXTERNAL,
    // esbuild 가 CommonJS 의존성을 ESM 으로 감쌀 때 require 를 남긴다.
    banner: { js: "import { createRequire as __cr } from 'node:module';const require = __cr(import.meta.url);" },
    logLevel: "warning",
  });

  // 자기 폴더에 자기 node_modules 를 둔다. 웹 쪽 node_modules 와 섞지 않는다.
  writeFileSync(
    path.join(workerRoot, "package.json"),
    `${JSON.stringify({ name: "fixup-worker-runtime", private: true, type: "module" }, null, 2)}\n`,
    "utf8",
  );

  const ingest = JSON.parse(
    readFileSync(path.join(repoRoot, "packages", "ingest-core", "package.json"), "utf8"),
  );
  // 저장소가 쓰는 판과 같은 것을 깐다. 여기서 판이 갈리면 로컬에서 되던 것이 서버에서 안 된다.
  const wanted = NEEDS_REAL_FILES
    .map((name) => `${name}@${ingest.dependencies[name].replace(/^[\^~]/, "")}`);

  const install = spawnSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", ...wanted], {
    cwd: workerRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (install.status !== 0) throw new Error("워커 의존성 설치에 실패했습니다.");

  console.log(`Worker bundled: worker/worker.mjs (+ ${NEEDS_REAL_FILES.join(", ")})`);
}

/**
 * libvips 를 sharp 바로 옆에 놓는다.
 *
 * `.node` 바인딩은 `$ORIGIN/../../sharp-libvips-<판>/lib` 에서 `.so` 를 찾는다.
 * 즉 **꾸러미 어딘가에 있는 것으로는 안 되고 그 자리에 있어야 한다.**
 *
 * pnpm 은 평소 그 자리에 심볼릭 링크를 둔다. 그런데 Next 의 추적은 그 링크를
 * 따라오지 않아, 파일은 꾸러미에 들어왔는데 옆자리는 비어 있었다. 그래서
 * 배포하고도 계속 이렇게 죽었다.
 *
 *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
 *
 * 링크 대신 실제로 복사한다. 링크는 꾸러미를 풀고 옮기는 과정에서 또 끊길 수
 * 있고, 여기서 한 번 더 틀리면 다시 운영에서야 안다.
 */
function placeSharpLibvips(root) {
  const pnpmRoot = path.join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpmRoot)) return;

  const entries = readdirSync(pnpmRoot);
  const libvipsDir = entries.find((name) => name.startsWith("@img+sharp-libvips-"));
  const bindingDir = entries.find((name) => /^@img\+sharp-(?!libvips)/.test(name));
  if (!libvipsDir || !bindingDir) return;

  const libvipsName = libvipsDir.slice("@img+".length).split("@")[0];
  const source = path.join(pnpmRoot, libvipsDir, "node_modules", "@img", libvipsName);
  const target = path.join(pnpmRoot, bindingDir, "node_modules", "@img", libvipsName);
  if (!existsSync(source) || existsSync(target)) return;

  cpSync(source, target, { recursive: true, dereference: true });
  console.log(`libvips placed beside the binding: ${path.relative(root, target)}`);
}

/**
 * sharp 가 서버에서 실제로 열릴 수 있는지 본다.
 *
 * `@img/sharp-linux-x64` 안의 `.node` 는 `libvips-cpp.so` 를 OS 수준에서 연다.
 * 자바스크립트 require 가 아니라 Next 의 추적에 안 잡히고, 그래서 그 `.so` 가
 * 통째로 빠진 채 배포됐다. 서버에서 이렇게 죽었다.
 *
 *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
 *
 * 죽는 자리가 API 안이라 Next 가 HTML 오류 페이지를 돌려주고, 화면은 그걸
 * JSON 으로 읽으려다 "Unexpected token '<'" 를 낸다. 원인과 증상이 멀어
 * 찾는 데 오래 걸린다. 배포 전에 여기서 멈춘다.
 *
 * 리눅스 꾸러미를 만들 때만 본다. 다른 판에서는 그 파일이 없는 게 맞다.
 */
function assertSharpUsable(root) {
  const pnpmRoot = path.join(root, "node_modules", ".pnpm");
  if (!existsSync(pnpmRoot) || process.platform !== "linux") return;

  const entries = readdirSync(pnpmRoot);
  const bindingDir = entries.find((name) => /^@img\+sharp-(?!libvips)/.test(name));
  if (!bindingDir) return;

  // 바인딩이 실제로 찾는 자리를 본다. "꾸러미 어딘가에 있다" 로는 부족하다 —
  // 실제로 파일은 있는데 옆자리가 비어서 운영에서 죽었다.
  const neighbours = path.join(pnpmRoot, bindingDir, "node_modules", "@img");
  const libvips = readdirSync(neighbours).find((name) => name.startsWith("sharp-libvips-"));
  const found = libvips
    && readdirSync(path.join(neighbours, libvips, "lib"))
      .find((name) => name.startsWith("libvips-cpp.so"));

  if (!found) {
    throw new Error(
      `sharp 바인딩 옆에 libvips 가 없습니다(${path.relative(root, neighbours)}). `
      + "이대로 배포하면 이미지를 다루는 모든 API 가 HTML 오류 페이지를 돌려줍니다.",
    );
  }
  console.log(`libvips reachable from the binding: ${libvips}/lib/${found}`);
}

/**
 * 빌드 머신의 절대 경로를 가리키는 링크를, 꾸러미 안을 가리키는 상대 경로로 바꾼다.
 *
 * 링크 구조는 그대로 둔다 — pnpm 은 그 구조로 모듈을 해석한다. 바꾸는 것은
 * "어디를 가리키는가"뿐이다. 상대 경로가 되면 꾸러미를 어느 기계 어느 폴더에
 * 풀어도 그대로 맞는다.
 */
function relativizeSymlinks(root, buildSource) {
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        const raw = readlinkSync(full);
        if (!path.isAbsolute(raw)) continue; // 이미 상대 경로면 그대로 둔다

        // 빌드 트리 기준 위치를 꾸러미 안의 같은 위치로 옮긴다.
        const insideRelease = path.join(root, path.relative(buildSource, raw));
        const nextTarget = path.relative(path.dirname(full), insideRelease);

        rmSync(full, { force: true });
        symlinkSync(nextTarget, full);
        continue;
      }

      if (entry.isDirectory()) walk(full);
    }
  };

  walk(root);
}

/**
 * 꾸러미 안의 심볼릭 링크가 전부 꾸러미 안을 가리키는지 확인한다.
 *
 * 바깥(빌드 머신의 경로)을 가리키는 링크가 하나라도 있으면 그 꾸러미는
 * 다른 기계에서 못 돈다. 배포해 봐야 알 수 있는 실패라 여기서 막는다.
 */
function assertSelfContained(root) {
  const escaped = [];

  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        const target = path.resolve(dir, readlinkSync(full));
        if (!target.startsWith(root + path.sep) && target !== root) {
          escaped.push(`${path.relative(root, full)} -> ${target}`);
        }
        continue;
      }
      if (entry.isDirectory()) walk(full);
    }
  };

  walk(root);

  if (escaped.length > 0) {
    console.error("Release artifact is not self-contained. These links point outside it:");
    for (const line of escaped.slice(0, 10)) console.error(`  ${line}`);
    if (escaped.length > 10) console.error(`  ... and ${escaped.length - 10} more`);
    throw new Error(`${escaped.length} symlink(s) escape the release root.`);
  }
}
