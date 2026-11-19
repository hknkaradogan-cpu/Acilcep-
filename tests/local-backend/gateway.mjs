// =====================================================================
// TEST-ONLY local backend for end-to-end tests of the ACİLCEP frontend.
//
// It is NOT Supabase and is never used in production. It emulates the small
// subset of the Supabase HTTP APIs that the app uses (Auth, PostgREST,
// Realtime postgres_changes) on top of a real PostgreSQL database that runs
// the real supabase/setup.sql – so every query still goes through the real
// Row Level Security policies as role "authenticated"/"anon".
//
//   DATABASE_URL=postgres://postgres:postgres@localhost:5432/acilcep_e2e node tests/local-backend/gateway.mjs
// =====================================================================
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 54321);
const DB_URL = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/acilcep_e2e';
const SECRET = 'local-test-secret-not-for-production';
const pool = new pg.Pool({ connectionString: DB_URL, max: 10 });

// ---------- JWT (HS256) ----------
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function sign(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64(payload);
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
function verify(token) {
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!s) return null;
  const exp = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (exp !== s) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}
export const ANON_KEY = sign({ role: 'anon', iss: 'local-test' });

// ---------- schema metadata ----------
let FKS = []; // { name, table, column, ref_table, ref_column }
let FUNCS = {}; // name -> { retset, rettype }
async function loadMeta() {
  const fk = await pool.query(`
    select c.conname as name, cl.relname as table, a.attname as column, rcl.relname as ref_table, ra.attname as ref_column
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    join pg_class rcl on rcl.oid = c.confrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
    where c.contype = 'f'`);
  FKS = fk.rows;
  const fn = await pool.query(`select p.proname, p.proretset, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype
    where p.pronamespace = 'public'::regnamespace`);
  FUNCS = Object.fromEntries(fn.rows.map((r) => [r.proname, { retset: r.proretset, rettype: r.typname }]));
}

// ---------- helpers ----------
const IDENT = /^[a-z_][a-z0-9_]*$/;
const ident = (s) => {
  if (!IDENT.test(s)) throw httpError(400, 'PGRST100', `Invalid identifier: ${s}`);
  return `"${s}"`;
};
function httpError(status, code, message, details = null, hint = null) {
  const e = new Error(message);
  Object.assign(e, { status, body: { code, message, details, hint } });
  return e;
}
function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0, cur = '', q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (!q && depth === 0 && ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur !== '') out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
const unquote = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);

function condition(alias, col, opExpr, params) {
  let not = false;
  let [op, ...rest] = opExpr.split('.');
  if (op === 'not') { not = true; [op, ...rest] = rest; }
  const raw = rest.join('.');
  const c = `${alias}.${ident(col)}`;
  const p = (v) => { params.push(v); return `$${params.length}`; };
  let sql;
  switch (op) {
    case 'eq': sql = `${c} = ${p(unquote(raw))}`; break;
    case 'neq': sql = `${c} <> ${p(unquote(raw))}`; break;
    case 'gt': sql = `${c} > ${p(raw)}`; break;
    case 'gte': sql = `${c} >= ${p(raw)}`; break;
    case 'lt': sql = `${c} < ${p(raw)}`; break;
    case 'lte': sql = `${c} <= ${p(raw)}`; break;
    case 'like': sql = `${c} like ${p(raw.replaceAll('*', '%'))}`; break;
    case 'ilike': sql = `${c} ilike ${p(raw.replaceAll('*', '%'))}`; break;
    case 'is': sql = raw === 'null' ? `${c} is null` : raw === 'true' ? `${c} is true` : `${c} is false`; break;
    case 'in': {
      const vals = splitTop(raw.replace(/^\(/, '').replace(/\)$/, '')).map(unquote);
      sql = `${c}::text = any(${p(vals)}::text[])`;
      break;
    }
    case 'cs': sql = `${c} @> ${p(raw.replace(/^\(/, '{').replace(/\)$/, '}'))}`; break;
    default: throw httpError(400, 'PGRST100', `Unsupported operator ${op}`);
  }
  return not ? `not (${sql})` : sql;
}
function logic(alias, kind, inner, params) {
  const parts = splitTop(inner.replace(/^\(/, '').replace(/\)$/, '')).map((item) => {
    const m = item.match(/^(and|or)(\(.*\))$/);
    if (m) return `(${logic(alias, m[1], m[2], params)})`;
    const [col, ...rest] = item.split('.');
    return condition(alias, col, rest.join('.'), params);
  });
  return parts.join(kind === 'and' ? ' and ' : ' or ');
}
function whereClause(alias, query, params) {
  const conds = [];
  for (const [k, v] of query) {
    if (['select', 'order', 'limit', 'offset', 'columns', 'on_conflict'].includes(k)) continue;
    if (k === 'or' || k === 'and') conds.push(`(${logic(alias, k, v, params)})`);
    else conds.push(condition(alias, k, v, params));
  }
  return conds.length ? `where ${conds.join(' and ')}` : '';
}

function relationship(from, to, hint) {
  const cands = [];
  for (const f of FKS) {
    if (f.table === from && f.ref_table === to) cands.push({ kind: 'm2o', fk: f });
    if (f.table === to && f.ref_table === from) cands.push({ kind: 'o2m', fk: f });
  }
  // many-to-many through a junction table (PostgREST also detects these)
  for (const a of FKS) for (const b of FKS) {
    if (a.table === b.table && a.name !== b.name && a.ref_table === from && b.ref_table === to && a.table !== from && a.table !== to)
      cands.push({ kind: 'm2m', fk: a, fk2: b });
  }
  const list = hint ? cands.filter((c) => c.fk.name === hint || c.fk.column === hint) : cands;
  if (list.length === 0) throw httpError(400, 'PGRST200', `Could not find a relationship between '${from}' and '${to}'`);
  if (list.length > 1) throw httpError(300, 'PGRST201', `Could not embed because more than one relationship was found for '${from}' and '${to}'`);
  return list[0];
}

let aliasN = 0;
function selectList(table, alias, select) {
  const items = splitTop(select || '*');
  const cols = [];
  for (const item of items) {
    const m = item.match(/^([a-z_][a-z0-9_]*)(?:!([a-z_][a-z0-9_]*))?\((.*)\)$/);
    if (!m) {
      cols.push(item === '*' ? `${alias}.*` : `${alias}.${ident(item)}`);
      continue;
    }
    const [, rel, hint, inner] = m;
    const r = relationship(table, rel, hint);
    const a2 = `e${++aliasN}`;
    if (inner.trim() === 'count') {
      if (r.kind !== 'o2m') throw httpError(400, 'PGRST100', 'count only supported on one-to-many in test gateway');
      cols.push(`json_build_array(json_build_object('count', (select count(*) from public.${ident(rel)} ${a2} where ${a2}.${ident(r.fk.column)} = ${alias}.${ident(r.fk.ref_column)}))) as ${ident(rel)}`);
      continue;
    }
    const innerCols = selectList(rel, a2, inner);
    if (r.kind === 'm2o') {
      cols.push(`(select to_json(x) from (select ${innerCols} from public.${ident(rel)} ${a2} where ${a2}.${ident(r.fk.ref_column)} = ${alias}.${ident(r.fk.column)}) x) as ${ident(rel)}`);
    } else if (r.kind === 'o2m') {
      cols.push(`(select coalesce(json_agg(x), '[]') from (select ${innerCols} from public.${ident(rel)} ${a2} where ${a2}.${ident(r.fk.column)} = ${alias}.${ident(r.fk.ref_column)}) x) as ${ident(rel)}`);
    } else throw httpError(400, 'PGRST100', 'm2m embedding not supported in test gateway');
  }
  return cols.join(', ');
}
function orderClause(alias, order) {
  if (!order) return '';
  return 'order by ' + order.split(',').map((o) => {
    const [col, dir, nulls] = o.split('.');
    return `${alias}.${ident(col)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullslast' ? ' nulls last' : nulls === 'nullsfirst' ? ' nulls first' : ''}`;
  }).join(', ');
}

async function asUser(claims, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${claims?.role === 'authenticated' ? 'authenticated' : 'anon'}`);
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role: 'anon' })]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
function pgToHttp(e) {
  if (e.status) return e;
  const status = e.code === '42501' ? 403 : e.code === 'P0002' ? 404 : e.code === '23505' ? 409 : 400;
  return httpError(status, e.code, e.message, e.detail ?? null, e.hint ?? null);
}

// ---------- REST ----------
async function rest(req, url, body, claims) {
  const parts = url.pathname.replace(/^\/rest\/v1\//, '').split('/');
  const q = [...url.searchParams.entries()];
  const sp = url.searchParams;
  const prefer = req.headers['prefer'] || '';
  const wantsObject = (req.headers['accept'] || '').includes('application/vnd.pgrst.object+json');
  aliasN = 0;

  if (parts[0] === 'rpc') {
    const fn = parts[1];
    if (!FUNCS[fn]) throw httpError(404, 'PGRST202', `Could not find the function public.${fn}`);
    const args = body && typeof body === 'object' ? body : {};
    const params = [];
    const named = Object.entries(args).map(([k, v]) => { params.push(v); return `${ident(k)} => $${params.length}`; });
    const call = `public.${ident(fn)}(${named.join(', ')})`;
    return asUser(claims, async (c) => {
      if (FUNCS[fn].retset) {
        const r = await c.query(`select coalesce(json_agg(x), '[]') as data from ${call} x`, params);
        return { status: 200, json: r.rows[0].data };
      }
      const r = await c.query(`select to_json(${call}) as data`, params);
      if (FUNCS[fn].rettype === 'void') return { status: 204 };
      return { status: 200, json: r.rows[0].data };
    });
  }

  const table = parts[0];
  ident(table);
  const t = `public.${ident(table)}`;

  if (req.method === 'GET' || req.method === 'HEAD') {
    const params = [];
    const where = whereClause('t', q, params);
    const cols = selectList(table, 't', sp.get('select'));
    const limit = sp.get('limit') ? `limit ${Number(sp.get('limit'))}` : '';
    const offset = sp.get('offset') ? `offset ${Number(sp.get('offset'))}` : '';
    return asUser(claims, async (c) => {
      const headers = {};
      if (/count=exact/.test(prefer)) {
        const cnt = await c.query(`select count(*)::int n from ${t} t ${where}`, params);
        headers['Content-Range'] = `*/${cnt.rows[0].n}`;
      }
      if (req.method === 'HEAD') return { status: 200, headers };
      const r = await c.query(`select coalesce(json_agg(sub), '[]') as data from (select ${cols} from ${t} t ${where} ${orderClause('t', sp.get('order'))} ${limit} ${offset}) sub`, params);
      const data = r.rows[0].data;
      if (wantsObject) {
        if (data.length !== 1) throw httpError(406, 'PGRST116', 'JSON object requested, multiple (or no) rows returned', `The result contains ${data.length} rows`);
        return { status: 200, json: data[0], headers };
      }
      return { status: 200, json: data, headers };
    });
  }

  const returning = /return=representation/.test(prefer);
  const cols = returning ? selectList(table, 'r', sp.get('select')) : null;
  const wrap = (sql) => (returning ? `with r as (${sql} returning *) select coalesce(json_agg(sub), '[]') as data from (select ${cols} from r) sub` : sql);

  if (req.method === 'POST') {
    const rows = Array.isArray(body) ? body : [body];
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const params = [];
    const values = rows.map((r) => `(${keys.map((k) => { params.push(r[k] === undefined ? null : Array.isArray(r[k]) || typeof r[k] !== 'object' || r[k] === null ? r[k] : JSON.stringify(r[k])); return `$${params.length}`; }).join(', ')})`);
    const sql = `insert into ${t} (${keys.map(ident).join(', ')}) values ${values.join(', ')}`;
    return asUser(claims, async (c) => {
      const r = await c.query(wrap(sql), params);
      if (!returning) return { status: 201 };
      const data = r.rows[0].data;
      return { status: 201, json: wantsObject ? data[0] : data };
    });
  }

  if (req.method === 'PATCH') {
    const params = [];
    const sets = Object.entries(body).map(([k, v]) => { params.push(Array.isArray(v) || typeof v !== 'object' || v === null ? v : JSON.stringify(v)); return `${ident(k)} = $${params.length}`; });
    const where = whereClause(t, q, params);
    const sql = `update ${t} set ${sets.join(', ')} ${where}`;
    return asUser(claims, async (c) => {
      const r = await c.query(wrap(sql), params);
      return returning ? { status: 200, json: r.rows[0].data } : { status: 204 };
    });
  }

  if (req.method === 'DELETE') {
    const params = [];
    const where = whereClause(t, q, params);
    return asUser(claims, async (c) => {
      const r = await c.query(wrap(`delete from ${t} ${where}`), params);
      return returning ? { status: 200, json: r.rows[0].data } : { status: 204 };
    });
  }
  throw httpError(405, 'PGRST000', 'Method not allowed');
}

// ---------- Auth ----------
await pool.query(`create table if not exists public._test_passwords (user_id uuid primary key, hash text not null)`);
await pool.query(`revoke all on public._test_passwords from anon, authenticated`);
const hash = (pw) => crypto.createHash('sha256').update('salt:' + pw).digest('hex');
function session(user) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const access_token = sign({ sub: user.id, role: 'authenticated', email: user.email, aud: 'authenticated', exp });
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: sign({ sub: user.id, typ: 'refresh' }), user };
}
function userObj(row) {
  return { id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email, email_confirmed_at: row.created_at, user_metadata: row.raw_user_meta_data ?? {}, app_metadata: { provider: 'email' }, created_at: row.created_at, updated_at: row.created_at };
}
async function auth(req, url, body, claims) {
  const path = url.pathname.replace(/^\/auth\/v1/, '');
  if (path === '/signup' && req.method === 'POST') {
    if (!body.password || body.password.length < 6) throw authError(422, 'weak_password', 'Password should be at least 6 characters.');
    const exists = await pool.query('select 1 from auth.users where email = $1', [body.email.toLowerCase()]);
    if (exists.rowCount) throw authError(422, 'user_already_exists', 'User already registered');
    const r = await pool.query('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning *', [body.email.toLowerCase(), body.data ?? {}]);
    await pool.query('insert into public._test_passwords values ($1, $2)', [r.rows[0].id, hash(body.password)]);
    return { status: 200, json: session(userObj(r.rows[0])) };
  }
  if (path === '/token' && req.method === 'POST') {
    const gt = url.searchParams.get('grant_type');
    if (gt === 'password') {
      const r = await pool.query(`select u.* from auth.users u join public._test_passwords p on p.user_id = u.id where u.email = $1 and p.hash = $2`, [String(body.email).toLowerCase(), hash(body.password)]);
      if (!r.rowCount) throw authError(400, 'invalid_credentials', 'Invalid login credentials');
      return { status: 200, json: session(userObj(r.rows[0])) };
    }
    if (gt === 'refresh_token') {
      const p = verify(body.refresh_token);
      if (!p) throw authError(400, 'refresh_token_not_found', 'Invalid Refresh Token');
      const r = await pool.query('select * from auth.users where id = $1', [p.sub]);
      return { status: 200, json: session(userObj(r.rows[0])) };
    }
  }
  if (path === '/user') {
    if (!claims?.sub) throw authError(401, 'no_authorization', 'Not logged in');
    if (req.method === 'PUT' && body.password) {
      await pool.query('update public._test_passwords set hash = $2 where user_id = $1', [claims.sub, hash(body.password)]);
    }
    const r = await pool.query('select * from auth.users where id = $1', [claims.sub]);
    return { status: 200, json: userObj(r.rows[0]) };
  }
  if (path === '/logout') return { status: 204 };
  if (path === '/recover') return { status: 200, json: {} };
  throw authError(404, 'not_found', 'Not found');
}
function authError(status, code, msg) {
  const e = new Error(msg);
  e.status = status;
  e.body = { code: status, error_code: code, msg };
  return e;
}

// ---------- HTTP server ----------
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization,apikey,content-type,prefer,accept,accept-profile,content-profile,range,x-client-info,x-supabase-api-version',
  'Access-Control-Expose-Headers': 'content-range,x-supabase-api-version',
};
const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const url = new URL(req.url, 'http://localhost');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  const claims = verify(token);
  try {
    let out;
    if (url.pathname.startsWith('/rest/v1/')) out = await rest(req, url, body, claims);
    else if (url.pathname.startsWith('/auth/v1/')) out = await auth(req, url, body, claims);
    else out = { status: 404, json: { message: 'Not found (storage is not emulated in tests)' } };
    const text = out.json === undefined ? '' : JSON.stringify(out.json);
    res.writeHead(out.status, { ...CORS, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text), ...(out.headers || {}) });
    res.end(req.method === 'HEAD' ? undefined : text);
  } catch (e0) {
    const e = url.pathname.startsWith('/auth/') && e0.body ? e0 : pgToHttp(e0);
    if (process.env.DEBUG) console.error(req.method, req.url, e.message);
    res.writeHead(e.status || 400, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify(e.body));
  }
});

// ---------- Realtime (postgres_changes) ----------
// Row changes come from a test-only NOTIFY trigger; each subscriber only gets
// rows it can SELECT under RLS (same idea as Supabase Realtime).
const subs = new Set();
let bindingId = 1000;
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/realtime/v1/websocket')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});
wss.on('connection', (ws) => {
  const send = (arr) => ws.readyState === 1 && ws.send(JSON.stringify(arr));
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    const [join_ref, ref, topic, event, payload] = msg;
    if (topic === 'phoenix' && event === 'heartbeat') return send([null, ref, 'phoenix', 'phx_reply', { status: 'ok', response: {} }]);
    if (event === 'phx_join') {
      const bindings = (payload?.config?.postgres_changes ?? []).map((b) => ({ ...b, id: ++bindingId }));
      const sub = { ws, topic, join_ref, claims: verify(payload?.access_token), bindings };
      for (const s of subs) if (s.ws === ws && s.topic === topic) subs.delete(s);
      subs.add(sub);
      send([join_ref, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: bindings } }]);
      send([join_ref, null, topic, 'system', { status: 'ok', message: 'Subscribed to PostgreSQL', extension: 'postgres_changes', channel: topic.replace('realtime:', '') }]);
      return;
    }
    if (event === 'access_token') {
      for (const s of subs) if (s.ws === ws && s.topic === topic) s.claims = verify(payload?.access_token);
      return;
    }
    if (event === 'phx_leave') {
      for (const s of subs) if (s.ws === ws && s.topic === topic) subs.delete(s);
      return send([join_ref, ref, topic, 'phx_reply', { status: 'ok', response: {} }]);
    }
  });
  ws.on('close', () => { for (const s of subs) if (s.ws === ws) subs.delete(s); });
});

function matches(b, change) {
  if (b.schema && b.schema !== '*' && b.schema !== 'public') return false;
  if (b.table && b.table !== '*' && b.table !== change.table) return false;
  if (b.event && b.event !== '*' && b.event !== change.type) return false;
  if (b.filter) {
    const m = b.filter.match(/^([a-z_]+)=eq\.(.+)$/);
    if (m && String((change.record ?? change.old_record ?? {})[m[1]]) !== m[2]) return false;
  }
  return true;
}
async function canSee(claims, table, id) {
  if (!claims?.sub) return false;
  try {
    return await asUser(claims, async (c) => (await c.query(`select 1 from public.${ident(table)} where id = $1`, [id])).rowCount > 0);
  } catch { return false; }
}
const listener = new pg.Client({ connectionString: DB_URL });
await listener.connect();
await listener.query('listen acilcep_rt');
listener.on('notification', async (n) => {
  const change = JSON.parse(n.payload);
  for (const s of subs) {
    const hit = s.bindings.filter((b) => matches(b, change));
    if (!hit.length) continue;
    const rowId = (change.record ?? change.old_record)?.id;
    if (change.type !== 'DELETE' && !(await canSee(s.claims, change.table, rowId))) continue;
    s.ws.readyState === 1 && s.ws.send(JSON.stringify([s.join_ref, null, s.topic, 'postgres_changes', {
      ids: hit.map((b) => b.id),
      data: { schema: 'public', table: change.table, commit_timestamp: new Date().toISOString(), type: change.type, record: change.record ?? {}, old_record: change.old_record ?? {}, columns: [], errors: null },
    }]));
  }
});

await loadMeta();
server.listen(PORT, () => {
  console.log(`[test gateway] http://localhost:${PORT}`);
  console.log(`[test gateway] ANON_KEY=${ANON_KEY}`);
});
