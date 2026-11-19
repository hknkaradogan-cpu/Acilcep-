import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useI18n, type TKey } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { timeAgo } from '../lib/format';
import type { Profile, Report, SupplyRequest } from '../lib/types';
import { RequestStatusBadge } from '../components/StatusBadge';
import { Alert, Badge, Button, Card, Input, Loading, PageHeader, Segmented } from '../components/ui';

type Tab = 'users' | 'requests' | 'reports';

export default function Admin() {
  const me = useMe();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<Tab>('reports');
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [reqs, setReqs] = useState<SupplyRequest[] | null>(null);
  const [reports, setReports] = useState<Report[] | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const [s, u, r, rp] = await Promise.all([
      supabase.rpc('admin_stats'),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }).limit(300),
      supabase.from('requests').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(200),
    ]);
    if (s.error) setErr(errorText(s.error));
    setStats(s.data as Record<string, number>);
    setUsers((u.data as Profile[]) ?? []);
    setReqs((r.data as SupplyRequest[]) ?? []);
    setReports((rp.data as Report[]) ?? []);
  }, []);
  useEffect(() => {
    if (me.role === 'admin') void load();
  }, [load, me.role]);

  if (me.role !== 'admin') return <Navigate to="/" replace />;

  async function run(p: PromiseLike<{ error: unknown }>) {
    setErr('');
    const { error } = await p;
    if (error) setErr(errorText(error));
    void load();
  }

  const ql = q.toLowerCase();
  const filteredUsers = (users ?? []).filter((u) => !ql || `${u.full_name} ${u.company_name} ${u.city} ${u.id}`.toLowerCase().includes(ql));
  const filteredReqs = (reqs ?? []).filter((r) => !ql || `${r.title} ${r.city}`.toLowerCase().includes(ql));

  return (
    <>
      <PageHeader title={t('adminPanel')} />
      {stats && (
        <div className="mb-4 grid grid-cols-3 gap-2">
          {(['users', 'open_requests', 'offers', 'orders', 'open_reports'] as const).map((k) => (
            <div key={k} className="rounded-2xl bg-white p-3 text-center shadow-sm ring-1 ring-slate-200/70">
              <p className="text-xl font-extrabold">{stats[k] ?? 0}</p>
              <p className="text-[11px] text-slate-500">{t(`stats_${k}` as TKey)}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mb-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'reports', label: t('reports') }, { value: 'users', label: t('users') }, { value: 'requests', label: t('requests') }]} />
      </div>
      {tab !== 'reports' && <Input className="mb-3" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />}
      <Alert>{err}</Alert>
      {!users ? <Loading /> : (
        <div className="mt-2 space-y-2">
          {tab === 'users' && filteredUsers.map((u) => (
            <Card key={u.id} className="!p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{u.company_name || u.full_name || '—'}</p>
                  <p className="text-xs text-slate-500">{u.full_name} · {u.city ?? ''} {u.country ?? ''} · {u.phone ?? ''}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Badge color={u.role === 'admin' ? 'violet' : u.role === 'supplier' ? 'blue' : 'gray'}>{u.role}</Badge>
                    {u.is_demo && <Badge color="amber">{t('demo')}</Badge>}
                    {u.is_suspended && <Badge color="red">{t('suspendedBadge')}</Badge>}
                  </div>
                </div>
                {u.role !== 'admin' && (
                  <Button variant={u.is_suspended ? 'secondary' : 'danger'} className="!min-h-9 !px-3 !py-1.5 text-sm"
                    onClick={() => confirm(t('confirm')) && run(supabase.rpc('admin_set_user_suspended', { p_user: u.id, p_suspended: !u.is_suspended }))}>
                    {u.is_suspended ? t('unsuspend') : t('suspend')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {tab === 'requests' && filteredReqs.map((r) => (
            <Card key={r.id} className="!p-3">
              <Link to={`/requests/${r.id}`} className="block">
                <div className="flex items-center gap-2"><RequestStatusBadge s={r.status} />{r.is_featured && <Badge color="amber">★</Badge>}{r.is_demo && <Badge color="amber">{t('demo')}</Badge>}</div>
                <p className="mt-1 font-semibold">{r.title}</p>
                <p className="text-xs text-slate-500">{r.city} · {timeAgo(r.created_at, lang)}</p>
              </Link>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" className="!min-h-9 flex-1 !py-1.5 text-sm" onClick={() => run(supabase.from('requests').update({ is_featured: !r.is_featured }).eq('id', r.id))}>
                  {r.is_featured ? t('unfeature') : t('feature')}
                </Button>
                {r.status === 'open' && (
                  <Button variant="danger" className="!min-h-9 flex-1 !py-1.5 text-sm" onClick={() => confirm(t('confirm')) && run(supabase.from('requests').update({ status: 'cancelled' }).eq('id', r.id))}>
                    {t('cancelRequest')}
                  </Button>
                )}
              </div>
            </Card>
          ))}
          {tab === 'reports' && (reports ?? []).map((r) => (
            <Card key={r.id} className="!p-3">
              <div className="flex items-center justify-between">
                <Badge color={r.status === 'open' ? 'red' : 'gray'}>{t(`rs_${r.status}` as TKey)}</Badge>
                <span className="text-xs text-slate-400">{timeAgo(r.created_at, lang)}</span>
              </div>
              <p className="mt-1 text-sm"><b>{r.target_type}</b>: {r.reason}</p>
              <p className="truncate text-xs text-slate-400">
                {r.target_type === 'request' ? <Link className="underline" to={`/requests/${r.target_id}`}>{r.target_id}</Link>
                  : r.target_type === 'order' ? <Link className="underline" to={`/orders/${r.target_id}`}>{r.target_id}</Link> : r.target_id}
              </p>
              {r.admin_note && <p className="text-xs text-slate-600">📝 {r.admin_note}</p>}
              {r.status === 'open' && (
                <div className="mt-2 flex gap-2">
                  <Button variant="success" className="!min-h-9 flex-1 !py-1.5 text-sm" onClick={() => run(supabase.rpc('admin_resolve_report', { p_report: r.id, p_status: 'resolved', p_note: prompt('Note') ?? null }))}>{t('resolve')}</Button>
                  <Button variant="secondary" className="!min-h-9 flex-1 !py-1.5 text-sm" onClick={() => run(supabase.rpc('admin_resolve_report', { p_report: r.id, p_status: 'dismissed', p_note: null }))}>{t('dismiss')}</Button>
                </div>
              )}
            </Card>
          ))}
          {tab === 'reports' && reports?.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{t('noData')}</p>}
        </div>
      )}
    </>
  );
}
