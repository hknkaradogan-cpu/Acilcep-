// Combines supabase/migrations/*.sql into supabase/setup.sql (one file to paste into the Supabase SQL Editor).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const header = `-- ACİLCEP – complete database setup (generated from supabase/migrations by \`npm run db:bundle\`).
-- Paste this whole file into Supabase > SQL Editor > New query > Run. It is safe to run again.\n\n`;
const body = files.map((f) => `-- >>> ${f}\n` + readFileSync(join(dir, f), 'utf8')).join('\n\n');
writeFileSync('supabase/setup.sql', header + body);
console.log('Wrote supabase/setup.sql from', files.join(', '));
