import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { useData } from '../lib/data';
import { useLive } from '../lib/useLive';
import type { Offer, SupplyRequest } from '../lib/types';
import RequestCard from '../components/RequestCard';
import { OfferStatusBadge } from '../components/StatusBadge';
import { Alert, Empty, LinkButton, Loading, Segmented, Select } from '../components/ui';
import { money } from '../lib/format';

function ProfileNudge() {
  const me = useMe();
  const { t } = useI18n();
  if (me.country && me.city) return null;
  return (
    <Link to="/profile" className="mb-4 block rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
      <p className="font-semibold text-amber-900">{t('completeProfile')} →</p>
      <p className="text-sm text-amber-800">{t('completeProfileD')}</p>
    </Link>
  );
}

function BuyerHome() {
  const me = useMe();
  const { t } = useI18n();
  const [rows, setRows] = useState<(SupplyRequest & { offers: { count: number }[] })[] | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('requests')
      .select('*, offers!offers_request_id_fkey(count)')
      .eq('buyer_id', me.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) setErr(errorText(error));
    setRows((data as never) ?? []);
  }, [me.id]);

  useEffect(() => {
    void load();
  }, [load]);
  // New offers on my requests show up live.
  useLive('buyer-home', [{ table: 'offers' }, { table: 'requests', filter: `buyer_id=eq.${me.id}` }], load);

  return (
    <>
      <ProfileNudge />
      <LinkButton to="/requests/new" className="mb-6 w-full !py-4 text-base">
        <span className="text-xl">⚡</span> {t('newRequest')}
      </LinkButton>
      <h2 className="mb-3 text-lg font-bold text-slate-900">{t('myRequests')}</h2>
      <Alert>{err}</Alert>
      {!rows ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty icon="📝" text={t('noData')} />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} offerCount={r.offers?.[0]?.count ?? 0} />
          ))}
        </div>
      )}
    </>
  );
}

function SupplierHome() {
  const me = useMe();
  const { t, lang } = useI18n();
  const { categories } = useData();
  const [tab, setTab] = useState<'live' | 'mine'>('live');
  const [cat, setCat] = useState<string>('');
  const [myCountry, setMyCountry] = useState(true);
  const [rows, setRows] = useState<SupplyRequest[] | null>(null);
  const [myOffers, setMyOffers] = useState<(Offer & { requests: Pick<SupplyRequest, 'title' | 'status'> | null })[] | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    let q = supabase.from('requests').select('*').eq('status', 'open').neq('buyer_id', me.id);
    if (cat) q = q.eq('category_id', Number(cat));
    if (myCountry && me.country) q = q.eq('country', me.country);
    const [reqs, offs] = await Promise.all([
      q.order('is_featured', { ascending: false }).order('created_at', { ascending: false }).limit(100),
      supabase.from('offers').select('*, requests!offers_request_id_fkey(title, status)').eq('supplier_id', me.id).order('created_at', { ascending: false }).limit(100),
    ]);
    if (reqs.error) setErr(errorText(reqs.error));
    setRows((reqs.data as SupplyRequest[]) ?? []);
    setMyOffers((offs.data as never) ?? []);
  }, [me.id, me.country, cat, myCountry]);

  useEffect(() => {
    void load();
  }, [load]);
  // Live feed: new or changed requests appear instantly.
  useLive('supplier-feed', [{ table: 'requests' }, { table: 'offers', filter: `supplier_id=eq.${me.id}` }], load);

  const offeredOn = useMemo(() => new Map((myOffers ?? []).map((o) => [o.request_id, o])), [myOffers]);

  return (
    <>
      <ProfileNudge />
      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'live', label: t('liveRequests') },
            { value: 'mine', label: t('myOffers') },
          ]}
        />
      </div>
      <Alert>{err}</Alert>
      {tab === 'live' ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <Select value={cat} onChange={(e) => setCat(e.target.value)} aria-label={t('category')} className="!py-2.5 text-sm">
              <option value="">{t('allCategories')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {lang === 'tr' ? c.name_tr : c.name_en}</option>
              ))}
            </Select>
            {me.country && (
              <label className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-slate-700">
                <input type="checkbox" checked={myCountry} onChange={(e) => setMyCountry(e.target.checked)} className="h-4 w-4 accent-red-600" />
                {t('onlyMyCountry')}
              </label>
            )}
          </div>
          <p className="mb-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> {t('liveRequestsD')}
          </p>
          {!rows ? (
            <Loading />
          ) : rows.length === 0 ? (
            <Empty icon="📡" text={t('noData')} />
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const o = offeredOn.get(r.id);
                return (
                  <RequestCard
                    key={r.id}
                    r={r}
                    extra={o && <div className="mt-1.5 flex items-center gap-2 text-xs"><span className="font-semibold">{t('yourOffer')}:</span> {money(o.price, o.currency, lang)} <OfferStatusBadge s={o.status} /></div>}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : !myOffers ? (
        <Loading />
      ) : myOffers.length === 0 ? (
        <Empty icon="💬" text={t('noData')} />
      ) : (
        <div className="space-y-2">
          {myOffers.map((o) => (
            <Link key={o.id} to={`/requests/${o.request_id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/70">
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{o.requests?.title ?? '—'}</p>
                <p className="text-sm text-slate-600">{money(o.price, o.currency, lang)}</p>
              </div>
              <OfferStatusBadge s={o.status} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function AdminHome() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{t('adminPanel')}</h1>
      <LinkButton to="/admin" className="w-full">{t('adminPanel')} →</LinkButton>
    </div>
  );
}

export default function Home() {
  const me = useMe();
  if (me.role === 'admin') return <AdminHome />;
  if (me.role === 'supplier') return <SupplierHome />;
  return <BuyerHome />;
}
