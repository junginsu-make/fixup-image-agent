import { spawnSync } from "node:child_process";
import process from "node:process";

if (process.platform === "win32") {
  console.error(
    "EC2 standalone artifact must be built on Linux. Use the Build EC2 release GitHub Actions workflow or WSL. `pnpm build` remains available for local Windows validation.",
  );
  process.exit(1);
}

const pnpm = spawnSync("pnpm", ["build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_STANDALONE: "1" },
});
if (pnpm.status !== 0) process.exit(pnpm.status ?? 1);

const prepare = spawnSync(process.execPath, ["scripts/prepare-ec2-release.mjs"], {
  stdio: "inherit",
  env: process.env,
});
process.exit(prepare.status ?? 1);
