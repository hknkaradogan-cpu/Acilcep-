import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase, isConfigured } from './supabase';
import type { Category, PublicProfile } from './types';
import { useAuth } from './auth';
import { useI18n } from './i18n';

interface DataState {
  categories: Category[];
  categoryName: (id: number | null | undefined) => string;
  unreadNotifications: number;
  unreadMessages: number;
  refreshCounts: () => void;
}

const Ctx = createContext<DataState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { lang } = useI18n();
  const [categories, setCategories] = useState<Category[]>([]);
  const [unreadNotifications, setUN] = useState(0);
  const [unreadMessages, setUM] = useState(0);
  const uid = session?.user.id;

  useEffect(() => {
    if (!isConfigured) return;
    supabase
      .from('categories')
      .select('*')
      .order('sort')
      .then(({ data }) => setCategories((data as Category[]) ?? []));
  }, []);

  const refreshCounts = useCallback(async () => {
    if (!uid) {
      setUN(0);
      setUM(0);
      return;
    }
    const [n, m] = await Promise.all([
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', uid).is('read_at', null),
      supabase.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', uid).is('read_at', null),
    ]);
    setUN(n.count ?? 0);
    setUM(m.count ?? 0);
  }, [uid]);

  // Live badge counts via Supabase Realtime (RLS limits events to this user).
  useEffect(() => {
    if (!uid) return;
    void refreshCounts();
    const ch = supabase
      .channel('badges-' + uid)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => void refreshCounts())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `recipient_id=eq.${uid}` }, () => void refreshCounts())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [uid, refreshCounts]);

  const categoryName = useCallback(
    (id: number | null | undefined) => {
      const c = categories.find((x) => x.id === id);
      if (!c) return '';
      return `${c.icon} ${lang === 'tr' ? c.name_tr : c.name_en}`;
    },
    [categories, lang],
  );

  return (
    <Ctx.Provider value={{ categories, categoryName, unreadNotifications, unreadMessages, refreshCounts: () => void refreshCounts() }}>
      {children}
    </Ctx.Provider>
  );
}

export function useData(): DataState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useData outside provider');
  return v;
}

/** Loads public profiles (name, rating – never phone/address) for a list of user ids. */
export async function fetchPublicProfiles(ids: string[]): Promise<Record<string, PublicProfile>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const { data } = await supabase.from('public_profiles').select('*').in('id', unique);
  return Object.fromEntries(((data as PublicProfile[]) ?? []).map((p) => [p.id, p]));
}

export function displayName(p: { company_name?: string; full_name?: string } | undefined | null): string {
  return p?.company_name || p?.full_name || '—';
}
