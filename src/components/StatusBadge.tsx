import { useI18n, type TKey } from '../lib/i18n';
import type { OfferStatus, OrderStatus, RequestStatus } from '../lib/types';
import { Badge, type BadgeColor } from './ui';

const reqColor: Record<RequestStatus, BadgeColor> = { open: 'green', awarded: 'blue', cancelled: 'gray', closed: 'violet' };
const offerColor: Record<OfferStatus, BadgeColor> = { pending: 'amber', accepted: 'green', rejected: 'gray', withdrawn: 'gray' };
const orderColor: Record<OrderStatus, BadgeColor> = { confirmed: 'blue', preparing: 'amber', on_the_way: 'violet', delivered: 'green', cancelled: 'gray' };

export function RequestStatusBadge({ s }: { s: RequestStatus }) {
  const { t } = useI18n();
  return <Badge color={reqColor[s]}>{s === 'open' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />}{t(`status_${s}` as TKey)}</Badge>;
}
export function OfferStatusBadge({ s }: { s: OfferStatus }) {
  const { t } = useI18n();
  return <Badge color={offerColor[s]}>{t(`offer_${s}` as TKey)}</Badge>;
}
export function OrderStatusBadge({ s }: { s: OrderStatus }) {
  const { t } = useI18n();
  return <Badge color={orderColor[s]}>{t(`os_${s}` as TKey)}</Badge>;
}
