import { FalHttpError, checkFalKey, submitFalQueue, type FalKeyCheck } from "../http";
import { envFalRouter, type FalRoute, type FalRouter } from "../route";
import type { FalPoolAlert } from "./alert";
import { openFalKey } from "./key-crypto";
import type { FalAccountFailure, FalAccountState, FalPoolStore } from "./store";
import { isFalReceipt, type FalReceipt } from "../request-id";
import { openFalReceipt, sealFalReceipt } from "./receipt";

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
 * - **429 인데 옮길 계정이 없으면 쉬게 하지 않는다**(최종 리뷰 I1). 계정 하나일 때 한 번의 429 로 60초 동안
 *   모든 생성이 멈추던 것을, 이번 제출만 「잠시 뒤 다시」로 끝낸다
 * - **401/403 은 무료 확인을 한 번 한다**(최종 보안 리뷰 L2). 키가 멀쩡하면 요청 탓이다 — 계정을 끄지 않는다
 * - DB 가 터진 원문(표·제약 이름)은 기록에만, 화면에는 고정 문구만(최종 보안 리뷰 L4)
 */

export const FAL_POOL_REFRESH_MS = 30_000;
const REMEMBERED_LIMIT = 5_000;
/** DB `fal_account_mark` 의 한도 걸림 쉬는 시간과 같다. 이 프로세스 캐시에만 쓴다. */
const RATE_LIMIT_COOLDOWN_MS = 60_000;
/** 칸을 줄 수 없는 상태. DB `fal_account_claim` 의 거르기와 같다. */
const BLOCKED_STATES: readonly FalAccountState[] = ["locked", "invalid", "decrypt_failed"];

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
 * 계정 풀 DB 를 쓰지 못했다. 원문은 기록에만 남기고 화면에는 이 문구만 간다.
 *
 * `status` 는 **제출 전**(칸 잡기)에만 싣는다(503) — 아직 아무것도 보내지 않았으니 묶은 장을 풀어도 된다.
 * 보낸 요청의 계정 찾기에서 터지면 싣지 않는다 — fal 이 이미 그렸을 수 있어 장을 풀면 안 된다
 * (`classifyFalFailure`: 상태 코드가 없으면 「우리 쪽 고장」으로 보고 풀지 않는다).
 */
export class FalPoolUnavailableError extends Error {
  constructor(readonly status?: number) {
    super("이미지 생성 준비 중 문제가 생겼습니다. 잠시 뒤 다시 시도해 주세요.");
    this.name = "FalPoolUnavailableError";
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
  /** 한도 걸림 뒤 쉬는 끝(ms). 없으면 null. */
  cooldownUntil: number | null;
}

interface Snapshot {
  loaded: boolean;
  at: number;
  accounts: Map<string, PoolAccount>;
}

type Env = Record<string, string | undefined>;

export interface PoolRouterDeps {
  store: FalPoolStore;
  masterKey: Buffer;
  environment: Env;
  alert: (event: FalPoolAlert) => unknown;
  submit?: typeof submitFalQueue;
  /** 401/403 뒤 키가 살아 있는지 무료로 한 번 묻는다. 기본은 `checkFalKey`(10초 제한). */
  checkKey?: (key: string) => Promise<FalKeyCheck>;
  now?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

export interface PoolRouter extends FalRouter {
  /** 계정 목록을 다음 호출 때 다시 읽는다(관리자 화면이 바꾼 직후). */
  refresh(): void;
}

export function createPoolRouter(deps: PoolRouterDeps): PoolRouter {
  const submit = deps.submit ?? submitFalQueue;
  const checkKey = deps.checkKey ?? checkFalKey;
  const env = envFalRouter(deps.environment, submit);
  const now = deps.now ?? Date.now;
  const log = deps.log ?? ((message: string, detail?: unknown) => console.error(message, detail));
  type Remembered = { route: FalRoute; slotId?: number; providerId: string };
  const remembered = new Map<string, Remembered>();
  const pendingFinishes = new Map<string, Remembered>();
  let snapshot: Snapshot | null = null;
  /** 마지막으로 **성공한** 적재 — `refresh()` 로도 비우지 않는다. DB 가 끊기면 이것으로 버틴다. */
  let lastGood: Snapshot | null = null;
  let loading: Promise<Snapshot> | null = null;
  /** `refresh()` 때마다 하나 올린다. 전에 떠 있던 적재가 뒤늦게 끝나도 이 수가 바뀌어 있으면 캐시에 쓰지 않는다. */
  let generation = 0;

  const remember = (requestId: string, route: FalRoute, slotId?: number, providerId = requestId) => {
    remembered.set(requestId, { route, slotId, providerId });
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
        const cooldownUntil = row.cooldown_until ? Date.parse(row.cooldown_until) : NaN;
        accounts.set(row.id, {
          id: row.id, name: row.name, key, enabled: row.enabled, state: row.state,
          cooldownUntil: Number.isFinite(cooldownUntil) ? cooldownUntil : null,
        });
      } catch {
        // 이미 알려진 상태면 또 표시·메일 보내지 않는다 — 풀릴 때까지 30초마다 다시 적재될 때마다 반복될 뻔했다.
        if (row.state === "decrypt_failed") continue;
        const detail = "키를 풀지 못했습니다(서버 열쇠가 바뀌었거나 값이 손상됨). 열쇠를 되돌렸다면 「다시 확인」을 눌러 주세요.";
        const changed = await deps.store.mark(row.id, "decrypt_failed", detail).catch(() => false);
        if (changed) alert({ kind: "decrypt_failed", accountName: row.name, detail });
      }
    }
    return { at: now(), accounts, loaded: true };
  }

  /** 읽기 실패를 빈 목록과 구분한다. 이 상태로 기존 요청의 계정을 추측하지 않는다. */
  function emptySnapshot(): Snapshot {
    return { at: now(), accounts: new Map(), loaded: false };
  }

  /**
   * 목록을 하나 적재한다. `refresh()` 가 그 사이 불렸으면(세대 번호가 바뀌면) 늦게 끝난 결과를 캐시에
   * 쓰지 않는다. **읽기 자체가 실패하면**(DB 장애) 새 하드 의존을 만들지 않는다 — 전에 성공한 목록이
   * 있으면 그걸 그대로 쓰고, 한 번도 없었으면 풀이 비었을 때와 같은 모양으로 서버 `FAL_KEY` 로 넘긴다.
   */
  function startLoad(): Promise<Snapshot> {
    const gen = generation;
    const promise = load()
      .then((loaded) => {
        if (gen === generation) {
          snapshot = loaded;
          lastGood = loaded;
        }
        return loaded;
      })
      .catch((error: unknown) => {
        log("[fal-pool] 계정 목록을 읽지 못했습니다", { message: error instanceof Error ? error.message : String(error) });
        // 시각은 지금으로 새로 찍는다(불변 — lastGood 자체는 안 바꾼다) — 안 그러면 마지막 성공
        // 시각이 30초를 넘기는 순간부터 요청마다 매번 다시 읽고 또 실패하고 또 적는다.
        const fallback = lastGood ? { ...lastGood, at: now() } : emptySnapshot();
        if (gen === generation) snapshot = fallback;
        return fallback;
      })
      .finally(() => {
        if (loading === promise) loading = null;
      });
    loading = promise;
    return promise;
  }

  function current(force = false): Promise<Snapshot> {
    if (!force && snapshot && now() - snapshot.at < FAL_POOL_REFRESH_MS) return Promise.resolve(snapshot);
    if (!force && loading) return loading;
    return startLoad();
  }

  /**
   * 켜진 계정이 있는가. **DB 에 `decrypt_failed` 로 적힌 계정은 세지 않는다**(최종 리뷰 I2) — 열쇠를 되돌려
   * 지금은 풀려도 DB 칸 잡기는 그 계정을 빼므로, 세면 칸을 하나도 못 받아 모든 생성이 「몰려 있습니다」가
   * 된다. 관리자가 「다시 확인」을 누를 때까지는 서버 `FAL_KEY` 로 보낸다(보충 §3 「모두 키를 풀 수 없음」).
   */
  const poolOn = (s: Snapshot) => [...s.accounts.values()].some((account) => account.enabled && account.state !== "decrypt_failed");

  /** 지금 칸을 받을 수 있는 계정인가(DB 칸 잡기의 거르기와 같다, 남은 칸 수는 빼고). */
  const usable = (account: PoolAccount) =>
    account.enabled && !BLOCKED_STATES.includes(account.state) && !(account.cooldownUntil !== null && account.cooldownUntil > now());

  /**
   * 계정 하나를 바꾼 결과를 **새 스냅샷**으로 돌려준다(불변). 지금 캐시가 이 스냅샷이면 바로 덮어써,
   * 막 막힌 계정을 `uploadRoute` 가 최대 30초 동안 더 돌려주는 일이 없게 한다.
   */
  function withAccount(snap: Snapshot, accountId: string, patch: Partial<Pick<PoolAccount, "state" | "cooldownUntil">>): Snapshot {
    const account = snap.accounts.get(accountId);
    if (!account) return snap;
    const accounts = new Map(snap.accounts);
    accounts.set(accountId, { ...account, ...patch });
    const updated: Snapshot = { ...snap, accounts };
    if (snapshot === snap) snapshot = updated;
    if (lastGood === snap) lastGood = updated;
    return updated;
  }

  /** DB 를 부르다 터지면 원문은 기록에 한 번, 밖으로는 고정 문구만. */
  async function guarded<T>(what: string, run: () => Promise<T>, status?: number): Promise<T> {
    try {
      return await run();
    } catch (error) {
      log(`[fal-pool] ${what}`, { message: error instanceof Error ? error.message : String(error) });
      throw new FalPoolUnavailableError(status);
    }
  }

  /** 무료 확인이 「키가 멀쩡하다」고 하면 참. 확인할 수 없으면(시간 초과·fal 장애) 거짓 — 오늘처럼 다룬다. */
  async function keyStillWorks(key: string): Promise<boolean> {
    const check = await checkKey(key).catch(() => null);
    return check?.ok === true;
  }

  /**
   * fal 이 이 계정의 제출을 거절했다. 다음 계정으로 옮길 거면 (바뀐) 스냅샷을 돌려주고, 아니면 던진다.
   *
   * - 계정 탓이 아니면(422·5xx·네트워크) 그대로 던진다 — 두 번 과금될 수 있다
   * - 429 인데 **옮길 다른 계정이 없으면** 쉬게 하지 않고 이번 제출만 「몰려 있습니다」. 쉬게 하면 계정 하나일 때
   *   60초 동안 모든 생성이 멈춘다
   * - 401/403(키 오류로 읽힌 것)은 무료 확인 한 번. 키가 멀쩡하면 요청 탓이니 끄지도 옮기지도 않는다
   */
  async function onRefused(snap: Snapshot, account: PoolAccount, error: unknown, tried: readonly string[]): Promise<Snapshot> {
    const failure = accountFailureOf(error);
    if (!failure) throw error;
    if (failure === "rate_limited") {
      const others = [...snap.accounts.values()].some((other) => other.id !== account.id && !tried.includes(other.id) && usable(other));
      if (!others) throw new FalPoolBusyError();
    }
    if (failure === "invalid" && (await keyStillWorks(account.key))) throw error;

    const detail = (error as FalHttpError).body.slice(0, 300);
    const changed = await deps.store.mark(account.id, failure, detail).catch(() => false);
    // 이 프로세스 캐시에도 쉬는 중으로 — 다음 제출이 「옮길 곳이 있다」고 잘못 셈하지 않게.
    if (failure === "rate_limited") return withAccount(snap, account.id, { cooldownUntil: now() + RATE_LIMIT_COOLDOWN_MS });
    if (!changed) return snap;
    alert({ kind: failure, accountName: account.name, detail });
    // 캐시에도 바로 반영 — 안 그러면 uploadRoute 가 최대 30초 동안 막힌 계정을 더 돌려준다.
    return withAccount(snap, account.id, { state: failure });
  }

  /** 저장을 확인하지 못하면 호출자에게 서명된 복구 영수증을 반환한다. 재제출하지 않는다. */
  async function bind(slotId: number, requestId: string) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await deps.store.bind(slotId, requestId);
        return true;
      } catch (error) {
        if (attempt === 3) log("[fal-pool] 요청 번호를 계정에 묶지 못했습니다", { requestId, message: (error as Error).message });
      }
    }
    return false;
  }

  async function finishKnown(id: string, entry: Remembered): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        // Release deletes ONLY an unbound slot. If bind won the race, finish below
        // closes its bound row. This order also works when bind stays unavailable.
        if (entry.slotId !== undefined) await deps.store.release(entry.slotId);
        await deps.store.finish(entry.providerId);
        pendingFinishes.delete(id);
        return;
      } catch (error) {
        if (attempt === 3) log("[fal-pool] 완료한 요청의 칸 정리를 다시 시도해야 합니다", { requestId: entry.providerId, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  return {
    refresh() {
      generation += 1;
      snapshot = null;
      loading = null;
    },

    async submit(endpoint, input, options) {
      const pending = pendingFinishes.entries().next().value;
      if (pending) await finishKnown(pending[0], pending[1]);
      let snap = await current();
      if (!poolOn(snap)) {
        const accepted = await env.submit(endpoint, input, options);
        remember(accepted.requestId, accepted.route);
        return accepted;
      }

      const tried: string[] = [];
      for (let attempt = 0; attempt <= snap.accounts.size; attempt += 1) {
        const slot = await guarded("칸을 잡지 못했습니다", () => deps.store.claim(endpoint, tried), 503);
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
          snap = await onRefused(snap, account, error, tried);
          tried.push(account.id);
          continue;
        }

        const route: FalRoute = { accountId: account.id, key: account.key };
        remember(requestId, route, slot.slotId);
        if (await bind(slot.slotId, requestId)) return { requestId, route };
        // The caller already persists this opaque ID in its server-owned job record.
        // Preserve account/slot identity there if the dedicated binding RPC failed.
        // Never throw an ordinary submission error after the provider accepted it.
        const receipt = sealFalReceipt(deps.masterKey, { accountId: account.id, slotId: slot.slotId, requestId });
        remember(receipt, route, slot.slotId, requestId);
        return { requestId: receipt, route };
      }
      throw new FalPoolBusyError();
    },

    async routeOf(requestId) {
      const receipt = isFalReceipt(requestId) ? openFalReceipt(deps.masterKey, requestId) : null;
      const known = remembered.get(requestId);
      if (known) return known.route;
      let snap = await current();
      if (!snap.loaded) throw new FalPoolUnavailableError();
      // 상태 코드는 싣지 않는다 — 이미 보낸 요청이라 화면이 묶은 장을 풀면 안 된다.
      const accountId = receipt?.accountId ?? await guarded("보낸 계정을 찾지 못했습니다", () => deps.store.accountOf(requestId));
      // 계정 기록이 없으면 서버 키로 보낸 요청이다(풀을 켜기 전·켜진 계정이 없던 때).
      if (!accountId) {
        const route = await env.routeOf(requestId);
        remember(requestId, route);
        return route;
      }
      let account = snap.accounts.get(accountId);
      if (!account) {
        snap = await current(true);
        account = snap.accounts.get(accountId);
      }
      if (!account) throw new FalPoolUnavailableError();
      const route: FalRoute = { accountId, key: account.key };
      remember(requestId, route, receipt?.slotId, receipt?.requestId ?? requestId);
      return route;
    },

    async finished(requestId) {
      const receipt: FalReceipt | null = isFalReceipt(requestId) ? openFalReceipt(deps.masterKey, requestId) : null;
      const known = remembered.get(requestId);
      if (known?.route.accountId === null) return;
      const entry = known ?? { route: { accountId: receipt?.accountId ?? null, key: "" }, slotId: receipt?.slotId, providerId: receipt?.requestId ?? requestId };
      pendingFinishes.set(requestId, entry);
      if (pendingFinishes.size > REMEMBERED_LIMIT) {
        pendingFinishes.delete(pendingFinishes.keys().next().value as string);
        log("[fal-pool] 완료 정리 대기 한도를 넘었습니다. 오래된 칸은 DB lease 만료로 해제됩니다.");
      }
      await finishKnown(requestId, entry);
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
