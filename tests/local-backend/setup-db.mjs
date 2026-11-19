// TEST ONLY: creates a fresh local database with the real ACİLCEP schema
// (supabase/setup.sql) plus a Supabase stand-in and a NOTIFY trigger used by
// the test gateway to emulate Realtime.
import pg from 'pg';
import { readFileSync } from 'node:fs';

const ADMIN = process.env.ADMIN_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const DB = process.env.E2E_DB || 'acilcep_e2e';
const root = new pg.Client({ connectionString: ADMIN });
await root.connect();
await root.query(`drop database if exists ${DB} with (force)`);
await root.query(`create database ${DB}`);
await root.end();

const u = new URL(ADMIN);
u.pathname = '/' + DB;
const c = new pg.Client({ connectionString: u.toString() });
await c.connect();
await c.query(readFileSync('supabase/tests/supabase_stub.sql', 'utf8'));
await c.query(readFileSync('supabase/setup.sql', 'utf8'));
await c.query(`
  create or replace function public._rt_notify() returns trigger language plpgsql as $$
  begin
    perform pg_notify('acilcep_rt', json_build_object(
      'table', tg_table_name, 'type', tg_op,
      'record', case when tg_op = 'DELETE' then null else row_to_json(new) end,
      'old_record', case when tg_op = 'INSERT' then null else row_to_json(old) end)::text);
    return null;
  end $$;
  do $$ declare t text; begin
    foreach t in array array['requests','offers','orders','order_events','messages','notifications'] loop
      execute format('create trigger _rt after insert or update or delete on public.%I for each row execute function public._rt_notify()', t);
    end loop;
  end $$;
`);
await c.end();
console.log('e2e database ready:', DB);
