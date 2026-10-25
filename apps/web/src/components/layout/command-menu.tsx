'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Moon, Search, Sun } from 'lucide-react';
import { hasPermission, type SessionUser } from '@grand-suite/shared';
import { useI18n } from '@/lib/i18n';
import { NAV_SECTIONS } from '@/lib/navigation';
import { useTheme } from '@/lib/theme';

export function CommandMenu({
  open,
  onOpenChange,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: SessionUser;
}) {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { theme, toggle } = useTheme();
  const permissions = user.permissions ?? [];

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('common.commandMenu')}
      className="fixed left-1/2 top-[15%] z-[60] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="size-4 text-muted-foreground" aria-hidden />
        <Command.Input
          autoFocus
          placeholder={t('common.commandHint')}
          className="h-12 w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted-foreground/70"
        />
        <kbd className="rounded border border-line bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          ESC
        </kbd>
      </div>
      <Command.List className="max-h-[420px] overflow-y-auto p-2">
        <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
          {t('common.noResults')}
        </Command.Empty>

        {NAV_SECTIONS.map((section) => {
          const items = section.items.filter((item) => {
            if (item.phase) return false;
            if (item.permission && !hasPermission(permissions, item.permission)) return false;
            if (item.anyPermission && !hasPermission(permissions, item.anyPermission, 'any')) return false;
            return true;
          });
          if (items.length === 0) return null;
          return (
            <Command.Group key={section.key} heading={t(section.labelKey as never)}>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={`${t(item.labelKey as never)} ${item.href}`}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink data-[selected=true]:bg-muted"
                  >
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {t(item.labelKey as never)}
                  </Command.Item>
                );
              })}
            </Command.Group>
          );
        })}

        <Command.Group heading="Hành động">
          <Command.Item
            value="theme giao diện sáng tối"
            onSelect={() => {
              toggle();
              onOpenChange(false);
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink data-[selected=true]:bg-muted"
          >
            {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {theme === 'dark' ? t('common.light') : t('common.dark')}
          </Command.Item>
          <Command.Item
            value="language ngôn ngữ english tiếng việt"
            onSelect={() => {
              setLocale(locale === 'vi' ? 'en' : 'vi');
              onOpenChange(false);
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink data-[selected=true]:bg-muted"
          >
            <span className="flex size-4 items-center justify-center text-[10px] font-semibold">A</span>
            {locale === 'vi' ? 'English' : 'Tiếng Việt'}
          </Command.Item>
          <Command.Item
            value="profile hồ sơ cá nhân"
            onSelect={() => go('/profile')}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink data-[selected=true]:bg-muted"
          >
            <span className="flex size-4 items-center justify-center text-[10px] font-semibold">@</span>
            {t('common.profile')}
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
