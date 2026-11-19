import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useData } from '../lib/data';

export function Logo({ light }: { light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="14" fill="#dc2626" />
        <path d="M36 8 18 36h12l-4 20 20-30H34z" fill="#fff" />
      </svg>
      <span className="leading-none">
        <span className={`block text-lg font-extrabold tracking-tight ${light ? 'text-white' : 'text-slate-900'}`}>ACİLCEP</span>
        <span className={`block text-[10px] font-medium uppercase tracking-wider ${light ? 'text-red-100' : 'text-slate-500'}`}>Emergency Supply Network</span>
      </span>
    </span>
  );
}

export function LangSwitch() {
  const { lang, setLang } = useI18n();
  return (
    <button
      onClick={() => setLang(lang === 'en' ? 'tr' : 'en')}
      className="rounded-full px-2.5 py-1.5 text-xs font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
      aria-label="Change language / Dili değiştir"
    >
      {lang === 'en' ? 'TR' : 'EN'}
    </button>
  );
}

function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

const icons: Record<string, ReactNode> = {
  home: <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  orders: <path d="M4 7h16M4 12h16M4 17h10" />,
  messages: <path d="M4 5h16v11H8l-4 4z" />,
  bell: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />,
  user: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" />,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
};

function NavItem({ to, icon, label, badge }: { to: string; icon: string; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={to === '/app'}
      className={({ isActive }) =>
        `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${isActive ? 'text-red-600' : 'text-slate-500'}`
      }
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        {icons[icon]}
      </svg>
      {label}
      {!!badge && (
        <span className="absolute top-1 left-1/2 ml-1.5 min-w-4.5 rounded-full bg-red-600 px-1 text-center text-[10px] leading-4.5 font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </NavLink>
  );
}

export default function Layout() {
  const { t } = useI18n();
  const { profile } = useAuth();
  const { unreadNotifications, unreadMessages } = useData();
  const online = useOnline();

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-200/70 bg-white/90 px-4 py-2.5 backdrop-blur">
        <Link to="/" aria-label="ACİLCEP home">
          <Logo />
        </Link>
        <div className="flex items-center gap-2">
          {profile?.is_demo && <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-bold text-amber-800">{t('demo')}</span>}
          <LangSwitch />
        </div>
      </header>
      {!online && <div className="bg-slate-800 px-4 py-2 text-center text-xs text-white">{t('offline')}</div>}
      {profile?.is_demo && <div className="bg-amber-50 px-4 py-2 text-center text-xs text-amber-900">{t('demoBanner')}</div>}
      <main className="flex-1 px-4 pt-4 pb-28">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-2xl">
          <NavItem to="/app" icon="home" label={t('navHome')} />
          <NavItem to="/orders" icon="orders" label={t('navOrders')} />
          <NavItem to="/messages" icon="messages" label={t('navMessages')} badge={unreadMessages} />
          <NavItem to="/notifications" icon="bell" label={t('navAlerts')} badge={unreadNotifications} />
          {profile?.role === 'admin' ? (
            <NavItem to="/admin" icon="shield" label={t('navAdmin')} />
          ) : null}
          <NavItem to="/profile" icon="user" label={t('navProfile')} />
        </div>
      </nav>
    </div>
  );
}
