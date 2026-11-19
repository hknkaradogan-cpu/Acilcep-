import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isConfigured, supabase } from './supabase';
import type { Profile } from './types';
import { useI18n } from './i18n';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const { setLang } = useI18n();

  const loadProfile = useCallback(
    async (s: Session | null) => {
      if (!s) {
        setProfile(null);
        return;
      }
      // The profile row is created by a database trigger right after sign-up.
      for (let i = 0; i < 3; i++) {
        const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).maybeSingle();
        if (data) {
          setProfile(data as Profile);
          if (data.language === 'en' || data.language === 'tr') setLang(data.language);
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      setProfile(null);
    },
    [setLang],
  );

  useEffect(() => {
    if (!isConfigured) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside this callback can deadlock.
        setTimeout(() => void loadProfile(s), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const refreshProfile = useCallback(() => loadProfile(session), [loadProfile, session]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
  }, []);

  return (
    <Ctx.Provider value={{ session, profile, loading, refreshProfile, signOut }}>{children}</Ctx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside provider');
  return v;
}

/** Profile of the logged-in user (only use inside protected routes). */
export function useMe(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('Not logged in');
  return profile;
}
