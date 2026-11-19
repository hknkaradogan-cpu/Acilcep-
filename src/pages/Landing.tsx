import { useI18n } from '../lib/i18n';
import { LangSwitch, Logo } from '../components/Layout';
import { LinkButton } from '../components/ui';

export default function Landing() {
  const { t } = useI18n();
  const steps = [
    { n: 1, h: t('step1'), d: t('step1d') },
    { n: 2, h: t('step2'), d: t('step2d') },
    { n: 3, h: t('step3'), d: t('step3d') },
  ];
  return (
    <div className="min-h-dvh bg-white">
      <section className="relative overflow-hidden bg-gradient-to-br from-red-600 via-red-600 to-orange-500 px-5 pt-5 pb-14 text-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Logo light />
          <div className="rounded-full bg-white/90"><LangSwitch /></div>
        </div>
        <div className="mx-auto mt-12 max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide uppercase">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> {t('slogan')}
          </p>
          <h1 className="text-[2rem] leading-tight font-extrabold sm:text-5xl">{t('tagline')}</h1>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton to="/signup" variant="secondary" className="!text-red-700 sm:w-auto">{t('getStarted')}</LinkButton>
            <LinkButton to="/login" className="!bg-white/15 !shadow-none ring-1 ring-white/40 hover:!bg-white/25">{t('signIn')}</LinkButton>
          </div>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-24 h-72 w-72 rounded-full bg-white/10" />
      </section>

      <section className="mx-auto max-w-2xl px-5 py-10">
        <h2 className="mb-5 text-lg font-bold text-slate-900">{t('howItWorks')}</h2>
        <ol className="space-y-4">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 font-bold text-red-700 ring-1 ring-red-200">{s.n}</span>
              <div>
                <p className="font-semibold text-slate-900">{s.h}</p>
                <p className="text-sm text-slate-600">{s.d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto grid max-w-2xl gap-3 px-5 pb-12 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
          <div className="mb-2 text-2xl">🏨 🍽️ ☕</div>
          <p className="font-bold text-slate-900">{t('forBuyers')}</p>
          <p className="text-sm text-slate-600">{t('forBuyersD')}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-200">
          <div className="mb-2 text-2xl">🚚 📦 🔧</div>
          <p className="font-bold text-slate-900">{t('forSuppliers')}</p>
          <p className="text-sm text-slate-600">{t('forSuppliersD')}</p>
        </div>
      </section>
      <footer className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">© {new Date().getFullYear()} ACİLCEP · Emergency Supply Network</footer>
    </div>
  );
}
