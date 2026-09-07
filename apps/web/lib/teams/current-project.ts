import "server-only";

import { cookies } from "next/headers";
import { resolveCurrentProject } from "./projects";
import { listProjects } from "./project-store";
import { teamIdOf } from "./store";

/**
 * 지금 고른 프로젝트를 기억하는 자리.
 *
 * ── 왜 주소가 아니라 쿠키인가 ────────────────────────────────────
 *
 * 「고르면 **모든 화면이** 걸러진다」가 이 기능의 약속이다. 주소에 실으면
 * 화면을 옮길 때마다 `?project=` 를 이어 붙여야 하고, 링크 하나만 빠뜨려도
 * 거기서 필터가 풀린다 — 사용자는 왜 갑자기 전부 보이는지 모른다.
 *
 * 잃는 것은 「이 화면을 이 필터로 보라」고 링크를 보내는 일이다. 프로젝트는
 * 팀 안에서만 뜻이 있어 링크를 밖으로 보낼 일이 없다.
 */

const COOKIE = "mcs_project";

/**
 * 고른 프로젝트. **목록에 없는 값은 없는 것으로 친다.**
 *
 * 팀을 옮겼거나 프로젝트가 접힌 뒤에도 쿠키는 남는다. 그 값을 그대로 걸면
 * 모든 화면이 텅 빈 채로 열리고, 화면에는 아무 표시도 없으니 「작업물이 다
 * 사라졌다」로 보인다.
 */
export async function currentProjectId(
  available: readonly { id: string }[],
): Promise<string | null> {
  const store = await cookies();
  return resolveCurrentProject(store.get(COOKIE)?.value, available);
}

/** 고른 것을 남긴다. 빈 값이면 「전체」로 되돌린다. */
export async function setCurrentProject(projectId: string | null): Promise<void> {
  const store = await cookies();
  if (!projectId) {
    store.delete(COOKIE);
    return;
  }
  store.set(COOKIE, projectId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 한 달. 화면을 보는 습관이라 오래 가도 되지만, 영구히 두면 오래 전에
    // 접은 프로젝트가 계속 따라다닌다.
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * 이 사람이 지금 고른 프로젝트. **고를 수 있는 것인지까지 확인한다.**
 *
 * 목록을 부르는 자리마다 「팀을 묻고 → 프로젝트를 읽고 → 쿠키를 맞춰 보고」
 * 를 적으면 한 곳이 빠진다. 빠진 화면만 필터가 안 걸려, 왜 저기만 전부
 * 보이는지 알 수 없게 된다.
 */
export async function selectedProjectFor(userId: string): Promise<string | null> {
  return currentProjectId(await listProjects(await teamIdOf(userId)));
}
