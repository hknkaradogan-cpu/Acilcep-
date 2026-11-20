import { useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { LangSwitch, Logo } from '../components/Layout';
import { Alert, Button, Field, Input } from '../components/ui';

type Mode = 'login' | 'signup' | 'forgot';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <div className="flex items-center justify-between px-5 py-4">
        <Link to="/"><Logo /></Link>
        <LangSwitch />
      </div>
      <div className="mx-auto w-full max-w-md flex-1 px-5 pb-10">{children}</div>
    </div>
  );
}

export default function Auth({ mode }: { mode: Mode }) {
  const { t, lang } = useI18n();
  const { session } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState<'buyer' | 'supplier'>('buyer');
  const [demo, setDemo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const justSignedUp = useRef(false);

  // New users go to their profile first to add country / city.
  if (session && mode !== 'forgot') return <Navigate to={justSignedUp.current ? '/profile?welcome=1' : '/'} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErr('');
    setInfo('');
    setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw new Error(/invalid|not confirmed/i.test(error.message) ? t('invalidLogin') : error.message);
        nav('/', { replace: true });
      } else if (mode === 'signup') {
        justSignedUp.current = true;
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin + import.meta.env.BASE_URL,
            // Only "buyer" or "supplier" are accepted by the database. Admin can never be chosen here.
            data: { role, full_name: fullName.trim(), company_name: company.trim(), language: lang, demo: demo ? 'true' : 'false' },
          },
        });
        if (error) throw error;
        if (data.session) nav('/profile?welcome=1', { replace: true });
        else setInfo(t('checkEmail'));
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + import.meta.env.BASE_URL + 'reset-password',
        });
        if (error) throw error;
        setInfo(t('resetSent'));
      }
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'login' ? t('signIn') : mode === 'signup' ? t('signUp') : t('forgotPassword');

  return (
    <Shell>
      <h1 className="mt-4 mb-6 text-2xl font-extrabold text-slate-900">{title}</h1>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'signup' && (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">{t('iAm')}</span>
              <div className="grid grid-cols-2 gap-2">
                {(['buyer', 'supplier'] as const).map((r) => (
                  <button
                    type="button"
                    key={r}
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                    className={`rounded-2xl p-3 text-left ring-2 transition ${role === r ? 'bg-red-50 ring-red-500' : 'bg-white ring-slate-200'}`}
                  >
                    <div className="text-2xl">{r === 'buyer' ? '🏨' : '🚚'}</div>
                    <div className="mt-1 text-sm font-bold text-slate-900">{r === 'buyer' ? t('roleBuyer') : t('roleSupplier')}</div>
                    <div className="text-xs text-slate-500">{r === 'buyer' ? t('roleBuyerD') : t('roleSupplierD')}</div>
                  </button>
                ))}
              </div>
            </div>
            <Field label={t('fullName')}>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={120} autoComplete="name" />
            </Field>
            <Field label={t('companyName')}>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} required maxLength={160} autoComplete="organization" />
            </Field>
          </>
        )}
        <Field label={t('email')}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" inputMode="email" />
        </Field>
        {mode !== 'forgot' && (
          <Field label={t('password')} hint={mode === 'signup' ? t('passwordHint') : undefined}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </Field>
        )}
        {mode === 'signup' && (
          <label className="flex items-start gap-3 rounded-xl bg-white p-3 ring-1 ring-slate-200">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} className="mt-1 h-4 w-4 accent-red-600" />
            <span>
              <span className="block text-sm font-medium text-slate-800">{t('demoSignup')}</span>
              <span className="block text-xs text-slate-500">{t('demoSignupD')}</span>
            </span>
          </label>
        )}
        <Alert>{err}</Alert>
        <Alert kind="success">{info}</Alert>
        <Button type="submit" loading={busy} className="w-full">
          {mode === 'login' ? t('signIn') : mode === 'signup' ? t('signUp') : t('sendResetLink')}
        </Button>
      </form>
      <div className="mt-6 space-y-2 text-center text-sm text-slate-600">
        {mode === 'login' && (
          <>
            <p><Link to="/forgot" className="font-semibold text-red-700">{t('forgotPassword')}</Link></p>
            <p>{t('noAccount')} <Link to="/signup" className="font-semibold text-red-700">{t('signUp')}</Link></p>
          </>
        )}
        {mode !== 'login' && (
          <p>{t('haveAccount')} <Link to="/login" className="font-semibold text-red-700">{t('signIn')}</Link></p>
        )}
      </div>
    </Shell>
  );
}

export function ResetPassword() {
  const { t } = useI18n();
  const nav = useNavigate();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setErr(errorText(error));
    else nav('/', { replace: true });
  }
  return (
    <Shell>
      <h1 className="mt-4 mb-6 text-2xl font-extrabold text-slate-900">{t('setNewPassword')}</h1>
      <form onSubmit={submit} className="space-y-4">
        <Field label={t('newPassword')} hint={t('passwordHint')}>
          <Input type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Alert>{err}</Alert>
        <Button type="submit" loading={busy} className="w-full">{t('save')}</Button>
      </form>
    </Shell>
  );
}
