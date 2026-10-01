import { FalHttpError, submitFalQueue } from "../http";
import { envFalRouter, type FalRoute, type FalRouter } from "../route";
import type { FalPoolAlert } from "./alert";
import { openFalKey } from "./key-crypto";
import type { FalAccountFailure, FalAccountState, FalPoolStore } from "./store";

/**
 * **fal 계정 풀**(설계 2026-09-29 §3.3 · 보충 2026-10-01).
 *
 * 비유: 계산대가 여러 개인 가게. 손님(제출)이 오면 줄이 가장 짧은 열린 계산대로 보낸다. 한 계산대가
 * 갑자기 멈추면(429·잔액 소진·키 오류) 손님을 **곧바로 옆 계산대로** 옮긴다 — 손님은 모른다. 계산대가
 * 모두 꽉 찼을 때만 「잠시 뒤 다시」라고 말한다. 영수증(fal 요청 번호)에는 어느 계산대였는지 적어 두어,
 * 나중에 결과를 찾을 때 같은 계산대로 간다.
 *
 * - **켜진 계정이 하나도 없으면**(표가 비었거나 다 꺼짐·키를 풀 수 없음) 서버 `FAL_KEY` 로 보낸다 — 오늘과 같다.
 *   이때는 DB 에 칸을 잡지 않는다
 * - 칸 잡기는 DB 가 한다(`fal_account_claim`) — 웹 프로세스가 여럿이거나 배치기(S4)가 붙어도 같은 수를 센다
 * - 계정 목록(복호한 키)은 30초 보관한다. 관리자 화면이 바꾸면 `refresh()` 로 바로 비운다
 * - 키는 이 프로세스 메모리에만 있다. 브라우저·기록·오류 문구로 나가지 않는다
 */

export const FAL_POOL_REFRESH_MS = 30_000;
const REMEMBERED_LIMIT = 5_000;

/** 켜진 계정이 모두 찼다(또는 모두 막혔다). 429 를 실어 화면이 「잠시 뒤 다시」로 말하게 한다. */
export class FalPoolBusyError extends Error {
  readonly status = 429;
  readonly body = "fal account pool is full";
  constructor() {
    super("지금 이미지 생성이 몰려 있습니다. 잠시 뒤 다시 시도해 주세요.");
    this.name = "FalPoolBusyError";
  }
}

/**
 * fal 이 **이 계정을** 거절한 까닭. 계정 탓이 아니면 null — 다른 계정으로 옮기지 않는다.
 *
 * 429 = 한도, 401 = 키 무효, 403 = 잔액 소진 잠김(본문에 lock·balance 등) 또는 그 밖의 권한 거절.
 * 내용 거절(422)·fal 장애(5xx)·네트워크 오류는 다른 계정으로 보내도 같거나, fal 이 이미 받았을 수 있어
 * 두 번 과금될 수 있다 — 옮기지 않는다.
 */
export function accountFailureOf(error: unknown): FalAccountFailure | null {
  if (!(error instanceof FalHttpError)) return null;
  if (error.status === 429) return "rate_limited";
  if (error.status === 401) return "invalid";
  if (error.status === 403) return /lock|balance|credit|exhaust|billing|payment/i.test(error.body) ? "locked" : "invalid";
  return null;
}

interface PoolAccount {
  id: string;
  name: string;
  key: string;
  enabled: boolean;
  state: FalAccountState;
}

interface Snapshot {
  at: number;
  accounts: Map<string, PoolAccount>;
  /** 지우지 않은 계정 행이 하나라도 있는가(꺼졌거나 풀 수 없어도). 없으면 DB 를 보지 않는다. */
  anyRow: boolean;
}

type Env = Record<string, string | undefined>;

export interface PoolRouterDeps {
  store: FalPoolStore;
  masterKey: Buffer;
  environment: Env;
  alert: (event: FalPoolAlert) => unknown;
  submit?: typeof submitFalQueue;
  now?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

export interface PoolRouter extends FalRouter {
  /** 계정 목록을 다음 호출 때 다시 읽는다(관리자 화면이 바꾼 직후). */
  refresh(): void;
}

export function createPoolRouter(deps: PoolRouterDeps): PoolRouter {
  const submit = deps.submit ?? submitFalQueue;
  const env = envFalRouter(deps.environment, submit);
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string, detail?: unknown) => console.error(message, detail));
  const remembered = new Map<string, FalRoute>();
  let snapshot: Snapshot | null = null;
  let loading: Promise<Snapshot> | null = null;

  const remember = (requestId: string, route: FalRoute) => {
    remembered.set(requestId, route);
    if (remembered.size > REMEMBERED_LIMIT) remembered.delete(remembered.keys().next().value as string);
  };

  const alert = (event: FalPoolAlert) => {
    try {
      void Promise.resolve(deps.alert(event)).catch(() => undefined);
    } catch {
      // 알림이 터져도 생성은 계속된다.
    }
  };

  async function load(): Promise<Snapshot> {
    const rows = await deps.store.liveAccounts();
    const accounts = new Map<string, PoolAccount>();
    for (const row of rows) {
      try {
        const key = openFalKey(deps.masterKey, row.id, { ciphertext: row.key_ciphertext, iv: row.key_iv, tag: row.key_tag });
        accounts.set(row.id, { id: row.id, name: row.name, key, enabled: row.enabled, state: row.state });
      } catch {
        const detail = "키를 풀지 못했습니다(서버 열쇠가 바뀌었거나 값이 손상됨).";
        const changed = await deps.store.mark(row.id, "decrypt_failed", detail).catch(() => false);
        if (changed) alert({ kind: "decrypt_failed", accountName: row.name, detail });
      }
    }
    return { at: now(), accounts, anyRow: rows.length > 0 };
  }

  function current(force = false): Promise<Snapshot> {
    if (!force && snapshot && now() - snapshot.at < FAL_POOL_REFRESH_MS) return Promise.resolve(snapshot);
    loading ??= load()
      .then((loaded) => {
        snapshot = loaded;
        return loaded;
      })
      .finally(() => {
        loading = null;
      });
    return loading;
  }

  const poolOn = (s: Snapshot) => [...s.accounts.values()].some((account) => account.enabled);

  /** 받은 번호를 DB 에 붙인다. 세 번 해도 안 되면 기록만 — 같은 프로세스는 메모리로 찾는다. */
  async function bind(slotId: number, requestId: string) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await deps.store.bind(slotId, requestId);
        return;
      } catch (error) {
        if (attempt === 3) log("[fal-pool] 요청 번호를 계정에 묶지 못했습니다", { requestId, message: (error as Error).message });
      }
    }
  }

  return {
    refresh() {
      snapshot = null;
    },

    async submit(endpoint, input, options) {
      let snap = await current();
      if (!poolOn(snap)) return env.submit(endpoint, input, options);

      const tried: string[] = [];
      for (let attempt = 0; attempt <= snap.accounts.size; attempt += 1) {
        const slot = await deps.store.claim(endpoint, tried);
        if (!slot) throw new FalPoolBusyError();

        let account = snap.accounts.get(slot.accountId);
        if (!account) {
          snap = await current(true);
          account = snap.accounts.get(slot.accountId);
        }
        if (!account) {
          await deps.store.release(slot.slotId).catch(() => undefined);
          tried.push(slot.accountId);
          continue;
        }

        let requestId: string;
        try {
          requestId = await submit(account.key, endpoint, input, options);
        } catch (error) {
          await deps.store.release(slot.slotId).catch((cause: unknown) => log("[fal-pool] 칸을 돌려주지 못했습니다", cause));
          const failure = accountFailureOf(error);
          if (!failure) throw error;
          tried.push(account.id);
          const detail = (error as FalHttpError).body.slice(0, 300);
          const changed = await deps.store.mark(account.id, failure, detail).catch(() => false);
          if (changed && failure !== "rate_limited") alert({ kind: failure, accountName: account.name, detail });
          continue;
        }

        const route: FalRoute = { accountId: account.id, key: account.key };
        remember(requestId, route);
        await bind(slot.slotId, requestId);
        return { requestId, route };
      }
      throw new FalPoolBusyError();
    },

    async routeOf(requestId) {
      const known = remembered.get(requestId);
      if (known) return known;
      let snap = await current();
      if (!snap.anyRow) return env.routeOf(requestId);
      const accountId = await deps.store.accountOf(requestId);
      // 계정 기록이 없으면 서버 키로 보낸 요청이다(풀을 켜기 전·켜진 계정이 없던 때).
      if (!accountId) return env.routeOf(requestId);
      let account = snap.accounts.get(accountId);
      if (!account) {
        snap = await current(true);
        account = snap.accounts.get(accountId);
      }
      if (!account) throw new FalHttpError(410, "", "이 요청을 보낸 fal 계정을 더는 쓸 수 없습니다.");
      const route: FalRoute = { accountId, key: account.key };
      remember(requestId, route);
      return route;
    },

    finished(requestId) {
      const route = remembered.get(requestId);
      if (route ? route.accountId === null : !snapshot?.anyRow) return;
      deps.store.finish(requestId).catch((cause: unknown) => log("[fal-pool] 끝난 요청을 적지 못했습니다", cause));
    },

    async uploadRoute() {
      const snap = await current();
      const healthy = [...snap.accounts.values()].find(
        (account) => account.enabled && (account.state === "ok" || account.state === "rate_limited"),
      );
      return healthy ? { accountId: healthy.id, key: healthy.key } : env.uploadRoute();
    },
  };
}
