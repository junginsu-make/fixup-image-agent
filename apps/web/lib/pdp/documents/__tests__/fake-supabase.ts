/**
 * 시험용 메모리 Supabase. 상세페이지 문서·탈퇴 정리가 실제로 쓰는 질의 모양만 흉내 낸다.
 * - 표: eq/in/is/not(is null)/order(nullsFirst)/limit/range/select/update/delete/maybeSingle
 * - pdp_document_write 의 delete·purge(마이그레이션과 같은 뜻: 삭제 표시, 이전 버전·본문·사본 표시 정리)
 * - 저장소: list(prefix, {limit, offset}) · remove(paths)
 * `failures` 에 「동작:대상」 열쇠를 넣으면 그 호출이 오류를 돌려준다.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: { code: string; message: string } | null };
export interface FakeState {
  tables: Record<string, Row[]>;
  files: Record<string, Set<string>>;
  events: string[];
  failures: Set<string>;
  rpc?: Record<string, (args: Record<string, unknown>) => Result>;
}
export const fakeState = (tables: Record<string, Row[]> = {}, files: Record<string, string[]> = {}): FakeState => ({
  tables: { pdp_documents: [], pdp_document_revisions: [], library_items: [], library_images: [], ...tables },
  files: Object.fromEntries(Object.entries(files).map(([bucket, paths]) => [bucket, new Set(paths)])),
  events: [], failures: new Set(),
});
const offline = { code: "08006", message: "offline" };

function compareBy(orders: Array<{ key: string; asc: boolean; nullsFirst: boolean }>) {
  return (a: Row, b: Row) => {
    for (const { key, asc, nullsFirst } of orders) {
      const x = a[key] ?? null, y = b[key] ?? null;
      if (x === y) continue;
      if (x === null) return nullsFirst ? -1 : 1;
      if (y === null) return nullsFirst ? 1 : -1;
      return (String(x) < String(y) ? -1 : 1) * (asc ? 1 : -1);
    }
    return 0;
  };
}

function table(state: FakeState, name: string) {
  const filters: Filter[] = [], orders: Array<{ key: string; asc: boolean; nullsFirst: boolean }> = [];
  let action: "select" | "update" | "delete" = "select", patch: Row = {}, offset = 0, max = Infinity;
  const run = (single: boolean): Result => {
    if (state.failures.has(`${action}:${name}`)) return { data: null, error: offline };
    const rows = state.tables[name] ?? [];
    const hit = rows.filter(row => filters.every(f => f(row)));
    if (action === "update") {
      state.events.push(`update:${name}`);
      state.tables[name] = rows.map(row => hit.includes(row) ? { ...row, ...patch } : row);
      return { data: null, error: null };
    }
    if (action === "delete") {
      state.events.push(`delete:${name}`);
      state.tables[name] = rows.filter(row => !hit.includes(row));
      return { data: null, error: null };
    }
    const page = [...hit].sort(compareBy(orders)).slice(offset, offset + max);
    return { data: single ? page[0] ?? null : page, error: null };
  };
  const q = {
    select: () => q,
    eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return q; },
    in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return q; },
    is: (key: string, value: unknown) => { filters.push(row => (row[key] ?? null) === value); return q; },
    gt: (key: string, value: number) => { filters.push(row => Number(row[key]) > value); return q; },
    not: (key: string, _op: "is", value: unknown) => { filters.push(row => (row[key] ?? null) !== value); return q; },
    order: (key: string, options: { ascending?: boolean; nullsFirst?: boolean } = {}) => {
      const asc = options.ascending !== false;
      orders.push({ key, asc, nullsFirst: options.nullsFirst ?? !asc });
      return q;
    },
    limit: (count: number) => { max = count; return q; },
    range: (from: number, to: number) => { offset = from; max = to - from + 1; return q; },
    update: (value: Row) => { action = "update"; patch = value; return q; },
    delete: () => { action = "delete"; return q; },
    maybeSingle: async () => run(true),
    single: async () => run(true),
    then: (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve().then(() => run(false)).then(resolve, reject),
  };
  return q;
}

function documentWrite(state: FakeState, args: Record<string, unknown>): Result {
  if (state.failures.has(`rpc:${String(args.p_action)}`)) return { data: null, error: offline };
  const docs = state.tables.pdp_documents;
  const row = docs.find(r => r.id === args.p_id && r.user_id === args.p_user);
  if (!row) return { data: { status: 404 }, error: null };
  let next: Row;
  if (args.p_action === "delete") next = { ...row, deleted_at: row.deleted_at ?? new Date().toISOString(), cleanup_pending: true };
  else if (args.p_action === "purge") {
    if (!row.deleted_at) return { data: { status: 409 }, error: null };
    state.tables.pdp_document_revisions = state.tables.pdp_document_revisions.filter(r => r.document_id !== row.id);
    next = { ...row, document: null, last_request_id: null, cleanup_pending: false, copied_from_owner: null, held_image_tags: [] };
  } else return { data: { status: 400 }, error: null };
  state.tables.pdp_documents = docs.map(r => r === row ? next : r);
  state.events.push(`write:${String(args.p_action)}:${String(row.id)}`);
  return { data: { status: 200, record: next }, error: null };
}

function bucket(state: FakeState, name: string) {
  return {
    list: async (prefix: string, options: { limit?: number; offset?: number } = {}): Promise<Result> => {
      state.events.push(`list:${name}/${prefix}`);
      if (state.failures.has(`list:${name}/${prefix}`)) return { data: null, error: offline };
      const files = [...(state.files[name] ?? [])].filter(path => path.startsWith(prefix + "/"));
      const names = [...new Set(files.map(path => path.slice(prefix.length + 1).split("/")[0]))].sort();
      const start = options.offset ?? 0;
      const page = names.slice(start, start + (options.limit ?? 100));
      return { data: page.map(entry => ({ name: entry, id: files.includes(prefix + "/" + entry) ? entry : null })), error: null };
    },
    remove: async (paths: string[]): Promise<Result> => {
      if (state.failures.has(`remove:${name}`)) return { data: null, error: offline };
      state.events.push(`remove:${name}:${paths.join(",")}`);
      state.files[name] = new Set([...(state.files[name] ?? [])].filter(path => !paths.includes(path)));
      return { data: [], error: null };
    },
  };
}

export function fakeSupabase(state: FakeState) {
  return {
    from: (name: string) => table(state, name),
    rpc: async (name: string, args: Record<string, unknown> = {}): Promise<Result> => {
      state.events.push(`rpc:${name}`);
      if (name === "pdp_document_write") return documentWrite(state, args);
      return state.rpc?.[name]?.(args) ?? { data: null, error: { code: "PGRST202", message: "missing" } };
    },
    storage: { from: (name: string) => bucket(state, name) },
    auth: { admin: { deleteUser: async (id: string) => { state.events.push(`deleteUser:${id}`); return { error: null }; } } },
  };
}
