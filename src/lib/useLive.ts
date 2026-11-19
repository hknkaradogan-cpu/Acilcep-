import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

type Spec = { table: string; filter?: string; event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE' };

/**
 * Subscribes to Supabase Realtime row changes and calls `onChange`.
 * Supabase only delivers rows the logged-in user may read (RLS).
 */
export function useLive(key: string | null, specs: Spec[], onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const specKey = JSON.stringify(specs);
  useEffect(() => {
    if (!key) return;
    let ch = supabase.channel(`${key}-${Math.random().toString(36).slice(2, 8)}`);
    for (const s of JSON.parse(specKey) as Spec[]) {
      ch = ch.on(
        'postgres_changes',
        { event: s.event ?? '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        () => cb.current(),
      );
    }
    ch.subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [key, specKey]);
}
