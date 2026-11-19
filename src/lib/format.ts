export function money(amount: number | string | null | undefined, currency: string, lang: string): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = Number(amount);
  try {
    return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

export function num(n: number | string, lang: string): string {
  return new Intl.NumberFormat(lang === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 }).format(Number(n));
}

export function timeAgo(iso: string, lang: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: 'auto' });
  if (diff < 60) return rtf.format(-Math.max(0, Math.round(diff)), 'second');
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
  return rtf.format(-Math.round(diff / 86400), 'day');
}

export function dateTime(iso: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === 'tr' ? 'tr-TR' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function duration(minutes: number, lang: string): string {
  const tr = lang === 'tr';
  if (minutes < 60) return `${minutes} ${tr ? 'dk' : 'min'}`;
  if (minutes < 1440) {
    const h = Math.round((minutes / 60) * 10) / 10;
    return `${h} ${tr ? 'saat' : h === 1 ? 'hour' : 'hours'}`;
  }
  const d = Math.round((minutes / 1440) * 10) / 10;
  return `${d} ${tr ? 'gün' : d === 1 ? 'day' : 'days'}`;
}
