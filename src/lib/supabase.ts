import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** True when the app was built with Supabase settings. */
export const isConfigured = Boolean(url && anonKey && !url.includes('YOUR-PROJECT'));

// Only the public anon key is used in the browser. All data access is
// protected by Row Level Security in the database.
export const supabase: SupabaseClient = createClient(
  isConfigured ? url! : 'https://not-configured.invalid',
  isConfigured ? anonKey! : 'not-configured',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export const PHOTO_BUCKET = 'request-photos';

export function photoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Turns a Supabase / Postgres error into a short readable message. */
export function errorText(e: unknown): string {
  if (!e) return '';
  if (typeof e === 'string') return e;
  const m = (e as { message?: string }).message ?? String(e);
  if (/row-level security/i.test(m)) return 'You are not allowed to do this.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'No connection. Please check your internet.';
  return m;
}
