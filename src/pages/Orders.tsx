import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useI18n, type TKey } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { useLive } from '../lib/useLive';
import { fetchPublicProfiles, displayName } from '../lib/data';
import { dateTime, money, timeAgo } from '../lib/format';
import type { Order, OrderEvent, OrderStatus, PublicProfile, Review, SupplyRequest } from '../lib/types';
import { OrderStatusBadge } from '../components/StatusBadge';
import ReportButton from '../components/ReportButton';
import { Alert, Button, Card, Empty, Field, LinkButton, Loading, PageHeader, Segmented, Stars, Textarea } from '../components/ui';

type OrderRow = Order & { requests: Pick<SupplyRequest, 'title'> | null };
const FINISHED: OrderStatus[] = ['delivered', 'cancelled'];

export function OrdersList() {
  const me = useMe();
  const { t, lang } = useI18n();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [rows, setRows] = useState<OrderRow[] | null>(null);
  const [people, setPeople] = useState<Record<string, PublicProfile>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, requests(title)')
      .or(`buyer_id.eq.${me.id},supplier_id.eq.${me.id}`)
      .order('updated_at', { ascending: false })
      .limit(200);
    const list = (data as OrderRow[]) ?? [];
    setRows(list);
    setPeople(await fetchPublicProfiles(list.map((o) => (o.buyer_id === me.id ? o.supplier_id : o.buyer_id))));
  }, [me.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useLive('orders-list', [{ table: 'orders' }], load);

  const shown = (rows ?? []).filter((o) => (tab === 'active' ? !FINISHED.includes(o.status) : FINISHED.includes(o.status)));

  return (
    <>
      <PageHeader title={t('orders')} />
      <div className="mb-4">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'active', label: t('active') }, { value: 'history', label: t('history') }]} />
      </div>
      {!rows ? (
        <Loading />
      ) : shown.length === 0 ? (
        <Empty icon="📦" text={t('noData')} />
      ) : (
        <div className="space-y-2">
          {shown.map((o) => {
            const other = o.buyer_id === me.id ? o.supplier_id : o.buyer_id;
            return (
              <Link key={o.id} to={`/orders/${o.id}`} className="block rounded-2xl bg-white p-3.5 shadow-sm ring-1 ring-slate-200/70">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-slate-900">{o.requests?.title ?? t('order')}</p>
                  <OrderStatusBadge s={o.status} />
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {o.buyer_id === me.id ? t('supplier') : t('buyer')}: {displayName(people[other])} · <b>{money(o.price, o.currency, lang)}</b>
                </p>
                <p className="text-xs text-slate-400">{timeAgo(o.updated_at, lang)}</p>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

const STEPS: OrderStatus[] = ['confirmed', 'preparing', 'on_the_way', 'delivered'];

function ReviewForm({ order, onDone }: { order: Order; onDone: () => void }) {
  const { t } = useI18n();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.from('reviews').insert({
      order_id: order.id, buyer_id: order.buyer_id, supplier_id: order.supplier_id, rating, comment: comment.trim() || null,
    });
    setBusy(false);
    if (error) setErr(errorText(error));
    else onDone();
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <h2 className="font-bold">{t('rateSupplier')}</h2>
      <Stars value={rating} onChange={setRating} size="text-3xl" />
      <Field label={t('comment')} optional={t('optional')}>
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </Field>
      <Alert>{err}</Alert>
      <Button type="submit" loading={busy} className="w-full">{t('submitReview')}</Button>
    </form>
  );
}

export function OrderDetail() {
  const { id } = useParams();
  const me = useMe();
  const { t, lang } = useI18n();
  const [order, setOrder] = useState<OrderRow | null | undefined>(undefined);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [contact, setContact] = useState<{ full_name: string; company_name: string; phone: string | null; city: string | null; address: string | null } | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    const [o, ev, c, rv] = await Promise.all([
      supabase.from('orders').select('*, requests(title)').eq('id', id).maybeSingle(),
      supabase.from('order_events').select('*').eq('order_id', id).order('id'),
      supabase.rpc('get_order_contact', { p_order_id: id }),
      supabase.from('reviews').select('*').eq('order_id', id).maybeSingle(),
    ]);
    setOrder((o.data as OrderRow) ?? null);
    setEvents((ev.data as OrderEvent[]) ?? []);
    setContact((c.data as never[])?.[0] ?? null);
    setReview((rv.data as Review) ?? null);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  useLive(id ? `order-${id}` : null, [{ table: 'orders', filter: `id=eq.${id}` }, { table: 'order_events', filter: `order_id=eq.${id}` }], load);

  if (order === undefined) return <Loading />;
  if (order === null) return (<><PageHeader title="" back /><Empty icon="🔒" text={t('requestNotFound')} /></>);

  const isSupplier = order.supplier_id === me.id;
  const isBuyer = order.buyer_id === me.id;
  const s = order.status;
  const actions: { to: OrderStatus; label: TKey; variant: 'primary' | 'success' | 'danger' }[] = [];
  if (isSupplier) {
    if (s === 'confirmed') actions.push({ to: 'preparing', label: 'markPreparing', variant: 'primary' });
    if (s === 'preparing') actions.push({ to: 'on_the_way', label: 'markOnTheWay', variant: 'primary' });
    if (s === 'on_the_way') actions.push({ to: 'delivered', label: 'markDelivered', variant: 'success' });
    if (s === 'confirmed' || s === 'preparing') actions.push({ to: 'cancelled', label: 'cancelOrder', variant: 'danger' });
  }
  if (isBuyer) {
    if (s === 'on_the_way') actions.push({ to: 'delivered', label: 'confirmReceived', variant: 'success' });
    if (s === 'confirmed') actions.push({ to: 'cancelled', label: 'cancelOrder', variant: 'danger' });
  }

  async function change(to: OrderStatus) {
    if (to === 'cancelled' && !confirm(t('confirm'))) return;
    setErr('');
    setBusy(to);
    const { error } = await supabase.rpc('update_order_status', { p_order_id: order!.id, p_status: to, p_note: null });
    setBusy(null);
    if (error) setErr(errorText(error));
    else void load();
  }

  const stepIndex = STEPS.indexOf(s);
  const otherId = isBuyer ? order.supplier_id : order.buyer_id;

  return (
    <>
      <PageHeader title={order.requests?.title ?? t('order')} back />
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <p className="text-2xl font-extrabold">{money(order.price, order.currency, lang)}</p>
          <OrderStatusBadge s={s} />
        </div>
        {s !== 'cancelled' && (
          <ol className="mt-4 grid grid-cols-4 gap-1">
            {STEPS.map((st, i) => (
              <li key={st} className="text-center">
                <div className={`mx-auto mb-1 h-1.5 rounded-full ${i <= stepIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                <span className={`text-[11px] font-medium ${i <= stepIndex ? 'text-emerald-700' : 'text-slate-400'}`}>{t(`os_${st}` as TKey)}</span>
              </li>
            ))}
          </ol>
        )}
        <Alert>{err}</Alert>
        {actions.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {actions.map((a) => (
              <Button key={a.to} variant={a.variant} loading={busy === a.to} onClick={() => change(a.to)} className="w-full">{t(a.label)}</Button>
            ))}
          </div>
        )}
      </Card>

      {contact && (
        <Card className="mb-4">
          <h2 className="mb-2 font-bold">{t('contact')} – {isBuyer ? t('supplier') : t('buyer')}</h2>
          <p className="font-semibold">{contact.company_name || contact.full_name}</p>
          {contact.full_name && contact.company_name && <p className="text-sm text-slate-600">{contact.full_name}</p>}
          {contact.phone && <a href={`tel:${contact.phone}`} className="mt-1 block font-semibold text-red-700">📞 {contact.phone}</a>}
          {(contact.address || contact.city) && <p className="text-sm text-slate-600">📍 {[contact.address, contact.city].filter(Boolean).join(', ')}</p>}
          <div className="mt-3 flex gap-2">
            <LinkButton to={`/messages/${order.request_id}/${otherId}`} variant="secondary" className="flex-1">💬 {t('message')}</LinkButton>
            <LinkButton to={`/requests/${order.request_id}`} variant="secondary" className="flex-1">{t('details')}</LinkButton>
          </div>
        </Card>
      )}

      {isBuyer && s === 'delivered' && (
        <Card className="mb-4">
          {review ? (
            <div><p className="font-bold">{t('yourRating')}</p><Stars value={review.rating} /><p className="text-sm text-slate-600">{review.comment}</p></div>
          ) : (
            <ReviewForm order={order} onDone={load} />
          )}
        </Card>
      )}

      <Card className="mb-4">
        <h2 className="mb-3 font-bold">{t('timeline')}</h2>
        <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
          {events.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-1.5 -left-[1.4rem] h-2.5 w-2.5 rounded-full bg-red-500" />
              <p className="text-sm font-semibold">{t(`os_${e.status}` as TKey)}</p>
              <p className="text-xs text-slate-500">{dateTime(e.created_at, lang)}</p>
              {e.note && <p className="text-sm text-slate-600">{e.note}</p>}
            </li>
          ))}
        </ol>
      </Card>
      <div className="text-center"><ReportButton type="order" id={order.id} /></div>
    </>
  );
}
