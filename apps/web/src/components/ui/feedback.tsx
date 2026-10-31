import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line bg-transparent px-6 py-12 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </span>
      ) : null}
      <div>
        <p className="font-display text-lg text-ink">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 pb-1 2xl:flex-row 2xl:items-end 2xl:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="label-xs mb-2.5 flex items-center gap-2 before:h-px before:w-5 before:bg-brand/60">{eyebrow}</p> : null}
        <h1 className="font-display text-[2.15rem] font-medium leading-[1.04] tracking-[-0.02em] text-ink md:text-[2.65rem]">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 2xl:justify-end">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  loading = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: 'default' | 'brand' | 'forest';
  loading?: boolean;
}) {
  return (
    <div className="card-surface relative overflow-hidden p-5">
      {tone !== 'default' ? (
        <span
          className={cn(
            'absolute inset-x-0 top-0 h-px',
            tone === 'brand' ? 'bg-brand/50' : 'bg-forest/40',
          )}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <p className="label-xs">{label}</p>
        {Icon ? (
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" />
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-8 w-28" />
      ) : (
        <p className="tabular mt-3 font-display text-[2rem] leading-none tracking-tight text-ink">
          {value}
        </p>
      )}
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
