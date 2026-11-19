import { useEffect, useState } from 'react';
import { useI18n } from '../lib/i18n';
import { Button } from './ui';

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Shows "Install app" on Android Chrome when the browser allows installing the PWA. */
export default function InstallButton() {
  const { t } = useI18n();
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  useEffect(() => {
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (!evt) return null;
  return (
    <Button variant="secondary" className="w-full" onClick={async () => { await evt.prompt(); setEvt(null); }}>
      📲 {t('install')}
    </Button>
  );
}
