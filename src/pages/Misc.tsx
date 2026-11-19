import { useI18n } from '../lib/i18n';
import { Logo } from '../components/Layout';
import { LinkButton } from '../components/ui';

export function SetupMissing() {
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Logo />
      <h1 className="text-xl font-bold">{t('setupTitle')}</h1>
      <p className="text-sm text-slate-600">{t('setupD')}</p>
    </div>
  );
}

export function NotFound() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <div className="text-5xl">🧭</div>
      <h1 className="text-xl font-bold">{t('notFound')}</h1>
      <LinkButton to="/">{t('goHome')}</LinkButton>
    </div>
  );
}
