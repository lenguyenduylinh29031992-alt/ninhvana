import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-medium tracking-wide',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-muted text-muted-foreground',
        success: 'border-forest/20 bg-forest-soft text-forest',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        danger: 'border-danger/20 bg-danger-soft text-danger',
        info: 'border-info/20 bg-info-soft text-info',
        champagne: 'border-champagne/25 bg-champagne-soft text-champagne',
        outline: 'border-line bg-transparent text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
