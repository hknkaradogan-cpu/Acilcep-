import { Link } from 'react-router-dom';
import type { SupplyRequest } from '../lib/types';
import { useI18n } from '../lib/i18n';
import { useData } from '../lib/data';
import { countryName } from '../lib/geo';
import { duration, num, timeAgo } from '../lib/format';
import { photoUrl } from '../lib/supabase';
import { RequestStatusBadge } from './StatusBadge';
import { Badge } from './ui';

export default function RequestCard({ r, offerCount, extra }: { r: SupplyRequest; offerCount?: number; extra?: React.ReactNode }) {
  const { t, lang } = useI18n();
  const { categoryName } = useData();
  const img = photoUrl(r.photo_path);
  return (
    <Link
      to={`/requests/${r.id}`}
      className={`flex gap-3 rounded-2xl bg-white p-3.5 shadow-sm ring-1 transition active:scale-[0.99] ${r.is_featured ? 'ring-amber-300' : 'ring-slate-200/70'}`}
    >
      {img ? (
        <img src={img} alt="" loading="lazy" className="h-20 w-20 shrink-0 rounded-xl bg-slate-100 object-cover" />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-3xl">
          {categoryName(r.category_id).split(' ')[0] || '📦'}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <RequestStatusBadge s={r.status} />
          {r.is_featured && <Badge color="amber">★ {t('featured')}</Badge>}
          {r.is_demo && <Badge color="amber">{t('demo')}</Badge>}
        </div>
        <p className="truncate font-semibold text-slate-900">{r.title}</p>
        <p className="truncate text-sm text-slate-600">
          {num(r.quantity, lang)} {r.unit} · {r.city}, {countryName(r.country, lang)}
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
          <span>⏱ {t('needIn', { t: duration(r.needed_within_hours * 60, lang) })}</span>
          <span>{timeAgo(r.created_at, lang)}</span>
          {offerCount !== undefined && <span className="font-semibold text-slate-700">{t('offersCount', { n: offerCount })}</span>}
        </p>
        {extra}
      </div>
    </Link>
  );
}
