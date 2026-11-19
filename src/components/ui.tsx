import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { Link, useNavigate } from 'react-router-dom';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm shadow-red-600/20',
  secondary: 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
};

export function Button({
  variant = 'primary',
  loading,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {loading && <Spinner small />}
      {children}
    </button>
  );
}

export function LinkButton({ to, variant = 'primary', className = '', children }: { to: string; variant?: Variant; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

const inputCls =
  'w-full rounded-xl border-0 bg-white px-3.5 py-3 text-base text-slate-900 ring-1 ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-red-500 focus:outline-none disabled:bg-slate-50';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} appearance-auto ${props.className ?? ''}`} />;
}

export function Field({ label, hint, children, optional }: { label: string; hint?: string; optional?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label} {optional && <span className="font-normal text-slate-400">({optional})</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 ${className}`}>{children}</div>;
}

const badgeColors = {
  gray: 'bg-slate-100 text-slate-700',
  red: 'bg-red-50 text-red-700 ring-1 ring-red-200',
  green: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-1 ring-amber-200',
  blue: 'bg-sky-50 text-sky-700 ring-1 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
};
export type BadgeColor = keyof typeof badgeColors;
export function Badge({ color = 'gray', children }: { color?: BadgeColor; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${badgeColors[color]}`}>{children}</span>;
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={`inline-block animate-spin rounded-full border-2 border-current border-r-transparent ${small ? 'h-4 w-4' : 'h-7 w-7 text-red-600'}`}
    />
  );
}

export function Loading() {
  return (
    <div className="flex justify-center py-16">
      <Spinner />
    </div>
  );
}

export function Empty({ icon = '📭', text, children }: { icon?: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-300 px-6 py-10 text-center">
      <div className="text-4xl">{icon}</div>
      <p className="max-w-xs text-sm text-slate-600">{text}</p>
      {children}
    </div>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  if (!children) return null;
  const c = {
    error: 'bg-red-50 text-red-800 ring-red-200',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    info: 'bg-sky-50 text-sky-800 ring-sky-200',
  }[kind];
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3.5 py-3 text-sm ring-1 ${c}`}>{children}</div>;
}

export function PageHeader({ title, back, action }: { title: string; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="mb-4 flex items-center gap-2">
      {back && (
        <button onClick={() => nav(-1)} aria-label="Back" className="-ml-2 rounded-full p-2 text-slate-600 hover:bg-slate-200/60">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      <h1 className="flex-1 truncate text-xl font-bold text-slate-900">{title}</h1>
      {action}
    </div>
  );
}

export function Stars({ value, onChange, size = 'text-xl' }: { value: number; onChange?: (v: number) => void; size?: string }) {
  return (
    <span className={`inline-flex ${size}`} aria-label={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((i) =>
        onChange ? (
          <button type="button" key={i} onClick={() => onChange(i)} className="px-0.5" aria-label={`${i}`}>
            <span className={i <= value ? 'text-amber-400' : 'text-slate-300'}>★</span>
          </button>
        ) : (
          <span key={i} className={i <= Math.round(value) ? 'text-amber-400' : 'text-slate-300'}>★</span>
        ),
      )}
    </span>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex rounded-xl bg-slate-200/70 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${value === o.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
