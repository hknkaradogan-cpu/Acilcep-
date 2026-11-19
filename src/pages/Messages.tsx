import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase, errorText } from '../lib/supabase';
import { useI18n } from '../lib/i18n';
import { useMe } from '../lib/auth';
import { useData, fetchPublicProfiles, displayName } from '../lib/data';
import { useLive } from '../lib/useLive';
import { timeAgo } from '../lib/format';
import type { Message, PublicProfile } from '../lib/types';
import ReportButton from '../components/ReportButton';
import { Alert, Empty, Loading, PageHeader } from '../components/ui';

type Thread = { key: string; request_id: string; other: string; last: Message; unread: number; title: string };

export function Inbox() {
  const me = useMe();
  const { t, lang } = useI18n();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [people, setPeople] = useState<Record<string, PublicProfile>>({});

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, requests(title)')
      .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
      .order('created_at', { ascending: false })
      .limit(500);
    const map = new Map<string, Thread>();
    for (const m of (data as (Message & { requests: { title: string } | null })[]) ?? []) {
      const other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
      const key = `${m.request_id}/${other}`;
      const th = map.get(key) ?? { key, request_id: m.request_id, other, last: m, unread: 0, title: m.requests?.title ?? '' };
      if (m.recipient_id === me.id && !m.read_at) th.unread++;
      map.set(key, th);
    }
    const list = [...map.values()];
    setThreads(list);
    setPeople(await fetchPublicProfiles(list.map((x) => x.other)));
  }, [me.id]);
  useEffect(() => {
    void load();
  }, [load]);
  useLive('inbox', [{ table: 'messages' }], load);

  return (
    <>
      <PageHeader title={t('messages')} />
      {!threads ? (
        <Loading />
      ) : threads.length === 0 ? (
        <Empty icon="💬" text={t('noMessages')} />
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
          {threads.map((th) => (
            <Link key={th.key} to={`/messages/${th.key}`} className="flex items-center gap-3 p-3.5 active:bg-slate-50">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-50 font-bold text-red-700">
                {displayName(people[th.other]).slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2">
                  <p className={`truncate ${th.unread ? 'font-bold' : 'font-semibold'} text-slate-900`}>{displayName(people[th.other])}</p>
                  <span className="shrink-0 text-xs text-slate-400">{timeAgo(th.last.created_at, lang)}</span>
                </div>
                <p className="truncate text-xs text-slate-500">{th.title}</p>
                <p className={`truncate text-sm ${th.unread ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{th.last.body}</p>
              </div>
              {th.unread > 0 && <span className="rounded-full bg-red-600 px-2 text-xs font-bold text-white">{th.unread}</span>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export function Chat() {
  const { requestId, otherId } = useParams();
  const me = useMe();
  const { t, lang } = useI18n();
  const { refreshCounts } = useData();
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [other, setOther] = useState<PublicProfile | undefined>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!requestId || !otherId) return;
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('request_id', requestId)
      .or(`and(sender_id.eq.${me.id},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me.id})`)
      .order('created_at')
      .limit(500);
    setMsgs((data as Message[]) ?? []);
    if ((data as Message[])?.some((m) => m.recipient_id === me.id && !m.read_at)) {
      await supabase.rpc('mark_messages_read', { p_request: requestId, p_other: otherId });
      refreshCounts();
    }
  }, [requestId, otherId, me.id, refreshCounts]);

  useEffect(() => {
    void load();
    if (!requestId || !otherId) return;
    fetchPublicProfiles([otherId]).then((p) => setOther(p[otherId]));
    supabase.from('requests').select('title').eq('id', requestId).maybeSingle().then(({ data }) => setTitle(data?.title ?? ''));
  }, [load, requestId, otherId]);
  useLive(requestId ? `chat-${requestId}` : null, [{ table: 'messages', filter: `request_id=eq.${requestId}` }], load);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [msgs?.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    setErr('');
    const { error } = await supabase.from('messages').insert({ request_id: requestId, sender_id: me.id, recipient_id: otherId, body: text });
    setBusy(false);
    if (error) setErr(errorText(error));
    else {
      setBody('');
      void load();
    }
  }

  return (
    <>
      <PageHeader title={displayName(other)} back action={otherId && <ReportButton type="user" id={otherId} />} />
      {title && (
        <Link to={`/requests/${requestId}`} className="mb-3 block truncate rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
          {t('aboutRequest', { t: title })}
        </Link>
      )}
      {!msgs ? (
        <Loading />
      ) : (
        <div className="space-y-2 pb-24">
          {msgs.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t('noMessages')}</p>}
          {msgs.map((m) => {
            const mine = m.sender_id === me.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-[15px] ${mine ? 'rounded-br-md bg-red-600 text-white' : 'rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200'}`}>
                  <p className="whitespace-pre-line break-words">{m.body}</p>
                  <p className={`mt-0.5 text-[10px] ${mine ? 'text-red-100' : 'text-slate-400'}`}>{timeAgo(m.created_at, lang)}{mine && m.read_at ? ' · ✓✓' : ''}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
      )}
      <form onSubmit={send} className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 border-t border-slate-200 bg-white px-3 py-2">
        <div className="mx-auto flex max-w-2xl gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder={t('messagePh')}
            className="flex-1 rounded-full bg-slate-100 px-4 py-2.5 text-base focus:ring-2 focus:ring-red-500 focus:outline-none"
          />
          <button disabled={busy || !body.trim()} className="rounded-full bg-red-600 px-5 font-semibold text-white disabled:opacity-50">{t('send')}</button>
        </div>
        {err && <div className="mx-auto mt-2 max-w-2xl"><Alert>{err}</Alert></div>}
      </form>
    </>
  );
}
