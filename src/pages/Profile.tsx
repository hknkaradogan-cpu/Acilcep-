import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useAuth, useMe } from '../lib/auth';
import { useData } from '../lib/data';
import { CURRENCIES, UNITS, countryOptions } from '../lib/geo';
import { money } from '../lib/format';
import type { Product } from '../lib/types';
import InstallButton from '../components/InstallButton';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Select, Textarea } from '../components/ui';

function Products() {
  const me = useMe();
  const { t, lang } = useI18n();
  const { categories, categoryName } = useData();
  const [items, setItems] = useState<Product[]>([]);
  const [f, setF] = useState({ name: '', description: '', price: '', unit: 'pcs', category_id: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const load = useCallback(async () => {
    const { data } = await supabase.from('supplier_products').select('*').eq('supplier_id', me.id).order('created_at', { ascending: false });
    setItems((data as Product[]) ?? []);
  }, [me.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('supplier_products').insert({
      supplier_id: me.id, name: f.name.trim(), description: f.description.trim() || null,
      price: f.price ? Number(f.price) : null, currency: me.currency, unit: f.unit,
      category_id: f.category_id ? Number(f.category_id) : null,
    });
    setBusy(false);
    if (error) return setErr(errorText(error));
    setF({ name: '', description: '', price: '', unit: 'pcs', category_id: '' });
    void load();
  }
  async function remove(id: string) {
    if (!confirm(t('confirm'))) return;
    await supabase.from('supplier_products').delete().eq('id', id);
    void load();
  }

  return (
    <Card className="mb-4">
      <h2 className="mb-3 font-bold">{t('products')}</h2>
      <ul className="mb-4 space-y-2">
        {items.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 p-3">
            <div className="min-w-0">
              <p className="font-semibold">{p.name}</p>
              <p className="text-xs text-slate-500">{categoryName(p.category_id)} {p.price != null && `· ${money(p.price, p.currency, lang)} / ${p.unit}`}</p>
              {p.description && <p className="text-sm text-slate-600">{p.description}</p>}
            </div>
            <button onClick={() => remove(p.id)} className="text-sm text-red-700">{t('delete')}</button>
          </li>
        ))}
      </ul>
      <form onSubmit={add} className="space-y-3 border-t border-slate-100 pt-3">
        <p className="text-sm font-semibold">{t('addProduct')}</p>
        <Input placeholder={t('productName')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} maxLength={120} />
        <Select value={f.category_id} onChange={(e) => setF({ ...f, category_id: e.target.value })} aria-label={t('category')}>
          <option value="">{t('category')} ({t('optional')})</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.icon} {lang === 'tr' ? c.name_tr : c.name_en}</option>)}
        </Select>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Input type="number" min="0" step="any" inputMode="decimal" placeholder={`${t('price')} (${me.currency})`} value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} />
          <Select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} aria-label={t('unit')}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </Select>
        </div>
        <Textarea rows={2} placeholder={t('description')} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} />
        <Alert>{err}</Alert>
        <Button type="submit" variant="secondary" loading={busy} className="w-full">+ {t('addProduct')}</Button>
      </form>
    </Card>
  );
}

function Plans() {
  const me = useMe();
  const { t, lang } = useI18n();
  const plans = [
    { id: 'trial', name: t('planTrial'), d: t('planTrialD') },
    { id: 'basic', name: t('planBasic'), d: t('planBasicD') },
    { id: 'pro', name: t('planPro'), d: t('planProD') },
  ];
  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-bold">{t('plans')}</h2>
        <Badge color="amber">{t('demo')}</Badge>
      </div>
      <Alert kind="info">{t('paymentsNotActive')}</Alert>
      <ul className="mt-3 space-y-2">
        {plans.map((p) => (
          <li key={p.id} className={`rounded-xl p-3 ring-1 ${me.plan === p.id ? 'bg-red-50 ring-red-300' : 'ring-slate-200'}`}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.name}</span>
              {me.plan === p.id ? <Badge color="red">{t('currentPlan')}</Badge> : <Badge>{t('comingSoon')}</Badge>}
            </div>
            <p className="text-sm text-slate-600">{p.d}</p>
            {me.plan === p.id && p.id === 'trial' && me.trial_ends_at && (
              <p className="mt-1 text-xs text-slate-500">{t('trialEnds', { date: new Date(me.trial_ends_at).toLocaleDateString(lang) })}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Profile() {
  const me = useMe();
  const { refreshProfile, signOut, session } = useAuth();
  const { t, lang, setLang } = useI18n();
  const { categories } = useData();
  const [params] = useSearchParams();
  const [f, setF] = useState({
    full_name: me.full_name, company_name: me.company_name, phone: me.phone ?? '', country: me.country ?? '',
    city: me.city ?? '', address: me.address ?? '', bio: me.bio ?? '', website: me.website ?? '', currency: me.currency,
  });
  const [cats, setCats] = useState<number[]>(me.category_ids ?? []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: f.full_name.trim(), company_name: f.company_name.trim(), phone: f.phone.trim() || null,
        country: f.country || null, city: f.city.trim() || null, address: f.address.trim() || null,
        bio: f.bio.trim() || null, website: f.website.trim() || null, currency: f.currency, language: lang,
        category_ids: cats,
      })
      .eq('id', me.id);
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: errorText(error) });
    else {
      setMsg({ kind: 'success', text: t('saved') });
      void refreshProfile();
    }
  }

  const roleLabel = me.role === 'buyer' ? t('roleBuyer') : me.role === 'supplier' ? t('roleSupplier') : t('roleAdmin');

  return (
    <>
      <PageHeader title={t('profile')} />
      {params.get('welcome') && (!me.country || !me.city) && (
        <div className="mb-4"><Alert kind="info"><b>{t('completeProfile')}</b> – {t('completeProfileD')}</Alert></div>
      )}
      <Card className="mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-600 text-lg font-bold text-white">
            {(me.company_name || me.full_name || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{me.company_name || me.full_name}</p>
            <p className="truncate text-sm text-slate-500">{session?.user.email}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge color="red">{roleLabel}</Badge>
            {me.is_demo && <Badge color="amber">{t('demoAccount')}</Badge>}
          </div>
        </div>
        {me.role === 'supplier' && (
          <Link to={`/suppliers/${me.id}`} className="mt-3 block text-sm font-semibold text-red-700">{t('publicProfile')} →</Link>
        )}
      </Card>

      <Card className="mb-4">
        <Field label={t('language')}>
          <Select value={lang} onChange={(e) => setLang(e.target.value as 'en' | 'tr')}>
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </Select>
        </Field>
      </Card>

      <form onSubmit={save}>
        <Card className="mb-4 space-y-4">
          <Field label={t('fullName')}><Input value={f.full_name} onChange={set('full_name')} maxLength={120} /></Field>
          <Field label={t('companyName')}><Input value={f.company_name} onChange={set('company_name')} maxLength={160} /></Field>
          <Field label={t('phone')} hint={t('phoneHint')}><Input type="tel" inputMode="tel" value={f.phone} onChange={set('phone')} maxLength={40} autoComplete="tel" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('country')}>
              <Select value={f.country} onChange={set('country')} required>
                <option value="">—</option>
                {countryOptions(lang).map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label={t('city')}><Input value={f.city} onChange={set('city')} required maxLength={100} /></Field>
          </div>
          <Field label={t('address')} optional={t('optional')}><Textarea rows={2} value={f.address} onChange={set('address')} maxLength={300} /></Field>
          <Field label={t('currency')} hint={t('currencyHint')}>
            <Select value={f.currency} onChange={set('currency')}>
              {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          {me.role === 'supplier' && (
            <>
              <Field label={t('about')} optional={t('optional')}><Textarea value={f.bio} onChange={set('bio')} maxLength={1000} /></Field>
              <Field label={t('website')} optional={t('optional')}><Input type="url" value={f.website} onChange={set('website')} maxLength={200} placeholder="https://" /></Field>
              <div>
                <p className="mb-1 text-sm font-medium text-slate-700">{t('myCategories')}</p>
                <p className="mb-2 text-xs text-slate-500">{t('myCategoriesD')}</p>
                <div className="flex flex-wrap gap-2">
                  {categories.map((c) => {
                    const on = cats.includes(c.id);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setCats(on ? cats.filter((x) => x !== c.id) : [...cats, c.id])}
                        className={`rounded-full px-3 py-1.5 text-sm ring-1 ${on ? 'bg-red-600 text-white ring-red-600' : 'bg-white text-slate-700 ring-slate-200'}`}
                      >
                        {c.icon} {lang === 'tr' ? c.name_tr : c.name_en}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
          <Button type="submit" loading={busy} className="w-full">{t('save')}</Button>
        </Card>
      </form>

      {me.role === 'supplier' && (
        <>
          <Products />
          <Plans />
        </>
      )}

      <div className="space-y-3">
        <InstallButton />
        <Button variant="secondary" className="w-full" onClick={signOut}>{t('signOut')}</Button>
      </div>
    </>
  );
}
