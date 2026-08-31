import { cpSync, existsSync, mkdirSync, readdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptsRoot, "..");
const webRoot = path.join(repoRoot, "apps", "web");
const standaloneSource = path.join(webRoot, ".next", "standalone");
const releaseRoot = path.join(repoRoot, "dist", "ec2");

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
mkdirSync(path.join(runtimeRoot, ".next"), { recursive: true });
cpSync(path.join(webRoot, ".next", "static"), path.join(runtimeRoot, ".next", "static"), { recursive: true });

// 링크가 하나라도 꾸러미 바깥을 가리키면 다른 기계에서 깨진다. 이 검사가
// 없어서 깨진 아티팩트가 운영 배포까지 갔다. 여기서 멈춘다.
assertSelfContained(releaseRoot);

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
