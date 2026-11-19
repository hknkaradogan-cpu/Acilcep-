import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n, type TKey } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { useData } from '../lib/data';
import { useLive } from '../lib/useLive';
import { timeAgo } from '../lib/format';
import type { AppNotification } from '../lib/types';
import { Button, Empty, Loading, PageHeader } from '../components/ui';

const ICON: Record<string, string> = {
  new_request: '📡', new_offer: '💰', offer_updated: '✏️', offer_withdrawn: '↩️', offer_accepted: '🎉',
  offer_rejected: '✖️', order_status: '📦', new_message: '💬',
};

export default function Notifications() {
  const me = useMe();
  const { t, lang } = useI18n();
  const { refreshCounts } = useData();
  const nav = useNavigate();
  const [rows, setRows] = useState<AppNotification[] | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', me.id).order('created_at', { ascending: false }).limit(100);
    setRows((data as AppNotification[]) ?? []);
  }, [me.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useLive('notif', [{ table: 'notifications', filter: `user_id=eq.${me.id}` }], load);

  function text(n: AppNotification) {
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(n.data ?? {})) vars[k] = String(v ?? '');
    if (n.type === 'order_status' && vars.status) vars.status = t(`os_${vars.status}` as TKey);
    const key = `n_${n.type}` as TKey;
    return t(key, vars);
  }

  async function open(n: AppNotification) {
    if (!n.read_at) {
      await supabase.rpc('mark_notifications_read', { p_ids: [n.id] });
      refreshCounts();
    }
    if (n.link) nav(n.link);
  }

  async function readAll() {
    await supabase.rpc('mark_notifications_read', { p_ids: null });
    refreshCounts();
    void load();
  }

  return (
    <>
      <PageHeader
        title={t('notifications')}
        action={rows?.some((r) => !r.read_at) && <Button variant="ghost" className="!min-h-0 !px-2 !py-1 text-sm" onClick={readAll}>{t('markAllRead')}</Button>}
      />
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty icon="🔔" text={t('noData')} />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          {rows.map((n) => (
            <button key={n.id} onClick={() => open(n)} className={`flex w-full items-start gap-3 p-3.5 text-left ${n.read_at ? '' : 'bg-red-50/50'}`}>
              <span className="text-xl">{ICON[n.type] ?? '🔔'}</span>
              <span className="flex-1">
                <span className={`block text-sm ${n.read_at ? 'text-slate-700' : 'font-semibold text-slate-900'}`}>{text(n)}</span>
                <span className="text-xs text-slate-400">{timeAgo(n.created_at, lang)}</span>
              </span>
              {!n.read_at && <span className="mt-1.5 h-2 w-2 rounded-full bg-red-600" />}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
