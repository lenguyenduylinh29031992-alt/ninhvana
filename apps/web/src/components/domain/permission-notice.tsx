'use client';

import { ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** Shown when a user opens a screen their role cannot access. */
export function PermissionNotice() {
  return (
    <Card className="mx-auto mt-16 max-w-md text-center">
      <CardContent className="flex flex-col items-center gap-3 p-8">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShieldCheck className="size-5" />
        </span>
        <p className="font-display text-xl text-ink">Bạn không có quyền truy cập</p>
        <p className="text-xs text-muted-foreground">
          Màn hình này yêu cầu quyền quản trị phù hợp. Liên hệ quản trị viên nếu cần.
        </p>
      </CardContent>
    </Card>
  );
}
