import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { useData, fetchPublicProfiles, displayName } from '../lib/data';
import { countryName } from '../lib/geo';
import { money, timeAgo } from '../lib/format';
import type { Product, PublicProfile, Review } from '../lib/types';
import ReportButton from '../components/ReportButton';
import { Card, Empty, Loading, PageHeader, Stars } from '../components/ui';

export default function SupplierPublic() {
  const { id } = useParams();
  const me = useMe();
  const { t, lang } = useI18n();
  const { categoryName } = useData();
  const [p, setP] = useState<PublicProfile | null | undefined>(undefined);
  const [products, setProducts] = useState<Product[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const [pp, pr, rv] = await Promise.all([
        fetchPublicProfiles([id]),
        supabase.from('supplier_products').select('*').eq('supplier_id', id).order('created_at', { ascending: false }),
        supabase.from('reviews').select('*').eq('supplier_id', id).order('created_at', { ascending: false }).limit(50),
      ]);
      setP(pp[id] ?? null);
      setProducts((pr.data as Product[]) ?? []);
      setReviews((rv.data as Review[]) ?? []);
    })();
  }, [id]);

  if (p === undefined) return <Loading />;
  if (p === null) return (<><PageHeader title="" back /><Empty icon="🔒" text={t('requestNotFound')} /></>);

  return (
    <>
      <PageHeader title={displayName(p)} back />
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <Stars value={Number(p.avg_rating)} />
          <span className="text-sm text-slate-600">{Number(p.avg_rating).toFixed(1)} · {p.review_count} {t('reviews')} · {p.completed_orders} {t('completedOrders')}</span>
        </div>
        <p className="mt-2 text-sm text-slate-600">📍 {[p.city, countryName(p.country, lang)].filter(Boolean).join(', ')}</p>
        {p.bio && <p className="mt-2 text-sm whitespace-pre-line">{p.bio}</p>}
        {p.website && <a href={p.website} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 block text-sm font-semibold text-red-700">{p.website}</a>}
        <p className="mt-2 text-xs text-slate-400">{t('memberSince', { date: new Date(p.created_at).toLocaleDateString(lang) })}</p>
        {p.category_ids?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.category_ids.map((c) => <span key={c} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{categoryName(c)}</span>)}
          </div>
        )}
        {me.id !== p.id && <div className="mt-3"><ReportButton type="user" id={p.id} /></div>}
      </Card>

      <h2 className="mb-2 font-bold">{t('products')}</h2>
      {products.length === 0 ? <p className="mb-4 text-sm text-slate-500">{t('noData')}</p> : (
        <div className="mb-4 space-y-2">
          {products.map((x) => (
            <Card key={x.id} className="!p-3">
              <p className="font-semibold">{x.name}</p>
              <p className="text-xs text-slate-500">{categoryName(x.category_id)} {x.price != null && `· ${money(x.price, x.currency, lang)} / ${x.unit}`}</p>
              {x.description && <p className="text-sm text-slate-600">{x.description}</p>}
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-2 font-bold">{t('rating')}</h2>
      {reviews.length === 0 ? <p className="text-sm text-slate-500">{t('noReviews')}</p> : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <Card key={r.id} className="!p-3">
              <div className="flex items-center justify-between"><Stars value={r.rating} size="text-sm" /><span className="text-xs text-slate-400">{timeAgo(r.created_at, lang)}</span></div>
              {r.comment && <p className="mt-1 text-sm">{r.comment}</p>}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
