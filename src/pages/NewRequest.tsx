import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, errorText, PHOTO_BUCKET } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { useData } from '../lib/data';
import { CURRENCIES, UNITS, countryOptions } from '../lib/geo';
import { compressImage } from '../lib/image';
import { Alert, Button, Field, Input, PageHeader, Select, Textarea } from '../components/ui';

const WITHIN = [1, 2, 4, 8, 12, 24, 48, 72, 168];

export default function NewRequest() {
  const me = useMe();
  const { t, lang } = useI18n();
  const { categories } = useData();
  const nav = useNavigate();
  const [f, setF] = useState({
    category_id: '',
    title: '',
    description: '',
    quantity: '',
    unit: 'pcs',
    country: me.country ?? '',
    city: me.city ?? '',
    delivery_address: me.address ?? '',
    needed_within_hours: '4',
    currency: me.currency || 'USD',
    budget: '',
  });
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  function pickPhoto(file: File | null) {
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      let photo_path: string | null = null;
      if (photo) {
        const blob = await compressImage(photo);
        const path = `${me.id}/${crypto.randomUUID()}.jpg`;
        const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg' });
        if (up.error) throw up.error;
        photo_path = path;
      }
      const { data, error } = await supabase
        .from('requests')
        .insert({
          buyer_id: me.id,
          category_id: Number(f.category_id),
          title: f.title.trim(),
          description: f.description.trim() || null,
          quantity: Number(f.quantity),
          unit: f.unit,
          photo_path,
          country: f.country,
          city: f.city.trim(),
          delivery_address: f.delivery_address.trim(),
          needed_within_hours: Number(f.needed_within_hours),
          currency: f.currency,
          budget: f.budget ? Number(f.budget) : null,
        })
        .select('id')
        .single();
      if (error) throw error;
      nav(`/requests/${data.id}`, { replace: true });
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t('newRequest')} back />
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('category')}>
          <Select value={f.category_id} onChange={set('category_id')} required>
            <option value="" disabled>—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {lang === 'tr' ? c.name_tr : c.name_en}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('title')}>
          <Input value={f.title} onChange={set('title')} placeholder={t('titlePh')} required minLength={3} maxLength={140} />
        </Field>
        <div className="grid grid-cols-[1fr_7.5rem] gap-3">
          <Field label={t('quantity')}>
            <Input type="number" inputMode="decimal" min="0.01" step="any" value={f.quantity} onChange={set('quantity')} required />
          </Field>
          <Field label={t('unit')}>
            <Select value={f.unit} onChange={set('unit')}>
              {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
            </Select>
          </Field>
        </div>
        <Field label={t('details')} optional={t('optional')}>
          <Textarea value={f.description} onChange={set('description')} placeholder={t('detailsPh')} maxLength={2000} />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('photo')} <span className="font-normal text-slate-400">({t('optional')})</span></span>
          {preview ? (
            <div className="relative">
              <img src={preview} alt="" className="h-48 w-full rounded-xl object-cover" />
              <button type="button" onClick={() => pickPhoto(null)} className="absolute top-2 right-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">✕</button>
            </div>
          ) : (
            <label className="flex h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-white text-slate-500">
              <span className="text-2xl">📷</span>
              <span className="text-sm font-medium">{t('addPhoto')}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} />
            </label>
          )}
        </div>
        <Field label={t('neededWithin')}>
          <Select value={f.needed_within_hours} onChange={set('needed_within_hours')}>
            {WITHIN.map((h) => (
              <option key={h} value={h}>{h < 24 ? `${h} ${t('hours')}` : `${h / 24} ${t('days')}`}</option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('country')}>
            <Select value={f.country} onChange={set('country')} required>
              <option value="" disabled>—</option>
              {countryOptions(lang).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label={t('city')}>
            <Input value={f.city} onChange={set('city')} required maxLength={100} />
          </Field>
        </div>
        <Field label={t('deliveryAddress')}>
          <Textarea rows={2} value={f.delivery_address} onChange={set('delivery_address')} required minLength={3} maxLength={300} />
        </Field>
        <div className="grid grid-cols-[7.5rem_1fr] gap-3">
          <Field label={t('currency')}>
            <Select value={f.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label={t('budget')} optional={t('optional')}>
            <Input type="number" inputMode="decimal" min="0.01" step="any" value={f.budget} onChange={set('budget')} />
          </Field>
        </div>
        <p className="-mt-2 text-xs text-slate-500">{t('currencyHint')}</p>
        <Alert>{err}</Alert>
        <Button type="submit" loading={busy} className="w-full !py-4">{busy ? t('publishing') : t('publish')}</Button>
      </form>
    </>
  );
}
