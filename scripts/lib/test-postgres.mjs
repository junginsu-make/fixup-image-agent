import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';

const exec = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
const bin = process.env.TEST_PG_BIN ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/17/bin' : '');
const executable = (name) => bin ? path.join(bin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;

/** Creates a fresh local cluster; never reads DATABASE_URL or production credentials. */
export async function testPostgres() {
  const base = await realpath(tmpdir());
  const dir = await mkdtemp(path.join(base, 'fixup-usage-test-'));
  const data = path.join(dir, 'data');
  const port = await new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.on('error', reject);
    socket.listen(0, '127.0.0.1', () => { const p = socket.address().port; socket.close(() => resolve(p)); });
  });
  const options = { windowsHide: true, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8' };
  // The Windows postmaster inherits pipe handles from pg_ctl. Do not wait for EOF
  // from a pipe retained by the daemon; pg_ctl's exit status is the start result.
  const control = (args) => new Promise((resolve, reject) => {
    const child = spawn(executable('pg_ctl'), args, { windowsHide: true, stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`pg_ctl exited ${code}; inspect ${dir}`)));
  });
  let running = false;
  const sql = async (query) => {
    // SQL goes through stdin, not a shell, command line, or a connection string.
    return new Promise((resolve, reject) => {
      const p = spawn(executable('psql'), ['-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'postgres'], { windowsHide: true });
      let out = ''; let err = '';
      p.stdout.setEncoding('utf8'); p.stderr.setEncoding('utf8');
      p.stdout.on('data', s => { out += s; }); p.stderr.on('data', s => { err += s; });
      p.on('error', reject);
      p.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error(err.trim())));
      p.stdin.end(query);
    });
  };
  async function close() {
    if (running) await control(['-D', data, '-m', 'fast', '-w', 'stop']);
    running = false;
    const actual = await realpath(dir);
    if (path.dirname(actual) !== base || !path.basename(actual).startsWith('fixup-usage-test-')) throw new Error('Refusing to remove unexpected test cluster');
    await rm(actual, { recursive: true });
  }
  try {
    await exec(executable('initdb'), ['-D', data, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C'], options);
    await control(['-D', data, '-l', path.join(dir, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port}`, '-w', 'start']);
    running = true;
    await sql(`
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE SCHEMA auth; CREATE SCHEMA storage;
      CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean DEFAULT false);
      CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1, '/') $$;
      GRANT USAGE ON SCHEMA public,auth,storage TO anon,authenticated,service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public,auth,storage TO service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
    `);
    return { sql, close, dir, port,
      async migrate(through = '99999999999999') {
        const folder = path.join(root, 'supabase/migrations');
        const files = (await readdir(folder)).filter(n => /^\d{12,14}_.*\.sql$/.test(n) && n.split('_')[0] <= through).sort();
        for (const file of files) {
          try { await sql(await readFile(path.join(folder, file), 'utf8')); }
          catch (e) { throw new Error(`Migration ${file}: ${e.message}`); }
        }
        return files;
      },
    };
  } catch (error) { await close(); throw error; }
}

export const ids = {
  a: '10000000-0000-4000-8000-000000000001', b: '10000000-0000-4000-8000-000000000002',
  c: '10000000-0000-4000-8000-000000000003', team: '20000000-0000-4000-8000-000000000001',
  otherTeam: '20000000-0000-4000-8000-000000000002', project: '30000000-0000-4000-8000-000000000001',
};

export async function seedMembers(db) {
  await db.sql(`INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
    ('${ids.a}','a@example.invalid',now()),('${ids.b}','b@example.invalid',now()),('${ids.c}','c@example.invalid',now());
    UPDATE public.profiles SET monthly_quota=100,status='active';
    INSERT INTO public.generation_executor_health(executor_id,release_id,protocol_version,succeeded_at) VALUES ('fixture','test',2,now()) ON CONFLICT(executor_id) DO UPDATE SET succeeded_at=now(),error_code=null;
    INSERT INTO public.teams(id,name,monthly_quota) VALUES ('${ids.team}','test team',10),('${ids.otherTeam}','other team',10);
    INSERT INTO public.team_members(user_id,team_id) VALUES ('${ids.a}','${ids.team}'),('${ids.b}','${ids.team}'),('${ids.c}','${ids.otherTeam}');`);
}
