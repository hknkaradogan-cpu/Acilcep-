import { useState, type FormEvent } from 'react';
import { supabase, errorText } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { Alert, Button, Textarea } from './ui';

export default function ReportButton({ type, id }: { type: 'user' | 'request' | 'offer' | 'message' | 'order'; id: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('reports').insert({ reporter_id: u.user?.id, target_type: type, target_id: id, reason: reason.trim() });
    setBusy(false);
    if (error) setMsg({ kind: 'error', text: errorText(error) });
    else {
      setMsg({ kind: 'success', text: t('reportSent') });
      setReason('');
      setTimeout(() => setOpen(false), 1500);
    }
  }

  if (!open)
    return (
      <button onClick={() => { setOpen(true); setMsg(null); }} className="text-xs font-medium text-slate-500 underline-offset-2 hover:underline">
        ⚑ {t('report')}
      </button>
    );
  return (
    <form onSubmit={submit} className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
      <p className="text-sm text-slate-700">{t('reportD')}</p>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={1000} placeholder={t('reason')} />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} className="flex-1">{t('cancel')}</Button>
        <Button type="submit" loading={busy} className="flex-1">{t('send')}</Button>
      </div>
    </form>
  );
}
