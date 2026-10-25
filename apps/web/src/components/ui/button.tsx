'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'focus-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 active:scale-[0.99]',
        secondary: 'border border-line bg-surface text-ink hover:bg-muted',
        outline: 'border border-line bg-transparent text-ink hover:bg-muted',
        ghost: 'text-muted-foreground hover:bg-muted hover:text-ink',
        brand:
          'bg-brand text-brand-foreground shadow-sm hover:bg-brand/90 active:scale-[0.99]',
        subtle: 'bg-muted text-ink hover:bg-muted/70',
        danger: 'bg-danger text-white hover:bg-danger/90',
        link: 'text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4',
        lg: 'h-11 px-5',
        icon: 'h-9 w-9',
        'icon-sm': 'h-8 w-8',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
    // Slot requires exactly one child; the spinner wrapper would break composition.
    if (asChild) {
      return (
        <Slot ref={ref as React.Ref<HTMLElement>} className={cn(buttonVariants({ variant, size }), className)} {...props}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="animate-spin" aria-hidden />
            <span className="sr-only">Đang xử lý</span>
          </>
        ) : null}
        {children}
      </button>
    );
  },
);
Button.displayName = 'Button';
