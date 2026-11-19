import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase, errorText, photoUrl } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { useData, fetchPublicProfiles, displayName } from '../lib/data';
import { useLive } from '../lib/useLive';
import { countryName } from '../lib/geo';
import { dateTime, duration, money, num, timeAgo } from '../lib/format';
import type { Offer, PublicProfile, SupplyRequest } from '../lib/types';
import { OfferStatusBadge, RequestStatusBadge } from '../components/StatusBadge';
import ReportButton from '../components/ReportButton';
import { Alert, Badge, Button, Card, Empty, Field, Input, LinkButton, Loading, PageHeader, Select, Stars, Textarea } from '../components/ui';

type Sort = 'price' | 'time' | 'new';

function SupplierLine({ p }: { p?: PublicProfile }) {
  const { t } = useI18n();
  if (!p) return <span className="text-slate-500">—</span>;
  return (
    <Link to={`/suppliers/${p.id}`} className="inline-flex flex-wrap items-center gap-x-2 font-semibold text-slate-900">
      {displayName(p)}
      <span className="inline-flex items-center gap-1 text-xs font-normal text-slate-500">
        <Stars value={Number(p.avg_rating)} size="text-xs" /> {p.review_count} {t('reviews')}
      </span>
    </Link>
  );
}

function OfferForm({ req, mine, onDone }: { req: SupplyRequest; mine?: Offer; onDone: () => void }) {
  const me = useMe();
  const { t } = useI18n();
  const toParts = (m: number) => (m % 1440 === 0 ? { v: m / 1440, u: 'd' } : m % 60 === 0 ? { v: m / 60, u: 'h' } : { v: m, u: 'm' });
  const init = mine ? toParts(mine.delivery_minutes) : { v: 2, u: 'h' };
  const [price, setPrice] = useState(mine ? String(mine.price) : '');
  const [dv, setDv] = useState(String(init.v));
  const [du, setDu] = useState(init.u);
  const [note, setNote] = useState(mine?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');

  const minutes = Math.round(Number(dv) * (du === 'd' ? 1440 : du === 'h' ? 60 : 1));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setOk('');
    setBusy(true);
    const payload = { price: Number(price), delivery_minutes: minutes, note: note.trim() || null };
    const res = mine
      ? await supabase.from('offers').update(payload).eq('id', mine.id)
      : await supabase.from('offers').insert({ ...payload, request_id: req.id, supplier_id: me.id, currency: req.currency });
    setBusy(false);
    if (res.error) setErr(errorText(res.error));
    else {
      setOk(t('offerSent'));
      onDone();
    }
  }

  async function withdraw() {
    if (!mine || !confirm(t('confirm'))) return;
    setBusy(true);
    const { error } = await supabase.from('offers').update({ status: 'withdrawn' }).eq('id', mine.id);
    setBusy(false);
    if (error) setErr(errorText(error));
    else onDone();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={`${t('price')} (${req.currency})`} hint={t('currencyFixed', { c: req.currency })}>
        <Input type="number" inputMode="decimal" min="0.01" step="any" required value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <div className="grid grid-cols-[1fr_8rem] gap-3">
        <Field label={t('deliveryTime')}>
          <Input type="number" inputMode="decimal" min="1" step="any" required value={dv} onChange={(e) => setDv(e.target.value)} />
        </Field>
        <Field label={t('unit')}>
          <Select value={du} onChange={(e) => setDu(e.target.value)}>
            <option value="m">{t('minutes')}</option>
            <option value="h">{t('hours')}</option>
            <option value="d">{t('days')}</option>
          </Select>
        </Field>
      </div>
      <Field label={t('note')} optional={t('optional')}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePh')} maxLength={1000} />
      </Field>
      <Alert>{err}</Alert>
      <Alert kind="success">{ok}</Alert>
      <Button type="submit" loading={busy} className="w-full" disabled={minutes < 5 || minutes > 43200}>
        {mine ? t('updateOffer') : t('sendOffer')}
      </Button>
      {mine && (
        <Button type="button" variant="danger" onClick={withdraw} disabled={busy} className="w-full">{t('withdrawOffer')}</Button>
      )}
    </form>
  );
}

export default function RequestDetail() {
  const { id } = useParams();
  const me = useMe();
  const { t, lang } = useI18n();
  const { categoryName } = useData();
  const nav = useNavigate();
  const [req, setReq] = useState<SupplyRequest | null | undefined>(undefined);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [people, setPeople] = useState<Record<string, PublicProfile>>({});
  const [orderId, setOrderId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>('price');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const [r, o, ord] = await Promise.all([
      supabase.from('requests').select('*').eq('id', id).maybeSingle(),
      supabase.from('offers').select('*').eq('request_id', id),
      supabase.from('orders').select('id').eq('request_id', id).maybeSingle(),
    ]);
    const request = (r.data as SupplyRequest) ?? null;
    const list = (o.data as Offer[]) ?? [];
    setReq(request);
    setOffers(list);
    setOrderId(ord.data?.id ?? null);
    if (request) setPeople(await fetchPublicProfiles([request.buyer_id, ...list.map((x) => x.supplier_id)]));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  // Offers appear in real time (Supabase Realtime + RLS).
  useLive(id ? `req-${id}` : null, [{ table: 'offers', filter: `request_id=eq.${id}` }, { table: 'requests', filter: `id=eq.${id}` }], load);

  const sorted = useMemo(() => {
    const visible = offers.filter((o) => o.status !== 'withdrawn' || o.supplier_id === me.id);
    return [...visible].sort((a, b) => {
      if (a.status === 'accepted') return -1;
      if (b.status === 'accepted') return 1;
      if (sort === 'price') return Number(a.price) - Number(b.price);
      if (sort === 'time') return a.delivery_minutes - b.delivery_minutes;
      return b.created_at.localeCompare(a.created_at);
    });
  }, [offers, sort, me.id]);

  if (req === undefined) return <Loading />;
  if (req === null)
    return (
      <>
        <PageHeader title="" back />
        <Empty icon="🔒" text={t('requestNotFound')} />
      </>
    );

  const isOwner = req.buyer_id === me.id;
  const isSupplier = me.role === 'supplier';
  const myOffer = offers.find((o) => o.supplier_id === me.id);
  const img = photoUrl(req.photo_path);

  async function act(offerId: string, kind: 'accept' | 'reject') {
    if (kind === 'accept' && !confirm(t('acceptConfirm'))) return;
    setErr('');
    setBusy(offerId + kind);
    const { data, error } = await supabase.rpc(kind === 'accept' ? 'accept_offer' : 'reject_offer', { p_offer_id: offerId });
    setBusy(null);
    if (error) return setErr(errorText(error));
    if (kind === 'accept' && data) nav(`/orders/${data}`);
    else void load();
  }

  async function cancelRequest() {
    if (!confirm(t('confirm'))) return;
    const { error } = await supabase.from('requests').update({ status: 'cancelled' }).eq('id', req!.id);
    if (error) setErr(errorText(error));
    else void load();
  }

  return (
    <>
      <PageHeader title={req.title} back />
      {img && <img src={img} alt="" className="mb-4 max-h-72 w-full rounded-2xl bg-slate-100 object-cover" />}
      <Card className="mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <RequestStatusBadge s={req.status} />
          {req.is_featured && <Badge color="amber">★ {t('featured')}</Badge>}
          <span className="text-sm text-slate-600">{categoryName(req.category_id)}</span>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-slate-500">{t('quantity')}</dt><dd className="font-semibold">{num(req.quantity, lang)} {req.unit}</dd></div>
          <div><dt className="text-slate-500">{t('neededWithin')}</dt><dd className="font-semibold">⏱ {duration(req.needed_within_hours * 60, lang)}</dd></div>
          <div><dt className="text-slate-500">{t('city')}</dt><dd className="font-semibold">{req.city}, {countryName(req.country, lang)}</dd></div>
          <div><dt className="text-slate-500">{t('budget')}</dt><dd className="font-semibold">{req.budget ? money(req.budget, req.currency, lang) : '—'}</dd></div>
        </dl>
        {req.description && <p className="text-sm whitespace-pre-line text-slate-700">{req.description}</p>}
        <p className="text-sm text-slate-600">📍 {req.delivery_address}</p>
        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span>{t('postedBy')}: <b className="text-slate-700">{displayName(people[req.buyer_id])}</b> · {timeAgo(req.created_at, lang)}</span>
          {!isOwner && <ReportButton type="request" id={req.id} />}
        </div>
      </Card>

      <Alert>{err}</Alert>

      {orderId && (isOwner || myOffer?.status === 'accepted') && (
        <LinkButton to={`/orders/${orderId}`} variant="success" className="mb-4 w-full">📦 {t('order')} →</LinkButton>
      )}

      {/* Supplier: send / edit own offer */}
      {isSupplier && !isOwner && (
        <Card className="mb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{t('yourOffer')}</h2>
            {myOffer && <OfferStatusBadge s={myOffer.status} />}
          </div>
          {req.status === 'open' && (!myOffer || myOffer.status === 'pending') ? (
            <OfferForm req={req} mine={myOffer} onDone={load} />
          ) : myOffer ? (
            <p className="text-sm text-slate-700">
              {money(myOffer.price, myOffer.currency, lang)} · {duration(myOffer.delivery_minutes, lang)}
            </p>
          ) : (
            <p className="text-sm text-slate-600">{t('requestClosedForOffers')}</p>
          )}
          <LinkButton to={`/messages/${req.id}/${req.buyer_id}`} variant="secondary" className="mt-3 w-full">💬 {t('message')}</LinkButton>
        </Card>
      )}

      {/* Buyer (owner) or admin: compare offers */}
      {(isOwner || me.role === 'admin') && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">{t('offers')} <span className="text-slate-400">({sorted.length})</span></h2>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="!w-auto !py-2 text-sm" aria-label={t('sortBy')}>
              <option value="price">{t('sortPrice')}</option>
              <option value="time">{t('sortTime')}</option>
              <option value="new">{t('sortNew')}</option>
            </Select>
          </div>
          {sorted.length === 0 ? (
            <Empty icon="⏳" text={t('noOffersYet')} />
          ) : (
            <div className="space-y-3">
              {sorted.map((o) => (
                <Card key={o.id} className={o.status === 'accepted' ? '!ring-2 !ring-emerald-400' : ''}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <SupplierLine p={people[o.supplier_id]} />
                    <OfferStatusBadge s={o.status} />
                  </div>
                  <div className="flex items-end gap-4">
                    <div>
                      <p className="text-xs text-slate-500">{t('price')}</p>
                      <p className="text-2xl font-extrabold text-slate-900">{money(o.price, o.currency, lang)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">{t('delivery')}</p>
                      <p className="text-lg font-bold text-slate-800">⏱ {duration(o.delivery_minutes, lang)}</p>
                    </div>
                  </div>
                  {o.note && <p className="mt-2 text-sm whitespace-pre-line text-slate-700">{o.note}</p>}
                  <p className="mt-1 text-xs text-slate-400">{dateTime(o.updated_at, lang)}</p>
                  {isOwner && (
                    <div className="mt-3 flex gap-2">
                      {req.status === 'open' && o.status === 'pending' && (
                        <>
                          <Button variant="success" className="flex-1" loading={busy === o.id + 'accept'} onClick={() => act(o.id, 'accept')}>✓ {t('accept')}</Button>
                          <Button variant="secondary" loading={busy === o.id + 'reject'} onClick={() => act(o.id, 'reject')}>{t('reject')}</Button>
                        </>
                      )}
                      <LinkButton to={`/messages/${req.id}/${o.supplier_id}`} variant="secondary" className={req.status === 'open' && o.status === 'pending' ? '' : 'flex-1'}>💬</LinkButton>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          {isOwner && req.status === 'open' && (
            <Button variant="danger" onClick={cancelRequest} className="mt-6 w-full">{t('cancelRequest')}</Button>
          )}
        </section>
      )}
    </>
  );
}
